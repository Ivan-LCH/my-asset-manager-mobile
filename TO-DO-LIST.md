# TO-DO LIST — My Asset Manager (Mobile PWA)

> 범례: [/] 진행중 · [O] 적용완료 · [C] 사용자 확인완료 · [S] 보류 · [ ] 미진행

## 프로젝트 목표
원본 `asset_manager`(웹+서버)를 **폰 단독 실행 PWA**로 컨버전한 별도 프로젝트.
- 백엔드/서버 없음 — IndexedDB로 폰 로컬 저장
- 정적 호스팅(Vercel/Netlify 등)에 한 번 배포 → 지인이 URL 접속 + "홈 화면 추가"
- 데이터는 폰을 떠나지 않음 (프라이버시 ◎)
- 원본은 사용자가 계속 사용 중이므로 손대지 않음

---

## 🔵 Phase M: 모바일 컨버전

### 코어 (백엔드 제거 + 로컬 DB)
- [O] **M-1. 백엔드 제거 / IndexedDB 전환** — 가장 큰 작업
  - ✓ 데이터 레이어: `lib/db.ts`(Dexie) + 5개 훅(`useAssets/useHistory/useSettings/useDividends/useRetirement`) db 연결 + `useStocks`는 no-op 스텁(M-2 수동입력 대기) + `lib/api.ts` 제거 + 빌드·테스트 통과
  - 클라이언트 ffill 차트: `lib/chartData.ts` + `chartData.test.ts` (**date-fns**)
  - **백엔드 잔여물 정리** (예정): `backend/`, `requirements.txt`, `entrypoint.sh`, `service_account.json`, `start_server.sh`, `server.pid`, `.streamlit/`, `.env`
  - `vite.config.ts`의 `/api` → `http://localhost:8090` 프록시 제거 (백엔드 사라지므로 dead)
  - ⚠️ **보존**: `docker-compose.yml`, `Dockerfile` — 프론트 dev 워크플로(CLAUDE.md "빌드 & 실행" 참조)

- [O] **M-2. 시세 업데이트 정책** — 수동 입력 모달 구현 완료
  - ✓ `StockPriceUpdateModal`: 종목별 단가 입력 → 오늘 날짜 이력 반영 (db.updateHistory 가 value·currentValue 동기화)
  - StockPage "시세 업데이트" 버튼 → 모달 오픈. `useStocks.ts`(no-op 스텁) 제거
  - (b) CORS 프록시/Cloudflare Worker 자동 갱신은 미구현 (향후 옵션)

- [O] **M-3. 데이터 백업/복원 (JSON export/import)**
  - ✓ `db.ts`: `exportBackup()` / `importBackup()` (모든 Dexie 테이블 스냅샷)
  - ✓ `Settings.tsx`: "내보내기(JSON 다운로드)" / "가져오기(파일 업로드 → 전체 덮어쓰기)" 버튼

