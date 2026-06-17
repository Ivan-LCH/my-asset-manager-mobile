# My Asset Manager (Mobile PWA) - Claude Code 가이드라인

## 프로젝트 개요
개인 자산 관리 시스템의 **모바일 PWA 버전**. 백엔드 없이 폰 자체에서 동작하며, 데이터는 IndexedDB로 로컬 저장됩니다.

원본 프로젝트(`../asset_manager`)는 서버 기반 웹앱이고, 본 프로젝트는 그것을 폰 단독 실행으로 컨버전한 **별도 프로젝트**입니다. 원본은 사용자가 계속 사용 중이라 손대지 않습니다.

목적: 지인에게 소개·공유. URL 한 번 접속 → "홈 화면 추가" → 폰만으로 동작, 데이터도 폰을 떠나지 않음.

## Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
  - UI: shadcn/ui, Recharts, React Router v6, React Query v5
  - 폼: React Hook Form + Zod
- **Data**: IndexedDB (Dexie.js 권장) — 폰 로컬 저장, 서버 없음
- **PWA**: vite-plugin-pwa (manifest + service worker)
- **Infra**: 정적 호스팅 (Vercel / Netlify / Cloudflare Pages 등)

## 프로젝트 구조 (목표)
```
frontend/src/
├── components/
│   ├── layout/    # Sidebar, Header, AppLayout (+ 모바일 햄버거/탭바)
│   ├── dashboard/ # KpiCards, PieChart, AreaChart
│   ├── assets/    # AssetCard, AssetDetail, AssetForm, HistoryTable
│   └── common/    # KpiCard, AssetChart, PeriodFilter, ConfirmDialog
├── hooks/         # useAssets, useHistory, useSettings, useChart (로컬 fetcher)
├── pages/         # Dashboard, RealEstate, Stock, Pension, Savings, Physical, Etc, Settings
├── types/         # index.ts
├── lib/
│   ├── db.ts      # Dexie 스키마 + 로컬 CRUD
│   ├── chartData.ts # ffill 차트 집계 클라이언트 구현
│   ├── utils.ts, chartUtils.ts
├── App.tsx
```

> **제거 예정**: `backend/`, `docker-compose.yml`, `Dockerfile`, `requirements.txt`, `entrypoint.sh`, `.env`, `service_account.json`

## 데이터 모델 (IndexedDB / Dexie 스키마)
원본 SQLite 스키마와 동일한 구조를 IndexedDB로 이전합니다.
- `assets`: id(UUID), type, name, currentValue, previousValue, previousPrice, acquisitionDate, acquisitionPrice, disposalDate, disposalPrice, quantity
- `realEstateDetails`, `stockDetails`, `pensionDetails`, `savingsDetails`
- `assetHistory`: id, assetId, date, value, price, quantity
- `dividendHistory`: id, assetId, date, amountKrw, amountOriginal, currency, exchangeRate, memo
- `settings`: key, value (이전엔 `settings` 테이블, 단순 KV)

## 자산 유형 상수
```typescript
type AssetType = 'REAL_ESTATE' | 'STOCK' | 'PENSION' | 'SAVINGS' | 'PHYSICAL' | 'ETC'
```

## 주요 컨벤션
- 한국어 주석/문서, 영어 코드(변수명, 함수명)
- 금액 단위: 원(KRW), 만원 표기 시 `formatManwon()` 사용
- 백엔드 API 호출 패턴은 **모두 제거** — `lib/db.ts`의 로컬 함수로 통일

## 빌드 & 실행
개발은 **Docker 컨테이너 안에서** 한다 (node:22 기반 경량 dev 이미지). 백엔드가 없으므로
컨테이너는 `frontend/`를 마운트하고 vite dev 서버만 띄운다. 의존성은 컨테이너 시작 시 설치된다.
```bash
# 개발
docker compose up        # 컨테이너가 npm install 후 vite dev → http://localhost:5173

# 정적 빌드 (배포 산출물)
docker compose run --rm frontend-dev npm run build   # frontend/dist 생성

# 테스트 (vitest — ffill 차트 등 순수 함수)
docker compose run --rm frontend-dev npm test

# 배포: frontend/dist 를 Vercel/Netlify 등에 업로드 → 지인에게 URL 공유
```
> 호스트에도 node v24 / npm 11 이 있어 `cd frontend && npm run dev` 로도 가능하나, 기본 워크플로우는 Docker.

## 시세 자동 업데이트
백엔드(yfinance) 사라짐. 기본 정책은 **수동 입력** — "시세 갱신" 버튼 누르면 종목별 가격 입력 모달. 추후 필요 시 CORS 프록시 / Cloudflare Worker로 외부 API 호출 우회 가능.

## 모바일 컨버전 작업 트래킹
- 작업 항목은 `TO-DO-LIST.md`의 Phase M (M-1 ~ M-10)
- 핵심 전환: API fetcher → IndexedDB 로컬 핸들러, ffill 차트 로직 클라이언트 이식

## 참조 문서
원본 프로젝트(`../asset_manager/docs/`)의 1~6단계 문서를 그대로 참고 가능. 본 프로젝트의 모바일·PWA·로컬 스토리지 관련 결정은 본 CLAUDE.md와 TO-DO-LIST.md를 우선 참조.
