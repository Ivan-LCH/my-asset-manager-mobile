# TO-DO ARCHIVE — My Asset Manager

> 완료된 작업들의 기록

---

## 2026-04-10 — 프로젝트 초기화

- [C] Streamlit 기반 기존 프로젝트 분석 (app.py 1359줄, database.py)
- [C] 기존 프로젝트 백업 (`/root/my_prog/backup_asset_manager`)
- [C] 신규 프로젝트 디렉토리 구조 생성 (FastAPI + React + TypeScript)
- [C] 문서 6종 작성
  - [C] 1단계 요구사항 정의서
  - [C] 2단계 시스템 설계서 (DB 스키마, 아키텍처)
  - [C] 3단계 기술 규격 및 API 상세 명세
  - [C] 4단계 구현 상세 가이드
  - [C] 5단계 기능 완료 보고서 (체크리스트)
  - [C] 6단계 운영 매뉴얼
- [C] CLAUDE.md 작성
- [C] TO-DO-LIST.md 초안 작성

---

## 2026-04-22 — Phase 7: UI 전면 개선 확인완료

### 버그 수정
- [C] 7-1. 전체 자산현황 차트 미표시 버그 수정 — `acquisition_date` None 처리 (`crud.py`)

### 대시보드
- [C] 7-2. 자산 비중 차트 — 도넛 + 가로 비율 바 테이블 조합으로 개선
- [C] 7-3. 레이아웃 모바일 대응 — 자산비중 / 자산성장추이 각 1줄씩 배치

### 공통 모달 시스템
- [C] 7-4. `AssetModal.tsx` 공통 모달 컴포넌트 (ESC 닫기, 배경 클릭 닫기, 스크롤)
- [C] 7-5. 전체 페이지 일관된 모달 상세 뷰 적용

### 부동산 페이지
- [C] 7-6. 자산 목록 타일 그리드 + 모달 상세
- [C] 7-7. 타일 내 순자산/부채/손익률 핵심 지표 시각화

### 주식 페이지
- [C] 7-8. 계좌 카드 그리드 → 종목 타일 → 모달 3단 구조
- [C] 7-9. 계좌 카드 — 보유 종목 미리보기 3개 + 계좌 합산 손익
- [C] 7-10. 브레드크럼 네비게이션 (전체 → 계좌명)
- [C] 7-11. 계좌 요약 배너 (계좌 선택 후 상단 고정)
- [C] 7-12 (추가). 계좌 선택 시 해당 계좌 차트 연동 — `account` 쿼리 파라미터 추가, `groupBy="name"` 전환
- [C] 7-13 (추가). 차트 항목 최근 평가액 기준 내림차순 정렬

### 연금 페이지
- [C] 7-14. 연금 자산 타일 그리드 + 모달 상세
- [C] 7-15. 연금형 포함 자산 별도 타일 섹션

### 예적금 / 실물 / 기타 페이지
- [C] 7-16. 자산 타일 그리드 + 모달 상세 (공통 AssetPage 적용)

### 이력 관리
- [C] 7-17. 이력 테이블 고정 높이(max-h-64) + 내부 스크롤 + thead sticky

### 공통 컴포넌트
- [C] 7-18. KpiCard — 상단 컬러 바 + 컬러별 배경 tint
- [C] 7-19. AssetDetail — InfoCell 카드 스타일, 정보 밀도 개선
- [C] 7-20. 전체 기능 테스트 (사용자 확인완료)
- [C] 7-21. TO-DO-ARCHIVE.md 정리

---

## 2026-04-10 — Phase 1~6 전체 구현 완료

### Phase 1: 백엔드 기반
- [C] 1-1. `backend/core/config.py` — 환경설정 (DB 경로, CORS 등)
- [C] 1-2. `backend/db/database.py` — SQLAlchemy async 엔진, 세션, init_db()
- [C] 1-3. `backend/db/models.py` — ORM 모델 7개 테이블
- [C] 1-4. `backend/db/crud.py` — CRUD 함수 전체
- [C] 1-5. `backend/api/assets.py` — 자산 CRUD + 차트 집계 API
- [C] 1-6. `backend/api/history.py` — 이력 API (수량 전파 포함)
- [C] 1-7. `backend/api/stocks.py` — 주가 업데이트 API
- [C] 1-8. `backend/api/settings.py` — 설정 API
- [C] 1-9. `backend/services/stock_updater.py` — yfinance 업데이트 서비스
- [C] 1-10. `backend/main.py` — FastAPI 앱 진입점
- [C] 1-11. `requirements.txt` 작성

