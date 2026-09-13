# TO-DO LIST — My Asset Manager (Mobile PWA)

> 범례: [/] 진행중 · [O] 적용완료 · [C] 사용자 확인완료 · [S] 보류 · [ ] 미진행

## 상태: Phase M(모바일 PWA 컨버전) 전체 완료 ✅
- 운영 배포: https://my-asset-manager-mobile-ivansproject.vercel.app
- 상세 이력(원문)은 **[TO-DO-ARCHIVE.md](./TO-DO-ARCHIVE.md)** 참조.

---

## 신규 작업 (새로 추가할 때 아래에)
<!-- 없음. 새 기능/수정 발생 시 여기에 항목을 추가 -->

### 🔵 2026년 세제개편 반영 (2026-09-06)
> 2026 세제개편안 검토 — 법인세율 1%p 인상(2026년 귀속분부터) 등.

- [O] **TAX26-1. 법인세율 기본값 갱신** — 9%/19% → 10%/20% (DEFAULT_CORP_TAX, 2억 구분 유지)
- [O] **TAX26-2. 기존 저장 데이터 마이그레이션** — mergeCorpTax 헬퍼: 구 기본값(9/19) 그대로 저장된 경우만 갱신, 사용자 커스터마이즈 존중. CorpSimPage·RetirementPage 적용
- [O] **TAX26-3. 검증 (tsc + 76테스트) + 브라우저 확인 + push**
- [O] **TAX26-4. 배당 선택분리과세(성장배당) 옵션** — 조특법 확정안: 2천만↓ 14% / ~3억 20% / ~50억 25% / 초과 30% (지방세 포함 15.4/22/27.5/33% 누진), 2026년분~2028 한시. 계좌당 `growthDividendRatio`(성장배당 비율, 기본 0=기존 종합과세) 입력 → 해당 배당은 종합합산·가산 제외, 별도 누진 분리과세 (pensionSim.ts separatedDividendTax, PensionSimPage 카드·지출 테이블 표시)
- [O] **TAX26-5. 배당가산율 정밀화** — 10% 근사치 → 10/90(≈11.11%) 적용. 배당이 법인세 후 금액이므로 가산율 = t/(1−t), 2026 개편 최저세율 t=10% 기준 (pensionSim.ts, 관련 테스트 기대값 갱신)
### 🟢 회귀 스모크 & 버그 수정 (2026-09-12)

- [O] **SMOKE-1. 전 페이지 회귀 스모크** — 세제개편 3커밋 + PersonKpi 제거 사이드이펙트 점검. 9개 라우트(대시보드·자산 3종·prep·연금시뮬·법인시뮬·현금흐름·설정) 페이지에러/콘솔에러/빌드 오버레이 0, 식별 마커 전부 확인
- [O] **FIX-1. PensionPage 은퇴연령 계산 버그** — `resolveRetirementYear`(연도 반환)에서 나이를 직접 빼는 오류: 2051−40=**"은퇴 연령 2011세"** 표시 + retirementYear 3997 → "은퇴 시 월 수령" 빈값(-). `currentAge + (retirementYear − 올해)`로 수정 → 65세 / ₩7,447,387 복원
### 🟣 UI 간소화 (2026-09-13)
> 전체 아키텍처 검토 → "더 쉬운 UI" 4단계 리팩터링. 단계별 tsc+테스트+스모크 검증 후 커밋.

- [O] **UI-1. 시뮬 페이지 UI 프리미티브 공용 모듈 추출** (30f5ebf) — Expander/Section/Row/AmountInput/NumInput/TextInput/YearInput/TimesInput/InfoNote/InfoTooltip → components/sim. 시뮬 3개 페이지 중복 UI 코드 통합
- [O] **UI-2. 설명박스 접이식 폴딩 + 폰트 12px 통일** (9b008f3) — 2줄 이상 정적 설명 InfoNote는 기본 접힘(요약 1줄+펼치기), 미세 폰트 11px→12px. PensionSim 3건·CorpSim 7건 단축
- [O] **UI-3. RetirementPage 정리·분리 + 자산 칩 실물·기타 병합** (66aab87) — 1320줄→456줄: 미사용 입력 섹션 5개 제거(입력은 은퇴 준비 탭 담당), 순수 로직 lib/retirementPlan·retirementCashflow 분리, 표 3종 components/retirement 컴포넌트화, 건보 구버전 사본→lib 공식 60등급 표 병합(비연동 모드 수치 정정). 자산 칩 7→6(실물·기타 병합, 구값 PHYSICAL→ETC 정규화)
- [O] **UI-4. pensionSim 편집 진입점 정리** (1f05f92) — 과세구분 칩 선택=즉시 저장("시뮬 저장" 버튼 제거), 은퇴 준비 과세기준 섹션→연금시뮬로 이관(이중 저장 버튼 구조 해소), 미사용 perPersonDed 배지 활용, 헤더 문구 정정
<!-- 완료 항목은 TO-DO-ARCHIVE.md 로 이동 -->
