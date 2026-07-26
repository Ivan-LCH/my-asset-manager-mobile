// Google Drive 백업/복원 — GIS OAuth 토큰 + Drive API v3.
// 사용자별 Google 계정으로 인증 → 본인 Drive에만 접근 (drive.file scope).

const CLIENT_ID = '806295714332-jc5h95el81jdqopvga1l1d1bsmdvj2er.apps.googleusercontent.com'
const SCOPES = 'https://www.googleapis.com/auth/drive.file'
const APP_FILE_PREFIX = 'asset-manager-backup'

// ── 타입 ───────────────────────────────────────────────────
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: { access_token: string }) => void
            error_callback?: (e: unknown) => void
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void }
        }
      }
      picker?: {
        PickerBuilder: new () => PickerBuilder
        ViewId: { DOCS: string; FOLDERS: string }
        Feature: { NAV_HIDDEN: string; MINE_ONLY: string }
        DocsView: new () => DocsView
      }
      gapi?: {
        load: (api: string, callback: () => void) => void
        auth?: { authorize: (config: unknown, callback: (token: unknown) => void) => void }
      }
    }
  }
}

interface PickerBuilder {
  addView: (view: unknown) => PickerBuilder
  enableFeature: (feature: string) => PickerBuilder
  setOAuthToken: (token: string) => PickerBuilder
  setCallback: (callback: (data: PickerData) => void) => PickerBuilder
  setTitle: (title: string) => PickerBuilder
  build: () => { setVisible: (visible: boolean) => void }
}

interface DocsView {
  setIncludeFolders: (v: boolean) => DocsView
  setSelectFolderEnabled: (v: boolean) => DocsView
  setParent: (parent: string) => DocsView
}

interface PickerData {
  action: string  // 'picked' | 'cancel'
  docs?: Array<{ id: string; name: string; type: string }>
}

// ── 토큰 관리 ───────────────────────────────────────────────
let accessToken: string | null = null

export function getAccessToken(): string | null {
  return accessToken
}

export function isLoggedIn(): boolean {
  return accessToken !== null
}

export function logout(): void {
  accessToken = null
  // Google 토큰 취소
  if (accessToken && window.google?.accounts?.oauth2) {
    // GIS는 토큰 취소 API가 별도로 없음 — 세션에서만 제거
  }
}

/** Google 로그인 (팝업) → access token 획득. */
export function googleSignIn(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google 스크립트 로드 실패. 새로고침 후 재시도.'))
      return
    }
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response: { access_token: string }) => {
        accessToken = response.access_token
        resolve(accessToken)
      },
      error_callback: (err: unknown) => {
        reject(new Error('로그인 취소 또는 실패'))
      },
    })
    tokenClient.requestAccessToken({ prompt: 'consent' })
  })
}

// ── Drive API ───────────────────────────────────────────────
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

/** 백업 파일 목록 조회 (앱에서 만든 파일만). */
export async function listBackupFiles(): Promise<{ id: string; name: string; modifiedTime: string }[]> {
  if (!accessToken) throw new Error('로그인 필요')
  const r = await fetch(
    `${DRIVE_API}/files?q=name+contains+'${APP_FILE_PREFIX}'+and+trashed%3Dfalse&orderBy=modifiedTime+desc&fields=files(id,name,modifiedTime)&pageSize=20`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!r.ok) throw new Error('파일 목록 조회 실패')
  const d = await r.json()
  return d.files ?? []
}

/** Drive에 백업 저장 (같은 이름이 있으면 업데이트, 없으면 생성). folderId 지정 시 해당 폴더에. */
export async function saveToDrive(jsonData: string, folderId?: string): Promise<{ id: string; name: string }> {
  if (!accessToken) throw new Error('로그인 필요')
  const fileName = `${APP_FILE_PREFIX}-${new Date().toISOString().slice(0, 10)}.json`

  // 같은 이름 파일 검색
  let existingId: string | undefined
  const query = folderId
    ? `name='${fileName}' and '${folderId}' in parents and trashed=false`
    : `name='${fileName}' and trashed=false`
  const listR = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (listR.ok) {
    const listD = await listR.json()
    existingId = listD.files?.[0]?.id
  }

  // multipart 업로드 (metadata + content)
  const metadata: Record<string, unknown> = { name: fileName, mimeType: 'application/json' }
  if (folderId) metadata.parents = [folderId]

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

  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  if (!r.ok) throw new Error('Drive 저장 실패')
  return r.json()
}

/** Drive에서 파일 다운로드 → JSON 문자열. */
export async function loadFromDrive(fileId: string): Promise<string> {
  if (!accessToken) throw new Error('로그인 필요')
  const r = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!r.ok) throw new Error('파일 다운로드 실패')
  return r.text()
}

/** Google Picker로 폴더 선택 → folderId + folderName 반환. */
export function pickFolder(): Promise<{ id: string; name: string } | null> {
  return new Promise((resolve) => {
    if (!accessToken) { resolve(null); return }
    if (!window.google?.picker) { resolve(null); return }

    const view = new window.google.picker.DocsView()
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)

    const picker = new window.google.picker.PickerBuilder()
      .addView(view)
      .enableFeature(window.google.picker.Feature.MINE_ONLY)
      .setOAuthToken(accessToken)
      .setTitle('저장할 폴더 선택')
      .setCallback((data: PickerData) => {
        if (data.action === 'picked' && data.docs?.[0]) {
          resolve({ id: data.docs[0].id, name: data.docs[0].name })
        } else if (data.action === 'cancel') {
          resolve(null)
        }
      })
      .build()
    picker.setVisible(true)
  })
}