### Phase 2: 프론트엔드 기반 구조
- [C] 2-1. `frontend/` — Vite + React + TypeScript 프로젝트 생성
- [C] 2-2. Tailwind CSS 설정 (shadcn 미사용, 직접 구현)
- [C] 2-3. `src/types/index.ts` — TypeScript 타입 정의
- [C] 2-4. `src/lib/api.ts` — API 클라이언트
- [C] 2-5. `src/lib/utils.ts` — 포맷팅 유틸
- [C] 2-6. React Query 설정 (QueryClientProvider)
- [C] 2-7. `src/hooks/` — useAssets, useHistory, useSettings, useChart, useStocks
- [C] 2-8. `src/App.tsx` — React Router 라우팅
- [C] 2-9. `src/components/layout/` — AppLayout, Sidebar
- [C] 2-10. `vite.config.ts` — 프록시 설정

### Phase 3: 대시보드
- [C] 3-1. `src/pages/Dashboard.tsx`
- [C] 3-2. KPI 카드 3종 (총자산/부채/순자산)
- [C] 3-3. 자산 비중 도넛 차트
- [C] 3-4. 자산 성장 추이 Area Chart
- [C] 3-5 ~ 3-8. 공통 컴포넌트 4종

### Phase 4: 자산 유형별 페이지 (공통)
- [C] 4-1 ~ 4-8. AssetPage, AssetDetail, HistoryTable, AssetForm, AssetCreateForm 전체

### Phase 5: 특수 기능
- [C] 5-1 ~ 5-5. StockPage (계좌별/종목별), PensionPage (시뮬레이션) 전체

### Phase 6: 인프라
- [C] 6-1. `src/pages/Settings.tsx` — 설정 페이지
- [C] 6-2. `Dockerfile` 작성
- [C] 6-3. `docker-compose.yml` 작성
- [C] 6-4. `start_server.sh` 작성
- [C] 6-5. 기존 DB 데이터 이관 확인 (자산 36개 정상 조회)
- [C] 6-6. Docker 빌드 & 배포 검증

---

## 2026-07-08 — 모바일 PWA 컨버전 (Phase M) 전체 완료
> 원본 `asset_manager`(웹+서버) → 폰 단독 실행 PWA 컨버전 완료. 운영 배포: https://my-asset-manager-mobile-ivansproject.vercel.app

### 코어 (백엔드 제거 + 로컬 DB)
- [C] **M-1. 백엔드 제거 / IndexedDB 전환**
  - ✓ 데이터 레이어: `lib/db.ts`(Dexie) + 훅 db 연결 + `lib/api.ts` 제거
  - 클라이언트 ffill 차트: `lib/chartData.ts` + 테스트 (**date-fns**)
  - 백엔드 잔여물 정리: `backend/`, `requirements.txt`, `entrypoint.sh`, `service_account.json`, `start_server.sh`, `server.pid`, `.streamlit/`, `.env` + vite `/api` 프록시 제거
  - 보존: `docker-compose.yml`, `Dockerfile` (프론트 dev 워크플로)
- [C] **M-2. 시세 업데이트** — 자동(서버리스 `/api/price` Yahoo 연동) + 1탭 자동 저장 (모달 제거)
- [C] **M-3. 데이터 백업/복원** — `exportBackup`/`importBackup` + Settings 내보내기/가져오기 + 마이그레이션 도구 `scripts/migrate-from-server.py`

### 모바일 UI/UX (네비게이션 = 햄버거 드로어, 분기점 `lg:` 1024px)
- [C] **M-4. 반응형 레이아웃 & 네비게이션** — `Sidebar`/`AppLayout` 듀얼 렌더, 모바일 상단 헤더 + 슬라이드인 드로어
- [C] **M-5a. KPI 그리드 & 카드** — `KpiCard` 모바일 축소 + 그리드 간격 반응형
- [C] **M-5b. 차트 & 컨트롤** — `AssetChart` 높이/YAxis/툴바 축소, `PeriodFilter` 모바일 드롭다운
- [C] **M-6. 테이블 터치 친화화** — 행 버튼 히트영역 확대·항상 노출
- [C] **M-7. 모달 모바일 풀스크린** — `AssetModal` outer `p-0 sm:p-4`, inner 풀스크린
- [C] **M-8. 입력 폼 / 숫자 키패드** — 숫자 input `inputMode="decimal"` 일괄 적용

### 배포
- [C] **M-9. PWA 적용** — vite-plugin-pwa(manifest+SW+아이콘), iOS 메타
- [C] **M-10. 정적 호스팅 배포 (Vercel)** — `frontend/vercel.json` SPA rewrite, Vercel import(Root Directory=`frontend`), HTTPS 배포 완료

