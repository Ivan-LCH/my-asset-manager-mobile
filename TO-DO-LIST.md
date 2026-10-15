# my-asset-manager-mobile 보완 TO-DO LIST
대상 저장소: Ivan-LCH/my-asset-manager-mobile (Vercel 배포). 작성: 자산 봇, 2026-10-15
근거: 실사용 테스트(로컬 dev 서버, 2026-10-14 백업 데이터)와 코드 리뷰.
원칙: 단계별로 PR을 나누고, 테스트를 추가하고, 실데이터(IndexedDB)를 깨뜨리는 마이그레이션은 금지.

## 1단계 (1주) — 숫자 신뢰성
- [x] 총액 기준 통일: 홈 `/`(25.34억)과 `/history` 통합 대시보드(26.49억)가 다름. 원인은 `planner/model.ts`의 `defaultPolicy`가 '국민' 연금을 entitlement로 분류해 0으로 처리하기 때문(이창호-국민연금 1.15억). 화면 전체를 하나의 계산(`buildSnapshot`) 기준으로 맞추고, 합계 아래에 "제외 항목: 국민연금 수급권 1.15억"처럼 제외 내역을 표시 (`planner/CurrentOverview.tsx`). 연금 탭(39.81M)과 대시보드(154.81M) 연금 값도 같은 기준으로 맞추기.
  - 결정(1b 갱신): **국민연금 수급권은 화면 합계에 포함.** 공통 `planner/totals.ts` `snapshotTotals`가 role `entitlement`(기준일 뒤 취득·연결 아님)를 `Math.round(currentValue)`로 합계·byType에 넣고, 제외 항목 사유에서 '수급권' 제거. 홈·CurrentOverview·`/history` KPI·파이·연금 탭이 이 함수 사용. `defaultPolicy`·`buildSnapshot` balance(수급권 0)·엔진·storage는 그대로 → 은퇴 엔진은 지급 일정으로만 반영(원금+수입 이중 계상 방지), 분석 화면에 "시작 순자산 미포함" 안내. 저장된 정책도 동일 처리(IndexedDB 마이그레이션 없음): `entitlement`는 포함, `excluded`(합산 제외)는 계속 제외. CurrentOverview 행은 "평가액 · 수급권(인출 불가)". `/history` 차트는 자산별 원 단위 반올림, 안내 "차트 마지막 값 = 순자산(부동산 대출·보증금 차감). 연결·합산 제외 항목이 있으면 다를 수 있음." 제외 항목이 없으면 표시 숨김. 미래 매각 예정 자산은 snapshot 기준대로 합산. 실데이터 회귀: 홈=대시보드 총자산 2,648,608,701 · 순자산 2,488,608,701 = 차트 마지막 값 · 연금 154,810,000 · 제외 항목 없음.
- [x] 계좌 필터 시 요약 카드 버그: `자산 > 주식 > 계좌` 필터에서 상단 평가총액/손익이 주식 전체 값으로 표시됨. 필터 범위 기준으로 계산.
  - 결정: `lib/stockSummary.ts` `stockSummary`(계좌 선택 시 그 계좌만, 배당도 범위 id로 필터). KPI 라벨에 계좌명 표시. 계좌 그룹 키를 `accountName()`(trim)으로 통일. 실데이터: 퇴직IRP 250.41M / −36.06M.
- [x] 입력 검증 (`AssetForm.tsx`, `AssetCreateForm.tsx`, `lib/db.ts` `importBackup`): 날짜 1900년~오늘 범위 검사(예: 0026-02-05 저장됨), 수량·평가액 0인데 처분일 없는 자산 경고, 같은 계좌·같은 티커 중복 경고. 가져오기에서는 차단하지 말고 경고 목록으로 표시.
  - 결정: 순수 모듈 `lib/validation.ts`. 폼: 취득일·이력 날짜는 1900-01-01~오늘(Asia/Seoul) 벗어나면 저장 차단, 매각일은 1900 하한만 차단(미래 매각 FUTURE_SALE 허용), date input에 min/max. 0원 미처분(국민연금 수급권·linkedStockId/linkedTo 연결 항목 제외)·같은 계좌+티커(티커 없으면 계좌+이름) 중복은 확인 창 경고만. 가져오기: `validateBackup` 스키마는 그대로, `previewBackup`의 기존 확인 창 경고 목록에 합침(`importBackup`은 차단 없음). 실데이터 경고: 0원 3건, TIGER 미국나스닥100 중복 1건.
