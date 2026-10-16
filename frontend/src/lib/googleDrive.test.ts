import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 외부 접속 없는 모의 GIS/Drive. 모듈 상태(토큰)를 테스트마다 초기화한다.
type Drive = typeof import('./googleDrive')
let drive: Drive
let tokenResponse: Record<string, unknown>
let errorType: string | null
const revoke = vi.fn()
const initTokenClient = vi.fn()
const requestAccessToken = vi.fn()

function stubGis(withRevoke = true) {
  initTokenClient.mockImplementation((options: any) => ({
    requestAccessToken: (opts: unknown) => {
      requestAccessToken(opts)
      if (errorType) options.error_callback({ type: errorType })
      else options.callback(tokenResponse)
    },
  }))
  vi.stubGlobal('window', { google: { accounts: { oauth2: { initTokenClient, ...(withRevoke ? { revoke } : {}) } } } })
}

beforeEach(async () => {
  vi.resetModules()
  revoke.mockReset(); initTokenClient.mockReset(); requestAccessToken.mockReset()
  tokenResponse = { access_token: 'tok-1', expires_in: 3599, scope: 'https://www.googleapis.com/auth/drive.file' }
  errorType = null
  stubGis()
  drive = await import('./googleDrive')
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('Google 토큰', () => {
  it('logout 은 토큰을 지운 뒤 기존 토큰으로 revoke 호출', async () => {
    await drive.googleSignIn()
    expect(drive.isLoggedIn()).toBe(true)
    drive.logout()
    expect(drive.isLoggedIn()).toBe(false)
    expect(drive.getAccessToken()).toBeNull()
    expect(revoke).toHaveBeenCalledTimes(1)
    expect(revoke.mock.calls[0][0]).toBe('tok-1')
    drive.logout()   // 토큰 없으면 revoke 안 함
    expect(revoke).toHaveBeenCalledTimes(1)
  })

  it('revoke 가 없는 GIS 환경에서도 logout 이 실패하지 않음', async () => {
    stubGis(false)
    await drive.googleSignIn()
    expect(() => drive.logout()).not.toThrow()
    expect(drive.isLoggedIn()).toBe(false)
  })

  it("prompt:'' + include_granted_scopes:false 로 요청하고 토큰 클라이언트는 한 번만 만든다", async () => {
    await drive.googleSignIn()
    tokenResponse = { ...tokenResponse, access_token: 'tok-2' }
    await drive.googleSignIn()
    expect(initTokenClient).toHaveBeenCalledTimes(1)
    // 이전에 부여된 다른 scope(YouTube 등)와 합쳐지면 GIS 가 400 을 내므로 병합을 끈다
    expect(initTokenClient.mock.calls[0][0]).toMatchObject({
      scope: 'https://www.googleapis.com/auth/drive.file',
      include_granted_scopes: false,
    })
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: '', include_granted_scopes: false })
    expect(drive.getAccessToken()).toBe('tok-2')
  })

  it('expires_in 에서 60초 뺀 시각부터 로그아웃 상태', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-15T00:00:00Z'))
    tokenResponse = { ...tokenResponse, expires_in: 3600 }
    const changes = vi.fn(); drive.onAuthChange(changes)
    await drive.googleSignIn()
    vi.setSystemTime(new Date('2026-10-15T00:58:59Z'))
    expect(drive.isLoggedIn()).toBe(true)
    vi.setSystemTime(new Date('2026-10-15T00:59:00Z'))
    expect(drive.isLoggedIn()).toBe(false)
    expect(changes).toHaveBeenCalledTimes(2)   // 로그인 + 만료
    await expect(drive.listBackupFiles()).rejects.toThrow('로그인이 필요')
  })

  it('Drive 401 응답이면 토큰을 지우고 로그인 만료 메시지', async () => {
    await drive.googleSignIn()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })))
    await expect(drive.listBackupFiles()).rejects.toThrow('로그인이 만료')
    expect(drive.isLoggedIn()).toBe(false)
  })

  it.each([
    ['popup_closed', '창이 닫혔'],
    ['popup_failed_to_open', '팝업이 차단'],
  ])('GIS error_callback %s → 구체적 메시지', async (type, text) => {
    errorType = type
    await expect(drive.googleSignIn()).rejects.toThrow(text)
    expect(drive.isLoggedIn()).toBe(false)
  })

  it('access_denied 응답과 Drive 권한 해제(세분화 동의)는 권한 거부 메시지', async () => {
    tokenResponse = { error: 'access_denied' }
    await expect(drive.googleSignIn()).rejects.toThrow('접근 권한이 거부')
    tokenResponse = { access_token: 'tok', expires_in: 3600, scope: 'openid' }
    await expect(drive.googleSignIn()).rejects.toThrow('접근 권한이 거부')
    expect(drive.isLoggedIn()).toBe(false)
  })

  it('VITE_GOOGLE_CLIENT_ID 가 있으면 사용, 없으면 기존 ID', async () => {
    await drive.googleSignIn()
    expect(initTokenClient.mock.calls[0][0].client_id).toMatch(/^806295714332-/)
    vi.resetModules(); initTokenClient.mockClear()
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'custom-id.apps.googleusercontent.com')
    const fresh = await import('./googleDrive')
    await fresh.googleSignIn()
    expect(initTokenClient.mock.calls[0][0].client_id).toBe('custom-id.apps.googleusercontent.com')
  })
})