### 모바일 UI/UX  (네비게이션 = **햄버거 드로어**, 분기점 = Tailwind `lg:` 1024px)
> 페이지는 이미 부분 반응형(`p-4 md:p-6`, `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, `max-w-7xl mx-auto`)이라 핵심 보강 위주.
> dev 서버(Tailscale 100.71.46.21:5173)에서 **각 Phase 후 폰 새로고침으로 확인**.
>
> **M-번호 재배치 노트**: 원래 TO-DO의 M-번호를 실행 순서에 맞춰 재배치함.
> - 원래 M-4(레이아웃+nav+KPI) → **M-4**(nav) + **M-5a**(KPI, 신규)
> - 원래 M-5(차트) → **M-5b**
> - 원래 M-7(터치 UX)·M-8(폼) 순서를 서로 바꿈 → **M-7**(모달), **M-8**(폼)
> - 각 항목의 "(Phase N)"은 실행 순서.

- [O] **M-4. 반응형 레이아웃 & 네비게이션** (Phase 1 — 가장 큰 레버)
  - **`components/layout/Sidebar.tsx`**: `NAV_ITEMS`/`PLAN_ITEMS` 배열 그대로, 데스크톱용은 `hidden lg:flex`(`w-56`) — `DrawerNav` 추출(드로어와 공유)
  - **`components/layout/AppLayout.tsx`**: 듀얼 렌더 + 모바일 상단 헤더 + 드로어
    - 구조: `<Sidebar hidden lg:flex>` + `<div flex-col>(<MobileHeader lg:hidden> + <main>)` + `<MobileDrawer lg:hidden>`
    - 분기점 `lg:`(1024px): 폰은 세로/가로 무조건 모바일 햄버거, 태블릿·PC만 사이드바
    - `MobileHeader`: ☰(lucide `Menu`) 버튼 + 💼 로고, `sticky top-0`
    - `MobileDrawer`: `fixed inset-y-0 left-0 w-64 transform transition` + 반투명 오버레이 `fixed inset-0 bg-black/60 z-40`
    - **동일 nav 배열** 재사용(데스크톱 사이드바와 공유). NavLink 클릭·라우트 변경 시 자동 닫힘(`useLocation` effect)
    - 드로어 open 상태는 AppLayout `useState` 하나로 관리
  - 검증: 사이드바→햄버거 전환, 메뉴 이동 후 자동 닫힘

- [O] **M-5a. KPI 그리드 & 카드** (Phase 2)
  - **`components/common/KpiCard.tsx`** 모바일 축소: 패딩 `px-3 py-3 sm:px-4 sm:py-4`, 값 `text-base sm:text-lg break-words`, 라벨 `text-[11px] sm:text-xs`
  - `pages/{Dashboard,RealEstatePage,PensionPage,RetirementPage}.tsx` 의 bare `grid-cols-3` → `grid-cols-3 gap-2 sm:gap-3` (카드 축소로 360px 대응)
  - `pages/StockPage.tsx`는 이미 `grid-cols-2 sm:grid-cols-4` ✓ (그대로)

- [O] **M-5b. 차트 & 컨트롤** (Phase 3)
  - **`PeriodFilter.tsx`**: 컨테이너 `flex-wrap gap-1` → 모바일 2줄 줄바꿈(현재 6버튼=270px 한 줄 오버플로)
  - **`AssetChart.tsx`**: 토글 줄은 `flex-wrap gap-2` 유지; 차트 높이 **280→220**; `<YAxis width={60}→44, fontSize 11→10>`; 툴바 `min-w-[160px]→140/120`
  - **`PensionPage.tsx`** 시뮬 차트: `<YAxis width={52}→40, fontSize 10>`
  - **`Dashboard.tsx`** 자산 비중 바: 이름칸 `w-28→w-20 sm:w-28`, 값칸 `w-24 hidden sm:block` ✓
  - 검증: 차트 폭 맞음, 토글/기간필터 줄바꿈, 가로스크롤 없음

- [O] **M-6. 테이블 터치 친화화** (Phase 4 — 터치 보강 먼저, 카드 변환은 추후 옵션)
  - **`HistoryTable.tsx`** / **`DividendSection.tsx`**: 수정·삭제 버튼 `p-1→p-2`, 아이콘 `w-3 h-3→w-4 h-4`, **항상 노출**(hover 게이트 제거 — 터치엔 hover 없음)
  - 표 자체는 `text-xs` 유지(날짜/단가/수량/평가액 4~5열, 단가·수량은 STOCK/PHYSICAL에만)
  - `RetirementPage` 14열 표는 이미 `overflow-x-auto` → 가로스크롤 허용(그대로)
  - **페이지 전반 작은 아이콘 버튼 보강**: `AccountCard`, `StockTile`, `RealEstateTile`, 자산 카드 등의 연필/삭제 아이콘 — `p-2`, `w-4 h-4`, hover 게이트 제거
  - (선택) 전체 카드 변환은 별도 후순위
  - 검증: 이력/배당 행 버튼 손가락으로 잘 눌림

- [O] **M-7. 모달 모바일 풀스크린 & 터치** (Phase 6)
  - **`components/common/AssetModal.tsx`**: outer 래퍼 `p-0 sm:p-4`, 내부 컨테이너 `w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-2xl`
  - `ConfirmDialog.tsx`(`w-80`)는 그대로
  - 검증: 자산 추가/상세 모달이 폰에서 풀스크린, 스크롤 됨

- [O] **M-8. 입력 폼 / 숫자 키패드** (Phase 5)
  - **`AssetCreateForm.tsx`** / **`AssetForm.tsx`**: 숫자 input(`type="number"`)에 `inputMode="decimal"` 추가(모바일 숫자 키패드). 최소 변경
  - 날짜 input은 이미 `type="date"` ✓ (변경 없음)

### 배포
- [O] **M-9. PWA 적용**
  - vite-plugin-pwa 도입
  - manifest.json (name/short_name/theme_color/배경/아이콘 192·512)
  - service worker (정적 자산 캐싱, 캐시 우선)
  - iOS Safari 메타태그 (apple-touch-icon, apple-mobile-web-app-capable)

- [/] **M-10. 정적 호스팅 배포 (Vercel)** — 코드 준비 완료, 사용자 계정으로 배포 필요
  - ✓ `frontend/vercel.json` (SPA 라우팅 rewrite + sw.js no-cache 헤더)
  - ✓ `npm run build` → `dist/` (PWA manifest/SW/아이콘 포함) 정상 생성
  - ▶ 배포 명령 (사용자 실행 — Vercel 로그인 필요):
    `npm i -g vercel && cd frontend && vercel && vercel --prod`
    (Vercel 프롬프트에서 Framework=Preset=Vite, Root Directory=`frontend`, Build=`npm run build`, Output=`dist`)
  - 배포 URL → 지인 공유 → 폰에서 "홈 화면 추가" (HTTPS이므로 PWA 설치 프롬프트 작동)

---

## 참고
- 원본 프로젝트: `/root/my_prog/asset_manager` (서버 기반, 사용자 사용 중)
- 본 프로젝트는 원본을 rsync 복사로 시작 (`.git` history 동일)
- 작업 우선순위: M-1(데이터 레이어 전환) → M-4·5·6·7(모바일 UI) → M-9(PWA) → M-10(배포) → M-2·3·8(부가)
