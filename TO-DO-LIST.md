# TO-DO LIST — My Asset Manager (Mobile PWA)

> 범례: [/] 진행중 · [O] 적용완료 · [C] 사용자 확인완료 · [S] 보류 · [ ] 미진행

## 상태: Phase M(모바일 PWA 컨버전) 전체 완료 ✅
- 운영 배포: https://my-asset-manager-mobile-ivansproject.vercel.app
- 상세 이력(원문)은 **[TO-DO-ARCHIVE.md](./TO-DO-ARCHIVE.md)** 참조.

---

## 신규 작업 (새로 추가할 때 아래에)
<!-- 없음. 새 기능/수정 발생 시 여기에 항목을 추가 -->

### 🔵 보유세(재산세+종부세) 현금흐름 반영 (2026-09-02)
> 매탄주공 입주(29년 말) 이후 부과되는 보유세를 현금흐름 세금(연)에 반영.

- [O] **HT-1. RetirementPlan 타입에 holdingTaxAnnual / holdingTaxStartYear 추가**
- [O] **HT-2. buildCashFlow 세금(연)에 개시 연도부터 합산** — 기본 410만원 / 2030년~
- [O] **HT-3. 은퇴 페이지에 보유세 입력 UI** (금액 + 부과 개시 연도)
- [O] **HT-4. 검증 (tsc + 72테스트) + E2E 확인 + push** — 2029년 —, 2030년부터 세금(연) -410만원 반영 확인
<!-- 완료 항목은 TO-DO-ARCHIVE.md 로 이동 -->

### 🔵 주식 등록·이력 입력 간소화 (2026-08-30)
> 시세/검색 자동화로 수동 입력 최소화.

- [O] **AT-1. 이력 입력 시 단가 자동 조회** — HistoryTable 추가 폼에서 티커 있으면 Yahoo 시세 자동 채움(수동 수정 가능), 티커 없으면 수동 유지
- [O] **AT-2. 주식 등록 시 종목 검색 자동완성** — 자산명 필드에 StockSearch 연동, 선택 시 티커·통화·현재가 자동 채움
- [O] **AT-3. 주요 주식 티커 프리셋** — 국내/미국 주식·ETF 40종 (한글 별칭 매칭, API 결과와 병합·중복 제거)
- [O] **AT-4. 배포용 /api/search 서버리스 함수** — 공통 로직 api/_search.ts 추출 + Vercel api/search.ts (.js 확장자 import로 ESM 해석 수정)
- [O] **AT-5. 검증 (tsc + 72테스트) + E2E 확인 + push** — 한글 '나스닥'→프리셋 매칭·시세 26,235 자동입력, 이력 추가 시 현재가 18,190 자동입력 확인
<!-- 완료 항목은 TO-DO-ARCHIVE.md 로 이동 -->
