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
