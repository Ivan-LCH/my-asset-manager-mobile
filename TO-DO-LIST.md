# TO-DO LIST — My Asset Manager (Mobile PWA)

> 범례: [/] 진행중 · [O] 적용완료 · [C] 사용자 확인완료 · [S] 보류 · [ ] 미진행

## 상태: Phase M(모바일 PWA 컨버전) 전체 완료 ✅
- 운영 배포: https://my-asset-manager-mobile-ivansproject.vercel.app
- 상세 이력(원문)은 **[TO-DO-ARCHIVE.md](./TO-DO-ARCHIVE.md)** 참조.

---

## 신규 작업 (새로 추가할 때 아래에)
<!-- 없음. 새 기능/수정 발생 시 여기에 항목을 추가 -->

### 🔵 현금흐름·연금 모델 정비 (2026-07-26)
> 5개 이슈. 연금 산정 = "등록 월수령액 + IRP 퇴직시점 자동성장" 방식 채택.

- [O] **CF-1. 연금 수령액 = 자산 등록값(expectedMonthlyPayout) 사용** (항목1)
  - 비과세·과세 연금저축: 자산에 등록한 월수령액(110만 등) honored. pensionSchedule 재작성.
- [O] **CF-2. IRP 퇴직시점 잔액 반영** (항목2)
  - IRP = (현재 PENSION 자산합 + 목돈 IRP분배) × (1+IRP상승률)^{수령개시-오늘} ÷ 수령기간. accountSim·pensionSchedule 일관 적용.
- [O] **CF-3. 건보·세금 연도별 산정** (항목3)
  - perPersonYearTaxHealth 추가 — 매년 연금·배당 성장·재산(재건축 전환) 반영하여 1인별 재산정. healthByYear/taxByYear 맵.
- [O] **CF-4. 금융소득 2천만 한도 1인별 적용** (항목4)
  - 이미 1인별 적용 중 → CF-3으로 매년 1인별 반영 확인.
- [O] **CF-5. 세금 월→연간 조정열 이동** (항목5)
  - totalExpense에서 세금 제거, taxAnnual을 +/- 누적에서 차감. 표에 세금(연) 컬럼 추가.
- [O] **CF-6. 검증(tsc+62테스트, 새 3개) + 빌드 통과**

<!-- 완료 항목은 TO-DO-ARCHIVE.md 로 이동 -->

### 🔵 모바일 자산 타일 1줄 1개 + 재배치 (2026-08-14)
> 주식(계좌 내 종목)·부동산·연금·실물/기타 타일을 모바일에서 1줄 1개로 변경.
> 반폭(2열)용 세로 배치 → 전폭용 가로 배치로 재설계하여 가독성 확보.

- [O] **TILE-1. StockPage 종목 타일: `grid-cols-2 lg:grid-cols-3` → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`**
  - StockTile 내부 가로 재배치 (좌: 종목명/티커/수량, 우: 평가액/손익).
- [O] **TILE-2. StockPage 매각완료 타일 동일 적용**
- [O] **TILE-3. RealEstatePage 타일 1줄 1개 + 재배치** (하단 4칸: 순자산/부채/취득가/손익률)
- [O] **TILE-4. PensionPage 타일 1줄 1개 + 재배치**
- [O] **TILE-5. AssetPage(실물/기타) 타일 1줄 1개 + 재배치**
- [O] **TILE-6. 검증(tsc+69테스트 통과) + 모바일(390px) 렌더링 확인**

### 🔵 주식 계좌 통합 관리 모드 (2026-08-23)
> 개별 종목 관리가 번잡 → 계좌 단위 통합 입력 모드 추가. 간소화 목표.
> 통합 계좌 = STOCK 자산 1개 (isAccountLevel 플래그, qty=1, 취득단가=총 원금)
> → 손익/차트/연금연동/명의 기존 로직 그대로 재사용.

- [O] **ACC-1. 데이터 모델: StockDetail/StockRow + isAccountLevel, putDetail 전파**
- [O] **ACC-2. AssetCreateForm: 주식 추가 시 '개별 종목 / 계좌 통합' 모드 선택**
  - 통합: 계좌명·평가액·원금·취득일·연간 배당금(선택). 티커/수량/통화 없음.
- [O] **ACC-3. StockTile: 통합 계좌 표시 (평가액/원금/손익, 종목단위 정보 숨김)**
- [O] **ACC-4. AssetDetail/AssetForm: 통합 계좌 라벨·평가액 직접 수정**
- [O] **ACC-5. DividendSection: 통합 계좌는 '연간 배당금' 단일 입력**
- [O] **ACC-6. 검증(tsc+69테스트) + 모바일 E2E(등록→타일→상세) 확인**
