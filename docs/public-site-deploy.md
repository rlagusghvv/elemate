# EleMate Public Site Deploy

이 문서는 `공개 랜딩/다운로드 사이트`를 맥미니에서 돌리는 운영 절차입니다.

중요:

1. 이 서버는 `공개 페이지`만 담당합니다.
2. 실제 개인 콘솔과 휴대폰 포털은 각 사용자 장비에서 따로 동작합니다.
3. `ELEMATE_PUBLIC_SITE_MODE=landing-only`로 빌드하면 `/app`, `/portal`, `/approval`, `/plan`, `/replay`는 공개 서버에서 막힙니다.

## 서버 담당 에이전트에게 줄 명령

### 1. 코드 받기

```bash
git clone git@github.com:rlagusghvv/elemate.git
cd elemate
git checkout main
```

### 2. 운영 환경 파일 준비

```bash
cp apps/web/.env.production.local.example apps/web/.env.production.local
```

필요 시 아래 값을 실제 운영값으로 수정:

- `NEXT_PUBLIC_ELEMATE_RELEASES_URL`
- `NEXT_PUBLIC_ELEMATE_DOWNLOAD_ARM_URL`
- `NEXT_PUBLIC_ELEMATE_DOWNLOAD_INTEL_URL`

### 3. 빌드

```bash
./scripts/setup_elemate_public_site.sh
```

### 4. 포그라운드 실행 테스트

```bash
ELEMATE_PUBLIC_PORT=4010 ./scripts/run_elemate_public_site.sh
```

### 5. 상시 실행 등록

```bash
ELEMATE_PUBLIC_PORT=4010 ./scripts/install_elemate_public_site_launch_agent.sh
./scripts/status_elemate_public_site_launch_agent.sh
```

## 운영 메모

### 공개 사이트 포트

기본 포트는 `4010`입니다.

리버스 프록시 예:

- `https://elemate.yourdomain.com` -> `http://127.0.0.1:4010`

### 업데이트 배포

```bash
cd /path/to/elemate
git fetch origin
git checkout main
git pull
./scripts/setup_elemate_public_site.sh
./scripts/install_elemate_public_site_launch_agent.sh
```

### 로그

- `logs/public-web.stdout.log`
- `logs/public-web.stderr.log`
- `logs/public-site.launchd.stdout.log`
- `logs/public-site.launchd.stderr.log`
