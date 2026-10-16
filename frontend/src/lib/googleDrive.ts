// Google Drive 백업/복원 — GIS OAuth 토큰 + Drive API v3.
import {backupFileName} from './backupInfo'
// 사용자별 Google 계정으로 인증 → 본인 Drive에만 접근 (drive.file scope).

// 환경변수가 없으면 기존 하드코딩 클라이언트 ID를 그대로 사용한다.
const DEFAULT_CLIENT_ID = '806295714332-ogbgd18j1n90atd8j9u46brus5ad2tuc.apps.googleusercontent.com'
const SCOPES = 'https://www.googleapis.com/auth/drive.file'
// drive.file 범위에서는 이 앱이 만든 파일·폴더만 보인다 → 앱이 만든 고정 폴더 하나에 모두 저장.
export const BACKUP_FOLDER_NAME = 'MyAssetManager 백업'
/** 수동 "Drive에 저장" 파일명 — 매번 같은 파일을 덮어쓴다(자동 백업은 날짜별 이름). */
export const MANUAL_BACKUP_FILE_NAME = 'asset-manager-backup.json'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const env = (key: keyof ImportMetaEnv): string => String(import.meta.env?.[key] ?? '').trim()
const clientId = () => env('VITE_GOOGLE_CLIENT_ID') || DEFAULT_CLIENT_ID

// ── 타입 ───────────────────────────────────────────────────
interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  scope?: string
  error?: string
  error_description?: string
}
interface TokenClient { requestAccessToken: (opts?: { prompt?: string; include_granted_scopes?: boolean }) => void }

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            include_granted_scopes?: boolean
            callback: (response: TokenResponse) => void
            error_callback?: (e: { type?: string; message?: string }) => void
          }) => TokenClient
          revoke?: (token: string, done?: () => void) => void
        }
      }
    }
  }
}

export interface DriveFile { id: string; name: string; modifiedTime: string; appProperties?: Record<string, string> }

// ── 오류 ───────────────────────────────────────────────────
export type DriveErrorKind = 'auth' | 'forbidden' | 'not_found' | 'temporary' | 'other'
export class DriveError extends Error {
  constructor(message: string, readonly kind: DriveErrorKind, readonly status?: number) { super(message) }
}

/** GIS 로그인 오류 → 사용자 메시지. popup_closed/popup_failed_to_open(error_callback), access_denied(callback). */
export function gisErrorMessage(e: unknown): string {
  const code = typeof e === 'string' ? e : (e as { type?: string; error?: string } | null)?.type ?? (e as { error?: string } | null)?.error
  switch (code) {
    case 'popup_closed': return '로그인 창이 닫혔습니다. 다시 시도해 주세요.'
    case 'popup_failed_to_open': return '로그인 팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해 주세요.'
    case 'access_denied': return 'Google Drive 접근 권한이 거부되었습니다. 권한을 허용해야 백업할 수 있습니다.'
    default: return '로그인 실패. 잠시 후 다시 시도해 주세요.'
  }
}

/** Drive HTTP 상태(없으면 네트워크 오류) → DriveError. */
export function driveError(status: number | undefined, action: string): DriveError {
  if (status === 401) return new DriveError(`${action} 실패: 로그인이 만료되었습니다. 다시 로그인해 주세요.`, 'auth', status)
  if (status === 403) return new DriveError(`${action} 실패: 권한이 없거나 Drive 사용 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.`, 'forbidden', status)
  if (status === 404) return new DriveError(`${action} 실패: 파일이 없거나 이 앱에 접근 권한이 없습니다 (앱이 만든 파일만 열 수 있음).`, 'not_found', status)
  if (status === undefined || status >= 500 || status === 429) return new DriveError(`${action} 실패: 일시적인 오류입니다 (네트워크·Google 서버). 잠시 후 다시 시도해 주세요.`, 'temporary', status)
  return new DriveError(`${action} 실패 (HTTP ${status})`, 'other', status)
}

// ── 토큰 관리 ───────────────────────────────────────────────
// 토큰은 메모리에만 둔다(새로고침 시 사라짐). 만료 60초 전부터 만료로 본다.
const EXPIRY_MARGIN_MS = 60_000
let accessToken: string | null = null
let expiresAt = 0
let tokenClient: TokenClient | null = null
let tokenClientOwner: unknown = null
let folderPromise: Promise<string> | null = null
let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null
const listeners = new Set<() => void>()

