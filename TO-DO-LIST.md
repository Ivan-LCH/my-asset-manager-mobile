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

- [ ] **CS-1. types/index.ts — CorpSimPlan 확장**
  - `repSalaryHusbandMonthly`(남편 월급, 기본 1,000,000), `portfolio: {ticker,weight}[]`(기본 SCHD/GPIQ/JEPQ 1:1:1), `CorpTaxParams.salaryTaxRate`(기본 0.03) 추가

- [ ] **CS-2. lib/corpSim.ts — 계산 로직 확장 (기존 로직 수정: 사이드이펙 점검)**
  - `salariedCount(plan)` 추가
  - ⚠️ `computeCorp.corpHealthAnnual` = `salariedCount × employeeHealth × 12` (1인→2인 변경 → KPI/runway/Before-After 건보 영향, 의도된 변경)
  - ⚠️ `simulateRunway.familyDraw` = `(wife+husband)×12 + monthlyReturn×12` (남편 급여 추가 → 기존 runway 테스트 사이드이펙, CS-3에서 수정)
  - 신규 `computeTwoPhase(plan)` (Phase1 가수금 중 vs Phase2 완료 후 비용: 법인세/건보/급여소득세 + Phase2 배당세·종합)
  - 신규 `blendedYield(yields, portfolio)` 가중평균

- [ ] **CS-3. lib/corpSim.test.ts — 사이드이펙 수정 + 신규 테스트**
  - 기존 runway "지속가능" 테스트: `repSalaryHusbandMonthly: 0` 추가(남편 급여 0으로)
  - 신규: salariedCount(2인), computeTwoPhase(cost2>cost1, dividendDist=monthlyReturn×12, combinedExtra), blendedYield

- [ ] **CS-4. api/yield.ts 서버리스 + vite.config.ts yieldProxyDev 미들웨어**
  - `GET /api/yield?ticker=` → Yahoo 3y 배당이력 → {price, ttmYield, avg3yYield}
  - dev 미들웨어(/api/yield) 추가. curl로 3년 수익률 반환 검증

- [ ] **CS-5. CorpSimPage.tsx UI**
  - 입력①: "남편 월급" Row
  - 📊 배당주 포트폴리오 Expander (종목/비중 에디터 + "배당률 자동 산정" 버튼 → /api/yield → 가중평균 → dividendYield 갱신)
  - 📊 2상 비용 비교 Expander (computeTwoPhase 결과 표, 세무사 확인 안내문)

- [ ] **CS-6. 최종 검증 + 커밋&push + 운영 반영 확인**
  - tsc + vitest(전체) + dev `/api/yield` curl + 화면 확인 → push → 운영 해시 일치/`/api/yield` 동작 확인

<!-- 완료 항목은 TO-DO-ARCHIVE.md 로 이동 -->
