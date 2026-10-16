/// <reference types="vite/client" />
// vite define으로 주입되는 빌드 시각 (vite.config.ts)
declare const __BUILD_TIME__: string

// 선택 환경변수 (frontend/.env.example 참고). 빌드 시점에 번들에 들어간다.
interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string
}
