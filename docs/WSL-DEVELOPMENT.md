# Docker 없이 WSL에서 개발하기

최신 화면 간소화와 사용 순서는 [12. 현재 자산 관리 우선](redesign/12-simple-daily-workflow.md)을 참고하세요. 후속 테스트는 158개 통과했으며 추가 패키지 설치는 하지 않았습니다.

## 실행 구조

이 대화의 Windows Codex에서 WSL 명령을 실행한다. WSL 안에 별도 Codex를 설치하거나 로그인할 필요는 없다. Windows 브라우저로 로컬 앱을 확인한다. 별도 Docker·DB 서버·서비스 등록은 사용하지 않는다.

- 저장소: `C:\work_dir\09_14_myasset\my-asset-manager-mobile`
- WSL 경로: `/mnt/c/work_dir/09_14_myasset/my-asset-manager-mobile`
- 확인 환경: Ubuntu 24.04, WSL 1 (`4.4.0-26100-Microsoft`)
- 프로젝트 전용 Node: `/home/fancy13/.local/share/myasset-dev/node22`
- 기존 `/usr/local/bin/node`의 Node 20은 변경하지 않는다. 셸 시작 파일·시스템 PATH도 변경하지 않는다.
- 의존성: 기존 `frontend/package-lock.json`의 버전으로 `frontend/node_modules`에 설치한다. 소스/DB를 덮어쓰는 설치가 아니다.
- npm 캐시와 설치 자료: `/home/fancy13/.local/share/myasset-dev`

이 환경에서는 Node 24.21.0의 공식 Linux x64 파일이 checksum 검증 후에도 `Exec format error`로 실행되지 않았다. Node 22.23.2는 정상 실행을 확인했다. 따라서 이 환경용 실행기의 기본값은 Node 22 LTS다. WSL 2 전환이나 실행 파일 수정으로 해결하지 않는다.

## Windows PowerShell에서 실행

저장소 폴더에서 아래 명령을 사용한다.

```powershell
# 최초 설치 또는 lockfile 변경 뒤 의존성 재구성
.\tools\wsl-dev.ps1 -Action install

# 기존 테스트 / 제품 빌드
.\tools\wsl-dev.ps1 -Action test
.\tools\wsl-dev.ps1 -Action build

# 개발 서버 (현재 창을 유지; 종료는 Ctrl+C)
.\tools\wsl-dev.ps1 -Action dev
```

앱 주소는 `http://localhost:5173`이다. 개발 서버를 `127.0.0.1`에만 바인딩하며, 이미 5173 포트를 사용 중이면 임의로 다른 포트로 바꾸지 않고 오류를 낸다. 외부 기기에 공개하거나 방화벽 예외를 추가하지 않는다.

실행기 [wsl-dev.ps1](../tools/wsl-dev.ps1)은 **현재 Windows 프로세스에 이미 있는** HTTP(S) 프록시 설정만 WSL 자식 프로세스로 전달한다. 프록시 주소를 저장소에 기록하거나 인증서 검증을 끄지 않는다. 이 PC에서는 WSL 직접 외부 연결이 시간 초과되었고, 기존 Windows 프록시 전달 시 Node/npm 다운로드가 가능했다.

[wsl-dev.sh](../tools/wsl-dev.sh)는 사용자 전용 Node와 npm 캐시만 활성화한다. `dev`에서는 해당 Node의 환경 프록시 지원을 활성화하되 localhost는 프록시에서 제외한다. 실제 시세 조회는 외부 공급자의 네트워크/지원 상태에 따라 실패할 수 있다.

이 WSL 1에서는 연결 종료 시 설치 프로세스에 SIGHUP이 전달되었다. 자동 실행 때는 Windows의 숨김 PowerShell 실행기를 유지하고 `logs/wsl-*.out.log`, `logs/wsl-*.err.log`로 확인한다. 이는 설치된 서비스가 아니라 해당 작업 동안 실행되는 일반 프로세스다.

## 시제품과 실제 앱의 차이

- `docs/redesign/full-app.html`: 별도 시제품. 설치 없이 열며 실제 앱 데이터에 연결되지 않는다.
- `http://localhost:5173`: 저장소의 실제 앱. 개편 문서를 설치하는 명령은 없으며, 설계 반영은 별도 코드 구현이다.
- 개편 앱은 일반 저장소에 샘플을 자동 생성하거나 의미를 바꾸는 자동 이전을 하지 않는다. 샘플은 설정에서 별도 저장소로 연다. 처음 검수할 때는 별도 브라우저 프로필/시크릿 창과 합성 데이터를 사용한다.
- 브라우저 프로필·호스트·포트가 달라지면 IndexedDB 저장 공간도 달라질 수 있다. 배포 앱의 데이터가 로컬 앱에 자동으로 옮겨지는 것은 아니다.
- 기존 제품의 계산 테스트 통과는 재설계 인수 기준 전체나 세무 정확성 보증이 아니다.

## 변경하지 않는 것

Docker, WSL 배포판/버전, 시스템 Node, Windows/WSL 셸 프로필, 전역 npm 패키지, 프록시/방화벽 설정, 실제 개인 자산 데이터, 원격 저장소·배포는 변경하지 않는다. Node 공식 archive와 SHA256 목록을 HTTPS로 받아 검증하며 원격 스크립트를 바로 실행하지 않는다.

진행 결과와 실행 로그는 이번 작업의 최종 인계에 기록한다. 실패한 설치를 성공으로 처리하거나 일부 설치 상태로 제품 테스트가 끝났다고 판단하지 않는다.

## 2026-09-14 확인 결과

- 전용 Node 22.23.2/npm 10.9.8 설치, 기존 lockfile 기준 494개 패키지 설치 완료.
- 초기 기준선 88개, R1-A 102개, 최초 개편 145개에서 실제 백업 호환/화면 보완 후 154개 테스트로 확장해 통과했다(2026-09-15). 최신 적용 내역은 [11. 보완 적용](redesign/11-review-fixes-applied.md)을 참고한다.
- `http://127.0.0.1:5173` 개발 서버 HTTP 200 확인. Docker나 별도 DB 서버는 사용하지 않는다.
- 실제 앱 수정 범위·검증·지원 경계는 [적용 안내](redesign/APPLIED-REDESIGN.md)와 [적용 기록](redesign/09-implementation-progress.md)에서 확인한다.
- 브라우저 회귀 검사는 Windows 저장소에서 `node tools/check-local-app.cjs`로 실행한다.
  기존 Chrome과 임시 프로필을 사용하고 시세 API는 합성 응답으로 대체한다.
- 현재 자동 실행한 서버는 숨김 PowerShell의 일반 프로세스다. 이 대화에서 종료를
  요청할 수 있으며 자동 시작 서비스로 등록한 것은 아니다. 직접 다시 실행할 때는
  위의 `-Action dev` 명령을 사용하고, 사용 중인 5173 서버가 있으면 먼저 종료한다.