function notify() { for (const fn of listeners) fn() }
/** 로그인 상태 변경(로그인·로그아웃·만료·401) 구독. 해제 함수 반환. */
export function onAuthChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function clearToken() {
  const had = accessToken !== null
  accessToken = null
  expiresAt = 0
  folderPromise = null   // 다른 계정으로 다시 로그인할 수 있으므로 폴더 id 도 버린다
  if (had) notify()
}

export function getAccessToken(): string | null {
  if (accessToken && Date.now() >= expiresAt) clearToken()
  return accessToken
}

export function isLoggedIn(): boolean {
  return getAccessToken() !== null
}

export function logout(): void {
  const token = accessToken
  clearToken()
  // GIS 토큰 취소 — 다음 로그인 때 계정 선택·동의를 다시 받는다
  if (token) window.google?.accounts?.oauth2?.revoke?.(token, () => {})
}

/** 토큰 클라이언트는 한 번만 만든다(GIS 스크립트가 바뀌면 다시 생성). */
function getTokenClient(): TokenClient {
  const oauth2 = window.google!.accounts.oauth2
  if (tokenClient && tokenClientOwner === oauth2) return tokenClient
  tokenClientOwner = oauth2
  tokenClient = oauth2.initTokenClient({
    client_id: clientId(),
    scope: SCOPES,
    // 같은 OAuth 클라이언트에 이전에 부여된 다른 scope(YouTube 등)가 합쳐지면 400 — drive.file 만 요청
    include_granted_scopes: false,
    callback: (response) => {
      const p = pending; pending = null
      if (response.error || !response.access_token) { p?.reject(new Error(gisErrorMessage(response.error ?? 'unknown'))); return }
      // 세분화 동의에서 Drive 권한을 해제한 경우
      if (response.scope && !response.scope.split(' ').includes(SCOPES)) { p?.reject(new Error(gisErrorMessage('access_denied'))); return }
      const seconds = Number(response.expires_in)
      accessToken = response.access_token
      expiresAt = Date.now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000 - EXPIRY_MARGIN_MS
      notify()
      p?.resolve(accessToken)
    },
    error_callback: (err) => {
      const p = pending; pending = null
      p?.reject(new Error(gisErrorMessage(err)))
    },
  })
  return tokenClient
}

/** Google 로그인 (팝업) → access token 획득. 사용자 탭(제스처) 안에서 await 전에 호출해야 팝업이 열린다. */
export function googleSignIn(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google 스크립트 로드 실패. 새로고침 후 재시도.'))
      return
    }
    pending?.reject(new Error('새 로그인 요청으로 대체되었습니다.'))
    pending = { resolve, reject }
    // prompt:'' — 동의 화면은 처음(또는 권한이 없을 때)만 표시, 기존 부여 scope 병합 안 함
    getTokenClient().requestAccessToken({ prompt: '', include_granted_scopes: false })
  })
}

/** 유효 토큰이 없으면 로그인. 버튼 핸들러 첫 줄에서 호출(제스처 유지). */
export async function ensureSignedIn(): Promise<string> {
  return getAccessToken() ?? googleSignIn()
}

function requireToken(): string {
  const t = getAccessToken()
  if (!t) throw new DriveError('Google 로그인이 필요합니다.', 'auth')
  return t
}

