# 다른 서버로 소스·데이터 옮기기

## 1. 파일과 데이터 기준

- `myasset-source-without-screenshots.zip`: 현재 수정 내용을 포함한 소스와 문서. `.git`, `node_modules`, 로그, 임시 파일, 비밀 설정, 실제 개인 백업은 제외한다. 압축 루트에 `frontend/`, `tools/`, `docs/`가 있다.
- `myasset-data-local-snapshot.zip`: 개인 금융정보가 있는 **별도 비공개 데이터 묶음**. `asset-data.json`은 9월 17일 백업에 9월 18일 합의한 연금 계획을 적용한 로컬 검증본이다. 사용 중인 브라우저를 지금 내보낸 파일이 아니다. 정확한 파일·시각·SHA256·건수는 `provenance.json` 참조.
- 브라우저에서 그 이후 수정했다면, 기존 자산이 보이는 주소에서 **설정 → 내보내기(JSON)**를 실행해 새 JSON을 가져와야 한다. 브라우저·주소·포트가 바뀌면 다른 저장소다.
- `pension-plan-registration.json`은 전체 데이터가 아닌 연금 계획 부분 적용 파일이다. 최신 브라우저 백업에 합의한 계획이 없다면 전체 백업 복원 후 이 파일을 별도로 가져온다. 포함된 `asset-data.json`에는 이미 이 계획이 적용되어 있다.
- ZIP은 암호화되어 있지 않다. 데이터 ZIP/JSON은 안전한 경로로 전달하고, Git·공개 다운로드·`frontend/public`·웹 서버 문서 루트에 놓지 않는다.

## 2. 다른 Linux 서버에서 우선 개인용으로 실행

필요한 것은 Node.js 22와 npm이다. Docker, Python, 별도 DB 서버는 필요 없다. 기존 Node 설치가 있다면 `node --version`, `npm --version`으로 확인한다. 다른 OS의 `node_modules`를 복사하지 않는다.

소스 ZIP을 새 빈 디렉터리에 푼 다음:

```sh
cd frontend
npm ci --no-audit --no-fund
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

이 명령은 **개인 확인용 개발 서버**다. 실행한 터미널을 유지해야 한다. 처음 의존성 설치에는 npm 저장소에 연결할 수 있어야 하며, 시세·배당·종목 검색에는 외부 공급자 연결이 필요하다. 프록시·인증서·방화벽 설정은 해당 서버의 정책을 따른다.

원격 서버라면 사용자 PC에서 SSH 터널로 접속한다. 아래 `USER`, `SERVER`는 실제 값으로 바꾼다. 기존 앱 5173과 혼동하지 않도록 PC 쪽은 5180을 사용한다.

```sh
ssh -N -L 127.0.0.1:5180:127.0.0.1:5173 USER@SERVER
```

브라우저에서 `http://127.0.0.1:5180`에 접속한다. 동일 PC의 WSL에서 실행한다면 터널 없이 `http://127.0.0.1:5173`으로 접속할 수 있다. 출처가 달라져 데이터가 비어 보이는 것은 정상이며 다음 절차로 복원한다. 호스트 전체 공개나 방화벽 개방은 자동으로 하지 않는다.

## 3. 데이터 복원

1. 기존 브라우저에서 최신 JSON을 내보내고 원본을 별도로 보관한다. 최신 파일이 없다면 제공된 로컬 검증본의 기준일을 확인한다.
2. 새 주소의 앱에서 **설정 → 가져오기(JSON)** → 최신 전체 백업 또는 `asset-data.json` 선택 → 미리보기 확인 → 복원한다. 기존 데이터가 있는 대상에서는 먼저 그 데이터도 내보낸다.
3. 합의한 연금 계획이 없는 최신 전체 백업을 쓴 경우에만 `pension-plan-registration.json`을 추가로 가져온다. 이 파일은 현재 자산·이력·생활비를 교체하지 않는다.
4. 자산 수·주식 계좌/종목·최근 이력 날짜·생활비를 확인한다. 제공 검증본은 자산 57개, 시세 등 이력 8,634건이다.
5. **분석 → 개인투자시뮬 → 등록한 연금 계획**에서 퇴직 2029-03-31, 개인IRP 2029-04~2059-03, 보험연금 2029-04~2049-03 및 미확인 표시를 확인한다.
6. 새 주소에서 시세 조회·최근 3개월 업데이트를 확인하고 다시 JSON을 내보내 보관한다. 새 서버의 외부 연결 성공은 이전 PC의 성공과 별개다.

데이터는 계속 **각 브라우저 IndexedDB**에 저장된다. 서버를 옮긴다고 서버 DB나 기기 간 자동 동기화가 생기는 것이 아니다. 시크릿 창은 종료 시 데이터가 삭제될 수 있으므로 상시 사용하지 않는다. 브라우저 사이트 데이터를 삭제하기 전에 반드시 내보낸다.

## 4. 정식 상시 배포는 별도 구성

```sh
cd frontend
npm run build
```

`dist`를 정적 호스팅하는 것만으로는 `/api/price`, `/api/yield`, `/api/search`가 제공되지 않는다. `npm run preview` 및 `tools/serve-built-app.cjs`도 외부 시세 API를 제공하는 정식 운영 서버가 아니다.

소스의 `frontend/api/`는 기존 Vercel 서버리스용이며 `frontend/vercel.json`에 SPA 경로 설정이 있다. 일반 Linux/Nginx 서버의 정식 운영에는 이 API에 해당하는 실행 환경, HTTPS, SPA fallback, 접근 제어, 서비스 재시작 구성이 별도로 필요하다. 개발 서버를 그대로 인터넷에 공개하지 않는다. 서버 종류와 도메인이 확정되면 그 환경에 맞게 구성한다.

## 5. 무결성과 확인 범위

- `sizes-and-sha256.json`에 ZIP별 크기·SHA256이 있다. 패키징 시 모든 ZIP 내부 파일을 원본과 SHA256으로 대조한다.
- Linux: `sha256sum myasset-source-without-screenshots.zip myasset-data-local-snapshot.zip`
- PowerShell: `Get-FileHash .\myasset-source-without-screenshots.zip -Algorithm SHA256`
- 이 버전은 로컬 자동 테스트 299개, 제품 빌드, 격리 Chrome에서 실제 백업의 계획 적용 및 내보내기·가져오기, PC/모바일 표시를 확인했다. 새 서버 설치·네트워크 및 사용자의 현재 브라우저 최신 데이터는 별도 확인 대상이다.
