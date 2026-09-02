# TO-DO LIST — My Asset Manager (Mobile PWA)

> 범례: [/] 진행중 · [O] 적용완료 · [C] 사용자 확인완료 · [S] 보류 · [ ] 미진행

## 상태: Phase M(모바일 PWA 컨버전) 전체 완료 ✅
- 운영 배포: https://my-asset-manager-mobile-ivansproject.vercel.app
- 상세 이력(원문)은 **[TO-DO-ARCHIVE.md](./TO-DO-ARCHIVE.md)** 참조.

---

## 신규 작업 (새로 추가할 때 아래에)
<!-- 없음. 새 기능/수정 발생 시 여기에 항목을 추가 -->

### 🔵 주식 등록·이력 입력 간소화 (2026-08-30)
> 시세/검색 자동화로 수동 입력 최소화.

- [ ] **AT-1. 이력 입력 시 단가 자동 조회** — HistoryTable 추가 폼에서 티커 있으면 Yahoo 시세 자동 채움(수동 수정 가능), 티커 없으면 수동 유지
- [ ] **AT-2. 주식 등록 시 종목 검색 자동완성** — 자산명 필드에 StockSearch 연동, 선택 시 티커·통화 자동 채움 (한글명 그대로 이름 유지)
- [ ] **AT-3. 주요 주식 티커 프리셋** — 자주 쓰는 종목을 사전 데이터로 저장, 검색 결과 상단에 즉시 표시 (오프라인 폴백 겸용)
- [ ] **AT-4. 배포용 /api/search 서버리스 함수** — 현재 dev(vite 미들웨어)에만 존재 → Vercel api/search.ts 추가 (검색이 배포에서 동작하도록)
- [ ] **AT-5. 검증 (tsc + 테스트) + E2E 확인 + push**