### 추가 (Phase M 완료 후 신규)
- [C] **투자법인 시뮬레이터** (새 메뉴 `/corp-sim`) — `lib/corpSim.ts` 순수 계산 + Before/After 대조표 + 자녀 자금출처 시뮬 + 현금흐름 지속가능성(고갈 시점 경고) + 세제 파라미터 편집, settings KV 저장
- [C] **샘플 데이터 시드** — `seedSampleData`(8개 자산) + 최초 실행 자동 시드 + Settings 샘플/전체삭제 버튼
- [C] **마이그레이션 정확도** — `retirement_plan` snake→camel 변환, settings 키 camel 변환, `getRate` snake 통일 (USD 주식 손익 정상화)

---

## 2026-07-26 — 은퇴·시뮬 정비 1차 (사용자 확인완료 일괄 이관)
> TO-DO-LIST.md 에 있던 항목들을 사용자 확인([C]) 처리하여 이관. 이후 신규 이슈는 TO-DO-LIST.md 최하단에 추가.

### CorpSim 강화 (2026-07-10)
- [C] **CS-1~CS-6** — CorpSimPlan 확장(남편 월급·포트폴리오) · computeTwoPhase · corpSim.test 사이드이펙 수정 · /api/yield 서버리스+dev 프록시 · CorpSimPage UI(남편급여·배당주포트폴리오·2상비교) · 검증+push

### 은퇴 ↔ CorpSim 연동 (2026-07-11)
- [C] **LK-1~LK-3** — RetirementPlan.linkCorpSim + CashFlowRow corp 필드 · buildCashFlow linked 분기 · 토글 UI · 검증+push

### 누진세율 + 연금 자동 연동 (2026-07-11)
- [C] **TX-1~TX-7** — calcPensionByYear/SIM_START_YEAR 추출 · comprehensiveTax 누진 · computePersonal/TwoPhase flat→누진 · RetirementPage import · CorpSimPage 연금연동 토글 · 테스트 · 검증+push

### Phase 1/2 연도별 전환
- [C] **P2-1~P2-3** — CorpCashFlow 인터페이스+시그니처 · 루프내 Phase 분기 · 컴포넌트 · 검증+push

### 전면 수정 (중복계산/건보/표시)
- [C] **RF-1~RF-8** — 법인 배당 share×tax 수정 · 법인세 기준 통일 · 건보 자동산정 · 미사용 블록 제거 · 건보/Phase/배당 표시 개선 · 검증+push

### 연금 시뮬레이션 신규 페이지
- [C] **PS-1~PS-8** — PensionSimPlan/Source/TaxType · pensionSim.ts · db+hook · PensionSimPage UI · 라우트/네비 · RetirementPage 연동 · 6개 단위테스트 · 검증+push

### 전면 재설계 (공통 포트폴리오 분리 + 시뮬 구조)
- [C] **A-1** — 공통 투자포트폴리오 페이지 (types+db+hook+PortfolioPage+라우트+CorpSim에서 제거)
- [C] **B-1** — 연금시뮬 과세구분 버그 수정 + 현금흐름 제거
- [C] **C-1** — 은퇴계획 라디오 택일 + 연금시뮬 연동 (연동 토글 버튼으로 구현 완료)
- [C] **D-1** — CorpSim portfolio 필드 제거 정리
- [C] **E-1** — 검증(tsc+vitest) + 커밋&push

### 은퇴·시뮬 정비 (포트폴리오/명의/재건축/드라이브)
- [C] **I1** — 공식 지역걸보 재산분 60등급 모델 (healthInsurance.ts PROPERTY_SCORE_TABLE)
- [C] **I2** — 총세금 분해 표시 + 연금소득공제 1200만 상수화
- [C] **J1** — allocations 모델 (목돈→IRP/주식 분배)
- [C] **J4** — 은퇴계획 목돈수입 단일소스 + 나머지 현금
- [C] **J5+J6** — 법인 분배 + 마이그레이션 + 배포
- [C] **A** — 설정 나이→생년 + 와이프 국민연금 자동생성
- [C] **B3** — IRP 포트폴리오 → 은퇴준비 통합
- [C] **잔액추적** — IRP+일반주식계좌+부동산 연도별 잔액 시뮬 (accountSim.ts) + 재건축 futureValue/futureYear + 부동산 콤마 표시
- [C] **Google Drive** — OAuth 백업/복원 (googleDrive.ts + Settings)
- [C] **종목검색** — StockSearch (국내/미국, 배당률+상승률 자동산정, /api/yield avg3yGrowth)