- [x] 매각 완료 자산 상세에서 매각가를 "평가금액/손익"으로 표시하는 라벨 수정("매각가/실현손익").
  - 결정: `lib/assetLabels.ts`. 주식(일반·계좌 통합)·실물 "매각가/실현손익", 그 외 "매각가"/"실현손익", 주식 요약줄 "현재"→"매각가", 단가 "매각 단가". 매각가 null/0이면 손익 대신 "매각가 미입력". 매각가는 기존대로 총액으로 해석(폼 라벨 "매각가 (총액, 원)"), 데이터 변환 없음.

## 2단계 (2주) — 입력·정리 부담 감소
- [x] '잠정 57건' 검토 개선: 홈 "합산 분류 확인 →"이 `/plan?tab=policies`로 가는 진입점 정리, 유형별 기본값 일괄 확인 기능, 목록에 계좌명 표시(같은 종목명 구분), 연금·보험 항목을 주식 목록과 분리.
  - 결정: 홈 건수를 "합계 영향 N건"(기준일 뒤 취득·처분·관측, 연결 잔액, 미확인 합산 제외·동일 잔액 연결 — 이쪽만 "합계 잠정")과 "분석 조건 미확인 N건"(분류·수익·인출 미확인, 합계 무영향)으로 분리(`totals.ts reviewCounts`, 자산 단위 중복 제거). 링크는 `/plan?tab=policies&unconfirmed=1`. 정책 행·검색·"동일 잔액의 원본 자산" 드롭다운은 `종목명 · 계좌명`(`accounts.ts assetLabel`). 그룹 표시만 연금 계좌(연결 연금이 가리키는 주식 계좌)와 연금을 국민연금/연금/보험(pensionType)으로 구분 — 저장 데이터·defaultPolicy 불변. BulkPolicy에 "이 그룹 기본값 확인"(confirmed:true 만 변경, 건수 포함 confirm, 연금 계좌 그룹은 비활성화). **결정 유보**: IRP 계좌 주식의 기본 role을 pension으로 바꿀지 — defaultPolicy 변경은 미저장 사용자 기본값 의미를 바꾸므로 보류.
- [x] 계좌 입력 방식 명확화: `isAccountLevel`(통입력) / 종목별 / `linkedStockId` 연결 항목을 계좌 단위로 하나만 선택하게 하고, 연결 연금 잔액과 계좌 합계 불일치를 표시. 연결 항목의 옛 이력값(예: 퇴직연금 3억)이 이중 계산되지 않음을 테스트로 보장.
  - 결정: 연금 래퍼(linkedStockId)는 계좌를 가리키는 포인터라 종목별과 공존이 정상 — 강제 단일 모드·마이그레이션 대신 **계좌 통합(총액)+종목별 혼용만** 생성·수정 폼에서 차단(`validation.ts accountModeError`, 기존 저장 데이터는 그대로). buildSnapshot은 계좌가 해석되는 linkedStockId 연금을 linkedTo와 동일 취급(balance 0, 제외 사유 '연결 잔액', 평가액≠0·≠계좌합계 시 LINKED_BALANCE 경고). 차트 `assetToRecords` 수집에서 linkedStockId 연금은 hideInChart 무관 항상 제외. 연금 탭 래퍼 카드에 "계좌 합계 X · 원본 이력 Y(날짜)은 합산 안 함" + 불일치 안내. 계좌 키는 trim된 accountName()으로 통일. 회귀 테스트(`planner/phase2-backup.test.ts`): 래퍼 hideInChart 해제+평가액 3억 메모리 변조 → 홈 2,648,608,701·차트(2026-04-22~오늘, +3억 없음)·분석 연금 원금 250,406,395·연금 탭 154,810,000 모두 불변 확인.
