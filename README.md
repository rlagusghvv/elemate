# EleMate

자기 컴퓨터를 자기 전용 원격 에이전트로 바꾸는 설치형 앱입니다.

핵심 전제는 단순합니다.

- 중앙 서버에 모두 모여 쓰는 서비스가 아닙니다.
- 각 사용자가 자기 장비에 직접 설치합니다.
- 각 사용자는 자기 GPT 계정과 자기 원격 연결 계정을 붙입니다.
- 휴대폰에서 자기 장비와 채팅하며 일을 시킵니다.

제품 방향 문서는 [docs/personal-device-agent.md](/Users/kimhyeonho/Documents/Playground/docs/personal-device-agent.md)에 정리했습니다.

## 지금 되는 것

- 데스크탑 앱에서 장비 연결 상태 확인
- ChatGPT 로그인 기반 Codex 런타임 사용
- 작업 폴더 연결
- Tailscale 기반 휴대폰 접속 링크 생성
- 자유 채팅
- 로컬 파일/셸 기반 작업 실행 구조
- 브라우저 오퍼레이터 세션
- 승인 게이트와 리플레이 아티팩트
- Electron 데스크탑 셸
- macOS 백그라운드 상시 실행 스크립트

## 사용자 관점 설치 순서

중요한 점 하나가 있습니다.

- 장기적으로는 공개 랜딩에서 `DMG 다운로드`를 눌러 설치하는 구조가 메인입니다.
- 현재 저장소 안에서는 여전히 개발용 스크립트 실행 경로도 유지하고 있습니다.
- 비개발자 대상 배포는 `npm`, `bash`, `brew`보다 `DMG/PKG`가 맞습니다.

### 1. 공개 배포 기준 권장 흐름

1. 랜딩 사이트에서 `Mac용 다운로드`
2. `EleMate.app` 설치
3. 앱 안에서 `AI 연결`, `내 폴더`, `휴대폰 연결`

배포 구조는 [distribution.md](/Users/kimhyeonho/Documents/Playground/docs/distribution.md)에 정리했습니다.

### 2. 현재 저장소 기준 개발용 실행

```bash
./scripts/run_elemate_desktop.sh
```

처음 실행이라 필요한 준비가 아직 없으면, 이 명령이 아래를 먼저 자동으로 준비합니다.

- Python 가상환경
- API 의존성
- 루트 npm 의존성
- 웹 빌드

### 3. 앱 안에서 한 번만 연결

앱 첫 화면 마법사에서 아래만 끝내면 됩니다.

1. `AI 연결 시작`
2. `내 폴더 고르기`
3. `원격 연결 앱 열기`
4. `휴대폰 접속 켜기`
5. 필요하면 `항상 켜두기`

그 다음부터는 휴대폰 링크를 열고 바로 대화하면 됩니다.

### 설치가 막혔을 때

설치 중 `npm`, `python3` 같은 개발자 용어를 그대로 보여주면 비개발자 입장에서는 다음 행동을 결정하기 어렵습니다.

현재 `./scripts/setup_elemate_desktop.sh`는 아래처럼 동작합니다.

- 필요한 항목이 없으면 무엇이 필요한지 쉬운 문장으로 설명합니다.
- 바로 설치할 수 있는 다운로드 페이지를 자동으로 엽니다.
- 설치가 끝난 뒤 어떤 명령을 다시 실행하면 되는지 함께 보여줍니다.

직접 개발용 실행이 필요할 때만 아래 명령을 씁니다.

```bash
npm --workspace apps/desktop run start
```

## 휴대폰에서 접속하기

EleMate는 Tailscale을 원격 접속 계층으로 사용합니다. 다만 제품 UI에서는 기술 용어를 최소화하고, 사용자는 `휴대폰 접속 켜기`와 `내 접속 링크 복사`만 쓰면 되도록 구성하고 있습니다.

수동으로 설정해야 할 때는 아래를 참고하세요.

```bash
./scripts/setup_tailscale_serve.sh
```

또는

```bash
npm run setup:tailscale
```

구조는 다음과 같습니다.

- 웹은 `127.0.0.1:3000`에서 실행
- 웹이 `/elemate-api/*`를 로컬 API로 프록시
- 원격 사용자는 자기 전용 포털/대화 세션으로 자동 분리

## 항상 켜두기

macOS에서는 앱을 닫아도 장비가 계속 대기하도록 launchd 기반 백그라운드 실행을 설정할 수 있습니다.

설치:

```bash
./scripts/install_elemate_launch_agent.sh
```

해제:

```bash
./scripts/uninstall_elemate_launch_agent.sh
```

상태 확인:

```bash
./scripts/status_elemate_launch_agent.sh
```

또는

```bash
npm run install:daemon
npm run uninstall:daemon
npm run status:daemon
```

## 개발용 개별 실행

### API

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --port 8000
```

### Web

```bash
cd apps/web
npm install
npm run dev
```

### Desktop packaging

```bash
npm --workspace apps/desktop run pack
npm --workspace apps/desktop run dist
```

## 공개 사이트 서버

맥미니에서 `공개 랜딩/다운로드 사이트`만 따로 돌리려면 아래 문서를 보면 됩니다.

- [public-site-deploy.md](/Users/kimhyeonho/Documents/Playground/docs/public-site-deploy.md)

핵심 명령만 적으면:

```bash
cp apps/web/.env.production.local.example apps/web/.env.production.local
./scripts/setup_elemate_public_site.sh
ELEMATE_PUBLIC_PORT=4010 ./scripts/install_elemate_public_site_launch_agent.sh
```

## 저장소 구조

- `apps/web`: 사용자 UI
- `apps/api`: 로컬 에이전트 API
- `apps/desktop`: Electron 데스크탑 앱
- `apps/runner`: desktop control runner 명세
- `packages/shared`: 공유 타입
- `logs`, `artifacts`: 실행 로그와 산출물

## 개발 참고

- 기본 DB는 SQLite: `apps/api/data/elemate.db`
- 아티팩트는 `/artifacts/<task_id>/` 아래 저장
- 로그는 `logs/<task_id>.jsonl`에 저장
- 패키징된 데스크탑 앱은 아직 완전 독립형이 아니며, 로컬 Python/API 런타임이 필요합니다
- 현재 브라우저/데스크탑 제어는 브라우저 세션 중심이며 OS 전역 자동화는 아직 확장 중입니다

## 외부 배포 상태

현재는 `repo clone -> setup script 실행` 단계입니다.

외부 사용자가 랜딩 페이지에서 곧바로 설치하게 하려면 다음 작업이 추가로 필요합니다.

1. 공개 다운로드 주소
2. 서명된 설치 파일 또는 호스팅된 설치 스크립트
3. 업데이트 경로
4. 첫 실행 마법사
