// Google Drive 백업/복원 — GIS OAuth 토큰 + Drive API v3.
import {backupFileName} from './backupInfo'
// 사용자별 Google 계정으로 인증 → 본인 Drive에만 접근 (drive.file scope).

// 환경변수가 없으면 기존 하드코딩 클라이언트 ID를 그대로 사용한다.
const DEFAULT_CLIENT_ID = '806295714332-jc5h95el81jdqopvga1l1d1bsmdvj2er.apps.googleusercontent.com'
const SCOPES = 'https://www.googleapis.com/auth/drive.file'
const APP_FILE_PREFIX = 'asset-manager-backup'
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
interface TokenClient { requestAccessToken: (opts?: { prompt?: string }) => void }

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: TokenResponse) => void
            error_callback?: (e: { type?: string; message?: string }) => void
          }) => TokenClient
          revoke?: (token: string, done?: () => void) => void
        }
      }
      picker?: {
        PickerBuilder: new () => PickerBuilder
        ViewId: { DOCS: string; FOLDERS: string }
        Feature: { NAV_HIDDEN: string; MINE_ONLY: string }
        DocsView: new (viewId?: string) => DocsView
      }
    }
    // api.js 가 정의하는 로더 — window.google 아래가 아니라 최상위 window.gapi
    gapi?: {
      load: (api: string, callback: (() => void) | { callback: () => void; onerror?: () => void; timeout?: number; ontimeout?: () => void }) => void
    }
  }
}

interface PickerBuilder {
  addView: (view: unknown) => PickerBuilder
  enableFeature: (feature: string) => PickerBuilder
  setOAuthToken: (token: string) => PickerBuilder
  setDeveloperKey: (key: string) => PickerBuilder
  setAppId: (appId: string) => PickerBuilder
  setCallback: (callback: (data: PickerData) => void) => PickerBuilder
  setTitle: (title: string) => PickerBuilder
  build: () => { setVisible: (visible: boolean) => void }
}

interface DocsView {
  setIncludeFolders: (v: boolean) => DocsView
  setSelectFolderEnabled: (v: boolean) => DocsView
  setParent: (parent: string) => DocsView
  setMimeTypes: (mimeTypes: string) => DocsView
  setQuery: (query: string) => DocsView
}

interface PickerData {
  action: string  // 'picked' | 'cancel' | 'loaded'
  docs?: Array<{ id: string; name: string; mimeType?: string }>
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
    // prompt:'' — 동의 화면은 처음(또는 권한이 없을 때)만 표시
    getTokenClient().requestAccessToken({ prompt: '' })
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

/** 백업 파일 목록 조회 (앱에서 만든 파일·Picker로 고른 JSON 파일). nextPageToken을 끝까지 따라간다. */
export async function listBackupFiles(): Promise<DriveFile[]> {
  const q = `name contains '${APP_FILE_PREFIX}' and mimeType='application/json' and trashed=false`
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

/** Drive에 백업 저장 (같은 이름이 있으면 업데이트, 없으면 생성). folderId 지정 시 해당 폴더에.
 *  같은 이름 조회가 실패하면 중복 파일이 쌓이지 않게 저장도 중단(throw)한다. */
export async function saveToDrive(
  jsonData: string,
  folderId?: string,
  opts: { fileName?: string; appProperties?: Record<string, string> } = {},
): Promise<{ id: string; name: string }> {
  requireToken()
  const fileName = opts.fileName ?? backupFileName(JSON.parse(jsonData).exportedAt??new Date().toISOString())

  // 같은 이름 파일 검색 (실패 시 throw)
  const query = folderId
    ? `name='${fileName}' and '${folderId}' in parents and trashed=false`
    : `name='${fileName}' and trashed=false`
  const listR = await driveFetch(`${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`, '같은 이름 파일 확인')
  const existingId: string | undefined = (await listR.json()).files?.[0]?.id

  // multipart 업로드 (metadata + content). PATCH 에서는 parents 를 바꿀 수 없으므로 생성 때만 지정
  const metadata: Record<string, unknown> = { name: fileName, mimeType: 'application/json' }
  if (opts.appProperties) metadata.appProperties = opts.appProperties
  if (folderId && !existingId) metadata.parents = [folderId]

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

// ── Google Picker ───────────────────────────────────────────
/** Picker는 API 키와 앱 ID(Cloud 프로젝트 번호)가 모두 설정된 경우에만 쓴다. */
export function pickerConfigured(): boolean {
  return !!(env('VITE_GOOGLE_API_KEY') && env('VITE_GOOGLE_APP_ID'))
}

/** api.js 의 gapi.load('picker') 로 Picker 라이브러리를 불러온다. */
function loadPickerApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.picker) { resolve(); return }
    if (!window.gapi?.load) { reject(new Error('Google Picker 스크립트 로드 실패. 새로고침 후 재시도.')); return }
    window.gapi.load('picker', {
      callback: () => window.google?.picker ? resolve() : reject(new Error('Google Picker를 불러오지 못했습니다.')),
      onerror: () => reject(new Error('Google Picker를 불러오지 못했습니다.')),
      timeout: 10000,
      ontimeout: () => reject(new Error('Google Picker 로드 시간 초과')),
    })
  })
}

function openPicker(view: DocsView, title: string, token: string): Promise<{ id: string; name: string } | null> {
  const picker = window.google!.picker!
  return new Promise((resolve) => {
    new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(env('VITE_GOOGLE_API_KEY'))
      // setAppId: 고른 파일에 drive.file 접근 권한을 부여(없으면 이후 다운로드가 404)
      .setAppId(env('VITE_GOOGLE_APP_ID'))
      .setTitle(title)
      .setCallback((data: PickerData) => {
        if (data.action === 'picked' && data.docs?.[0]) resolve({ id: data.docs[0].id, name: data.docs[0].name })
        else if (data.action === 'cancel') resolve(null)
      })
      .build()
      .setVisible(true)
  })
}

/** Google Picker로 폴더 선택 → folderId + folderName 반환. */
export async function pickFolder(): Promise<{ id: string; name: string } | null> {
  if (!pickerConfigured()) return null
  const token = requireToken()
  await loadPickerApi()
  const view = new window.google!.picker!.DocsView(window.google!.picker!.ViewId.FOLDERS)
    .setIncludeFolders(true)
    .setSelectFolderEnabled(true)
  return openPicker(view, '저장할 폴더 선택', token)
}

/** Google Picker로 백업 JSON 파일 선택(직접 업로드한 파일 포함) → {id,name}. */
export async function pickBackupFile(): Promise<{ id: string; name: string } | null> {
  if (!pickerConfigured()) return null
  const token = requireToken()
  await loadPickerApi()
  const view = new window.google!.picker!.DocsView(window.google!.picker!.ViewId.DOCS)
    .setMimeTypes('application/json')
    .setQuery(APP_FILE_PREFIX)
  return openPicker(view, '복원할 백업 파일 선택', token)
}