/** 토큰을 붙여 fetch. 네트워크 오류·비정상 상태를 DriveError로 바꾸고, 401이면 토큰을 지운다. */
async function driveFetch(url: string, action: string, init: RequestInit = {}): Promise<Response> {
  const token = requireToken()
  let r: Response
  try {
    r = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` } })
  } catch {
    throw driveError(undefined, action)
  }
  if (!r.ok) {
    if (r.status === 401) clearToken()
    throw driveError(r.status, action)
  }
  return r
}

// ── Drive API ───────────────────────────────────────────────
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const MAX_LIST_PAGES = 10   // 100개 × 10쪽 — 무한 루프 방지

/** Drive 검색어(q) 문자열 리터럴 이스케이프 — 역슬래시와 작은따옴표. */
export function driveQuote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/** 앱 백업 폴더 id 조회 (없으면 null). 같은 이름이 여럿이면 가장 먼저 만든 폴더. */
async function findBackupFolder(): Promise<string | null> {
  const params = new URLSearchParams({
    q: `name=${driveQuote(BACKUP_FOLDER_NAME)} and mimeType='${FOLDER_MIME}' and trashed=false`,
    orderBy: 'createdTime', pageSize: '1', fields: 'files(id)',
  })
  const r = await driveFetch(`${DRIVE_API}/files?${params}`, '백업 폴더 확인')
  return (await r.json() as { files?: { id: string }[] }).files?.[0]?.id ?? null
}

/** 앱 백업 폴더 id — 없으면 만든다. 동시에 여러 번 불려도 한 번만 조회·생성(실패 시 다음 호출에서 재시도). */
export function ensureBackupFolder(): Promise<string> {
  requireToken()
  folderPromise ??= (async () => {
    const found = await findBackupFolder()
    if (found) return found
    const r = await driveFetch(`${DRIVE_API}/files?fields=id`, '백업 폴더 만들기', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ name: BACKUP_FOLDER_NAME, mimeType: FOLDER_MIME }),
    })
    return (await r.json() as { id: string }).id
  })().catch(e => { folderPromise = null; throw e })
  return folderPromise
}

/** 앱 백업 폴더 안의 JSON 백업 목록(수정 시각 최신순). 폴더가 아직 없으면 빈 목록. nextPageToken을 끝까지 따라간다.
 *  앱이 만들지 않은 파일은 drive.file 범위라 보이지 않는다 → 설정의 '가져오기'(로컬 파일)로 연다. */
export async function listBackupFiles(): Promise<DriveFile[]> {
  requireToken()
  const folderId = await (folderPromise ?? findBackupFolder())
  if (!folderId) return []
  const q = `${driveQuote(folderId)} in parents and mimeType='application/json' and trashed=false`
  const out: DriveFile[] = []
  let pageToken: string | undefined
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const params = new URLSearchParams({
      q, orderBy: 'modifiedTime desc', pageSize: '100',
      fields: 'nextPageToken,files(id,name,modifiedTime,appProperties)',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const r = await driveFetch(`${DRIVE_API}/files?${params}`, '파일 목록 조회')
    const d = await r.json() as { files?: DriveFile[]; nextPageToken?: string }
    out.push(...(d.files ?? []))
    pageToken = d.nextPageToken
    if (!pageToken) break
  }
  return out
}

/** 목록에서 가장 최근 백업(수동 고정 파일·자동 백업 구분 없이 modifiedTime 기준). */
export function latestBackupFile(files: DriveFile[]): DriveFile | null {
  return files.reduce<DriveFile | null>((best, f) => !best || (f.modifiedTime ?? '') > (best.modifiedTime ?? '') ? f : best, null)
}

/** Drive에 백업 저장 (같은 폴더에 같은 이름이 있으면 업데이트, 없으면 생성).
 *  folderId 를 주지 않으면 앱 백업 폴더(ensureBackupFolder)에 저장한다 — 수동·자동 백업 공통.
 *  같은 이름 조회가 실패하면 중복 파일이 쌓이지 않게 저장도 중단(throw)한다. */
export async function saveToDrive(
  jsonData: string,
  folderId?: string,
  opts: { fileName?: string; appProperties?: Record<string, string> } = {},
): Promise<{ id: string; name: string }> {
  requireToken()
  const fileName = opts.fileName ?? backupFileName(JSON.parse(jsonData).exportedAt??new Date().toISOString())
  const parent = folderId ?? await ensureBackupFolder()

  // 같은 폴더의 같은 이름 파일 검색 (실패 시 throw)
  const query = `name=${driveQuote(fileName)} and ${driveQuote(parent)} in parents and trashed=false`
  const listR = await driveFetch(`${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`, '같은 이름 파일 확인')
  const existingId: string | undefined = (await listR.json()).files?.[0]?.id

  // multipart 업로드 (metadata + content). PATCH 에서는 parents 를 바꿀 수 없으므로 생성 때만 지정
  const metadata: Record<string, unknown> = { name: fileName, mimeType: 'application/json' }
  if (opts.appProperties) metadata.appProperties = opts.appProperties
  if (!existingId) metadata.parents = [parent]

  const boundary = 'asset_manager_boundary'
  const body = `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${jsonData}\r\n` +
    `--${boundary}--`

  const method = existingId ? 'PATCH' : 'POST'
  const url = existingId
    ? `${DRIVE_UPLOAD}/files/${existingId}?uploadType=multipart&fields=id,name`
    : `${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id,name`

  const r = await driveFetch(url, 'Drive 저장', {
    method,
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  return r.json()
}

/** Drive 파일 삭제 (drive.file 범위 — 이 앱이 만든 파일만 가능). */
export async function deleteDriveFile(fileId: string): Promise<void> {
  await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, '오래된 백업 삭제', { method: 'DELETE' })
}

/** Drive에서 파일 다운로드 → JSON 문자열. */
export async function loadFromDrive(fileId: string): Promise<string> {
  const r = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, '파일 다운로드')
  return r.text()
}