- [x] 신규 추가 폼: 금액 천단위 구분, 한국식 날짜 표기, 명의 기본값 재검토(현재 50:50 자동), 전체 탭에도 추가 버튼.
  - 결정: `components/common/AmountInput` — 입력 중 천단위 콤마·0 허용·원화 전용(수량·연도·%·외화 단가는 기존 type=number 유지). 취득일 기본값 `seoulToday()`(기존 UTC 날짜 버그 수정), `formatKoreanDate()` 힌트·상세 표시. 명의 기본값(`lib/ownershipDefaults.ts`, 신규 자산만 — 저장된 자산 불변): 연금 또는 배우자 없음 → 100:0, 주식 → 같은 계좌 기존 명의(없으면 100:0), 부동산·예적금·실물·기타 → 50:50 유지하되 "기본값 · 확인하세요" 표시. **결정 유보**: 부동산·예적금 50:50 기본값 자체는 사용자 결정 대기. 전체(ALL) 탭에 "신규 추가" 버튼(유형 선택부터 시작).
- [x] 금액 표기 통일(원/만원/억 혼용, "0만원"과 미입력 구분, "-0만원" 제거). 수량 소수 자리 표시 통일.
  - 결정: `lib/utils.ts fmtAmount` 코어(null·비유한수 → '—', 반올림 후 -0 → 0, 부호는 반올림 뒤) + formatMoney/formatManwon/formatPnl/formatEok(formatWon) 재구현, 4개 `won` 복사본 대체, `fmtQty`(소수 최대 8자리 — GLD 3.10379·테슬라 126.797632 그대로), `fmtPct`(-0.0% 제거), fmtM -0·sign. 부호-반올림 순서 호출부(AssetPage·StockPage·YearDashboard·MonthlyCashflowCard·AssetDetail·CashFlowTable·CorpSimPage) 정리. 매각 타일은 `disposalPriceMissing()`("매각가 미입력", 0만원·전액손실 표시 제거). 우선 화면의 표시 전용 `?? 0` 제거(미입력 → '—'). 이력 테이블의 기록 0원은 '-' 대신 ₩0로 표시. **결정 유보**: 컨텍스트별 표준 단위(KPI 원/타일 만원/차트 백만) 통일과 저장된 0(disposalPrice=0·expectedMonthlyPayout=0)을 "미입력"으로 볼지 — 기존 데이터 의미 변경이라 보류.

## 3단계 (2~3주) — 데이터 안전
- [ ] 자동 Drive 백업(주기적, 실패 시 알림). 목록 20개 제한 완화.
- [ ] 외부 업로드 백업 열기: `lib/googleDrive.ts`의 `drive.file` 범위로는 앱이 만든 파일만 목록에 나옴 → Google Picker로 파일 선택 지원.
- [ ] 복원 개선 (`importBackup`): 변경 미리보기(diff), 전체교체/병합 선택.
- [ ] 시세·환율: `lib/stockPrice.ts` 실패 시 null 삼키지 말고 UI에 실패·마지막 갱신 시각 표시. 환율(`exchange_rate_USD` 고정 1,508.85) 자동 갱신.
- [ ] `/api/*` 프록시: `Access-Control-Allow-Origin: *` 제거(동일 출처), 티커 형식 검증.
- [ ] Google 토큰: `logout()` 순서 버그 수정 및 revoke 호출, 만료 시 재발급, 매번 `prompt:'consent'` 지양. Drive 오류 메시지 세분화.

## 4단계 — 정리
- [ ] '기존 계산기'와 '새 계획' 이중 체계 통합.
- [ ] `/analysis` 상단 주의문(약 25줄) 접기, 미확정 수치는 보조 표시.
- [ ] 차트 X축 라벨 누락, 데이터 없는 '기타' 카드 숨기기. 설정 문구 "이 폰에만 저장" 수정.
- [ ] `lib/db.ts`(1,300줄+) 분리, 레거시 변환 로직 정리.
- [ ] 모바일 뷰포트 실사용 점검.

## 참고 (데이터, 앱 수정 아님)
- KODEX AI전력핵심설비(퇴직IRP) 취득일 수정본: 드라이브 자산관리 폴더 `asset-manager-backup-2026-10-15-fixed.json`.
- 곡반정동하늘채는 전세라 미소유지만 자산 포함이 의도된 동작.