describe('Drive 오류 매핑', () => {
  it.each([
    [401, 'auth', '로그인이 만료'],
    [403, 'forbidden', '권한이 없거나'],
    [404, 'not_found', '파일이 없거나'],
    [500, 'temporary', '일시적인 오류'],
    [503, 'temporary', '일시적인 오류'],
    [undefined, 'temporary', '일시적인 오류'],
    [418, 'other', 'HTTP 418'],
  ])('status %s → %s', (status, kind, text) => {
    const e = drive.driveError(status as number | undefined, '테스트')
    expect(e.kind).toBe(kind)
    expect(e.message).toContain(text)
  })

  it('네트워크 오류·403·404 를 상태별로 구분해 throw', async () => {
    await drive.googleSignIn()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(drive.loadFromDrive('x')).rejects.toMatchObject({ kind: 'temporary' })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })))
    await expect(drive.loadFromDrive('x')).rejects.toMatchObject({ kind: 'not_found', status: 404 })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403 })))
    await expect(drive.saveToDrive('{"exportedAt":"2026-10-15T00:00:00Z"}')).rejects.toMatchObject({ kind: 'forbidden' })
    expect(drive.isLoggedIn()).toBe(true)   // 401 이외에는 토큰 유지
  })

  it('같은 이름 조회가 실패하면 업로드하지 않고 throw', async () => {
    await drive.googleSignIn()
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(drive.saveToDrive('{"exportedAt":"2026-10-15T00:00:00Z"}', 'folder-1', { fileName: 'asset-manager-backup-auto-x.json' })).rejects.toThrow('같은 이름 파일 확인')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('같은 이름이 있으면 PATCH 로 갱신, appProperties 포함', async () => {
    await drive.googleSignIn()
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return { ok: true, json: async () => ({ id: 'f1', name: 'n' }) }
      return { ok: true, json: async () => ({ files: [{ id: 'f1' }] }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    await drive.saveToDrive('{}', 'folder-1', { fileName: 'n', appProperties: { assetManagerAuto: '1' } })
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(String(patch[0])).toContain('/files/f1?')
    expect(String(patch[1]!.body)).toContain('"assetManagerAuto":"1"')
    expect((patch[1]!.headers as Record<string, string>).Authorization).toBe('Bearer tok-1')
  })
})

describe('백업 목록', () => {
  it('nextPageToken 을 끝까지 따라가고 JSON mimeType 으로 거른다', async () => {
    await drive.googleSignIn()
    const pages: Record<string, unknown> = {
      '': { files: [{ id: 'a', name: 'asset-manager-backup-1.json', modifiedTime: '2026-10-03' }], nextPageToken: 'p2' },
      p2: { files: [{ id: 'b', name: 'asset-manager-backup-2.json', modifiedTime: '2026-10-02' }], nextPageToken: 'p3' },
      p3: { files: [{ id: 'c', name: 'asset-manager-backup-3.json', modifiedTime: '2026-10-01' }] },
    }
    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(url)
      if (u.searchParams.get('q')?.includes('google-apps.folder')) return { ok: true, json: async () => ({ files: [{ id: 'folder-1' }] }) }
      return { ok: true, json: async () => pages[u.searchParams.get('pageToken') ?? ''] }
    })
    vi.stubGlobal('fetch', fetchMock)
    const files = await drive.listBackupFiles()
    expect(files.map(f => f.id)).toEqual(['a', 'b', 'c'])
    expect(fetchMock).toHaveBeenCalledTimes(4)   // 폴더 조회 1 + 목록 3쪽
    const q = new URL(fetchMock.mock.calls[1][0]).searchParams
    expect(q.get('q')).toContain("mimeType='application/json'")
    expect(q.get('q')).toContain("'folder-1' in parents")
    expect(q.get('pageSize')).toBe('100')
    expect(drive.latestBackupFile(files)?.id).toBe('a')
  })

  it('앱 폴더가 아직 없으면 빈 목록 (폴더를 만들지 않음)', async () => {
    await drive.googleSignIn()
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ files: [] }) }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await drive.listBackupFiles()).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('최신 백업은 수동 고정 파일·자동 백업 구분 없이 modifiedTime 기준', () => {
    expect(drive.latestBackupFile([])).toBeNull()
    expect(drive.latestBackupFile([
      { id: 'auto', name: 'asset-manager-backup-auto-x.json', modifiedTime: '2026-10-14T00:00:00Z' },
      { id: 'manual', name: 'asset-manager-backup.json', modifiedTime: '2026-10-15T00:00:00Z' },
    ])?.id).toBe('manual')
  })
})

