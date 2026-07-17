# TO-DO LIST — My Asset Manager (Mobile PWA)

> 범례: [/] 진행중 · [O] 적용완료 · [C] 사용자 확인완료 · [S] 보류 · [ ] 미진행

## 상태: Phase M(모바일 PWA 컨버전) 전체 완료 ✅
- 운영 배포: https://my-asset-manager-mobile-ivansproject.vercel.app
- 상세 이력(원문)은 **[TO-DO-ARCHIVE.md](./TO-DO-ARCHIVE.md)** 의 `2026-07-08 — 모바일 PWA 컨버전 (Phase M) 전체 완료` 섹션 참조.

---

## 신규 작업 (새로 추가할 때 아래에)
<!-- 없음. 새 기능/수정 발생 시 여기에 항목을 추가 -->

### 🔵 CorpSim 강화 (2026-07-10) — 남편 월급·2인건보 / 2상 비용비교 / 배당주 포트폴리오 자동 수익률
> 단계별로 진행 + 각 단계 검증(tsc/vitest/curl). 기존 로직 수정 시 사이드이펙 점검 필수.

- [O] **CS-1. types/index.ts — CorpSimPlan 확장**
  - `repSalaryHusbandMonthly`(남편 월급, 기본 1,000,000), `portfolio: {ticker,weight}[]`(기본 SCHD/GPIQ/JEPQ 1:1:1), `CorpTaxParams.salaryTaxRate`(기본 0.03) 추가

- [O] **CS-2. lib/corpSim.ts — 계산 로직 확장 (기존 로직 수정: 사이드이펙 점검)**
  - `salariedCount(plan)` 추가
  - ⚠️ `computeCorp.corpHealthAnnual` = `salariedCount × employeeHealth × 12` (1인→2인 변경 → KPI/runway/Before-After 건보 영향, 의도된 변경)
  - ⚠️ `simulateRunway.familyDraw` = `(wife+husband)×12 + monthlyReturn×12` (남편 급여 추가 → 기존 runway 테스트 사이드이펙, CS-3에서 수정)
  - 신규 `computeTwoPhase(plan)` (Phase1 가수금 중 vs Phase2 완료 후 비용: 법인세/건보/급여소득세 + Phase2 배당세·종합)
  - 신규 `blendedYield(yields, portfolio)` 가중평균

- [O] **CS-3. lib/corpSim.test.ts — 사이드이펙 수정 + 신규 테스트**
  - 기존 runway "지속가능" 테스트: `repSalaryHusbandMonthly: 0` 추가(남편 급여 0으로)
  - 신규: salariedCount(2인), computeTwoPhase(cost2>cost1, dividendDist=monthlyReturn×12, combinedExtra), blendedYield

- [O] **CS-4. api/yield.ts 서버리스 + vite.config.ts yieldProxyDev 미들웨어**
  - `GET /api/yield?ticker=` → Yahoo 3y 배당이력 → {price, ttmYield, avg3yYield}
  - dev 미들웨어(/api/yield) 추가. curl로 3년 수익률 반환 검증

- [O] **CS-5. CorpSimPage.tsx UI**
  - 입력①: "남편 월급" Row
  - 📊 배당주 포트폴리오 Expander (종목/비중 에디터 + "배당률 자동 산정" 버튼 → /api/yield → 가중평균 → dividendYield 갱신)
  - 📊 2상 비용 비교 Expander (computeTwoPhase 결과 표, 세무사 확인 안내문)

- [O] **CS-6. 최종 검증 + 커밋&push + 운영 반영 확인**
  - tsc + vitest(전체) + dev `/api/yield` curl + 화면 확인 → push → 운영 해시 일치/`/api/yield` 동작 확인

### 🔵 은퇴 ↔ CorpSim 연동 1단계 (2026-07-11)
- [O] **LK-1. types**: RetirementPlan.linkCorpSim + CashFlowRow(corpSalaryMonthly, corpReturnMonthly)
- [O] **LK-2. RetirementPage**: useCorpSim 읽기, buildCashFlow linked 분기(법인 배당·급여·가수금+직장건보), 토글 UI, 표 신규 열
- [O] **LK-3. 검증 + 커밋&push**

