# My Asset Manager (Mobile PWA) — 프론트엔드 개발용 경량 이미지
# 백엔드 없음(폰 단독 PWA). 의존성 설치는 컨테이너 시작 시 docker-compose의 command에서 수행.
FROM node:22-slim

WORKDIR /app/frontend

EXPOSE 5173

# 기본 실행: 의존성 설치 후 vite dev (docker-compose의 command가 이를 덮어씀)
CMD ["sh", "-c", "npm install --legacy-peer-deps && npm run dev"]