describe('앱 백업 폴더', () => {
  it('Drive 검색어 따옴표·역슬래시 이스케이프', () => {
    expect(drive.driveQuote("it's")).toBe("'it\\'s'")
    expect(drive.driveQuote('a\\b')).toBe("'a\\\\b'")
    expect(drive.driveQuote(drive.BACKUP_FOLDER_NAME)).toBe("'MyAssetManager 백업'")
  })

  it('폴더가 없으면 한 번 만들고, 이후 저장은 그 폴더에 (폴더 id 재사용)', async () => {
    await drive.googleSignIn()
    const posts: { url: string; body: string }[] = []
    let created = false
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: String(init.body) })
        if (!url.includes('/upload/')) { created = true; return { ok: true, json: async () => ({ id: 'new-folder' }) } }
        return { ok: true, json: async () => ({ id: 'file-1', name: drive.MANUAL_BACKUP_FILE_NAME }) }
      }
      return { ok: true, json: async () => ({ files: [] }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    await Promise.all([drive.ensureBackupFolder(), drive.ensureBackupFolder()])
    expect(posts).toHaveLength(1)   // 동시 호출도 한 번만 생성
    expect(created).toBe(true)
    const folderQ = new URL(fetchMock.mock.calls[0][0]).searchParams.get('q')!
    expect(folderQ).toContain("name='MyAssetManager 백업'")
    expect(folderQ).toContain("mimeType='application/vnd.google-apps.folder'")
    expect(folderQ).toContain('trashed=false')
    expect(JSON.parse(posts[0].body)).toEqual({ name: 'MyAssetManager 백업', mimeType: 'application/vnd.google-apps.folder' })

    const r = await drive.saveToDrive('{}', undefined, { fileName: drive.MANUAL_BACKUP_FILE_NAME })
    expect(r.name).toBe('asset-manager-backup.json')
    expect(posts).toHaveLength(2)   // 폴더 재생성 없음, 파일 업로드만
    expect(posts[1].body).toContain('"parents":["new-folder"]')
    const sameName = fetchMock.mock.calls.map(([u]) => decodeURIComponent(String(u))).find(u => u.includes("name='asset-manager-backup.json'"))!
    expect(sameName).toContain("'new-folder' in parents")
  })

  it('로그아웃하면 폴더 id 캐시도 버린다 (다른 계정 대비)', async () => {
    await drive.googleSignIn()
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ files: [{ id: 'folder-a' }] }) }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await drive.ensureBackupFolder()).toBe('folder-a')
    await drive.ensureBackupFolder()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    drive.logout()
    await drive.googleSignIn()
    await drive.ensureBackupFolder()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