### 🔵 누진세율 + 연금 자동 연동 (2026-07-11)
- [O] **TX-1. lib/pensionCalc.ts**: calcPensionByYear + SIM_START_YEAR 추출 (RetirementPage → 공유 모듈)
- [O] **TX-2. types/index.ts**: CorpTaxParams.combinedMarginalRate 제거, CorpSimPlan(linkPension, pensionIncomeAnnual), PersonalResult/TwoPhaseResult(marginalRate)
- [O] **TX-3. lib/corpSim.ts**: comprehensiveTax(누진구간) + computePersonal/computeTwoPhase(flat→누진) + DEFAULT/EMPTY 업데이트
- [O] **TX-4. RetirementPage.tsx**: calcPensionByYear import 변경 (사이드이펙 점검)
- [O] **TX-5. CorpSimPage.tsx**: 연금 자동 연동 토글 + 세율 표시 + 파라미터 UI
- [O] **TX-6. corpSim.test.ts**: 누진세 기댓값 수정 + comprehensiveTax 테스트
- [O] **TX-7. 검증(tsc+vitest) + 커밋&push**

### 🔵 Phase 1/2 연도별 전환 (중복 계산 수정)
- [O] **P2-1. RetirementPage buildCashFlow: CorpCashFlow 인터페이스 + 시그니처 변경 + 루프내 Phase 분기**
- [O] **P2-2. 컴포넌트: CorpCashFlow 계산 + buildCashFlow 호출부 수정**
- [O] **P2-3. 검증(tsc+vitest) + 커밋&push**

### 🔵 전면 수정: 중복계산/건보/표시 개선 (RF-1~RF-8)
- [O] **RF-1. 법인 배당 share%+tax 수정 (P0 버그)**: corpCF divP1/P2에 coupleShare×(1-divTaxRate) 적용
- [O] **RF-2. 법인세 기준 통일 (P0)**: computeCorp + simulateRunway에 급여 공제 적용
- [O] **RF-3. 건보 자동 산정 (P1)**: employeeHealthMonthly 제거 → salary×rate×0.5, healthInsRate 파라미터화
- [O] **RF-4. 미사용 pensionAnnual 블록 제거 (P2)**: RetirementPage 중복 계산 정리
- [O] **RF-5. 건보 표시 개선 (P2)**: "건보/월(직장)" 헤더 + per-person 표시
- [O] **RF-6. Phase 1/2 전환 표시 (P2)**: 가수금 소진 연도 행에 배지
- [O] **RF-7. 배당 열 출처 표시 (P2)**: "(개인+법인)" 힌트
- [O] **RF-8. 검증(tsc+vitest) + 커밋&push**

### 🔵 연금 시뮬레이션 (PensionSim) 신규 페이지
- [O] **PS-1. types**: PensionSimPlan + PensionSource + PensionTaxType
- [O] **PS-2. lib/pensionSim.ts**: pensionIncomeTax 누진 + simulatePension + sourcesFromAssets
- [O] **PS-3. db.ts + usePensionSim.ts**: getPensionSim/savePensionSim + 훅
- [O] **PS-4. PensionSimPage.tsx**: UI (KPI + 연금원천 + 수령설정 + 현금흐름 + ISA + 전세금)
- [O] **PS-5. App.tsx + Sidebar.tsx**: 라우트(/pension-sim) + 🪙 Wallet 네비
- [O] **PS-6. RetirementPage 연동**: 🪙 연금(IRP) 연동 토글 추가 (빌드 통과)
- [O] **PS-7. pensionSim.test.ts**: 6개 단위테스트 (연금소득세 누진/잔액감소/비과세/자산연동)
- [O] **PS-8. 검증(tsc+42테스트) + 커밋&push**

### 🔵 전면 재설계: 공통 포트폴리오 분리 + 시뮬 구조 개선
- [O] **A-1. 공통 투자포트폴리오 페이지** (types + db + hook + PortfolioPage + 라우트/네비 + CorpSim에서 제거)
- [O] **B-1. 연금시뮬 과세구분 버그 수정 + 현금흐름 제거**
- [ ] **C-1. 은퇴계획 라디오 택일 + 연금시뮬 연동**
- [ ] **D-1. CorpSim portfolio 필드 제거 정리**
- [ ] **E-1. 검증(tsc+vitest) + 커밋&push**

<!-- 완료 항목은 TO-DO-ARCHIVE.md 로 이동 -->
