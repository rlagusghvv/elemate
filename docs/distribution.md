# EleMate Distribution

## 목표 구조

EleMate는 중앙 서버에서 모두가 같이 쓰는 웹 서비스가 아니라, 각 사용자가 자기 Mac에 설치하는 개인 에이전트 앱입니다.

배포 구조는 아래처럼 단순하게 가져갑니다.

1. 공개 랜딩 사이트
2. GitHub Releases 또는 S3에서 DMG 다운로드
3. 사용자가 자기 Mac에 `EleMate.app` 설치
4. 앱 안에서 `AI 연결`, `내 폴더`, `휴대폰 연결`
5. 이후에는 휴대폰 링크에서 주로 대화

## 왜 Electron을 쓰는가

Electron은 웹 기술로 데스크탑 앱 창을 만드는 도구입니다.

중요한 점:

1. Electron은 중앙 서버가 아닙니다.
2. 앱은 사용자의 로컬 Mac에서 직접 실행됩니다.
3. 파일 선택, 시스템 권한 열기, 터미널 열기, 백그라운드 실행 같은 로컬 기능을 붙이기 쉽습니다.

즉 EleMate가 Electron을 쓴다고 해서 `웹사이트로만 동작한다`는 뜻이 아닙니다. 실제 실행은 여전히 사용자의 로컬 장비에서 일어납니다.

## 릴리스 경로

현재 저장소에는 아래 GitHub Actions 워크플로우가 있습니다.

- [release-desktop.yml](/Users/kimhyeonho/Documents/Playground/.github/workflows/release-desktop.yml)

동작:

1. `v*` 태그 push 또는 수동 실행
2. macOS GitHub Actions runner에서 아키텍처별 Python 런타임을 내려받고 EleMate API까지 미리 설치
3. DMG/ZIP 빌드
4. 선택적으로 code signing + notarization
5. 아티팩트 업로드
6. 태그 릴리스면 GitHub Release 첨부

즉 공식 설치본은 `웹 화면 + 로컬 API 엔진 + Python 런타임`을 같이 담는 구조입니다.

## code signing / notarization

아래 GitHub secrets가 있으면 릴리스 워크플로우가 자동으로 서명/노타리제이션을 시도합니다.

- `MACOS_CERT_P12_BASE64`
- `MACOS_CERT_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

없으면 unsigned 빌드로 계속 통과합니다.

## 랜딩에서 필요한 환경 변수

공개 랜딩에서 실제 다운로드 링크를 걸려면 아래 값들을 배포 환경에 넣습니다.

- `NEXT_PUBLIC_ELEMATE_DOWNLOAD_URL`
- `NEXT_PUBLIC_ELEMATE_RELEASES_URL`
- `NEXT_PUBLIC_ELEMATE_DOWNLOAD_ARM_URL`
- `NEXT_PUBLIC_ELEMATE_DOWNLOAD_INTEL_URL`

권장:

1. `NEXT_PUBLIC_ELEMATE_DOWNLOAD_URL`는 `/download`
2. 실제 파일 버튼은 ARM/Intel별 GitHub Release asset URL 사용
3. 현재 기준 기본 저장소 주소는 `https://github.com/rlagusghvv/elemate/releases`

## 아직 남은 것

현재 데스크탑 앱은 공식 설치본 기준으로 `로컬 화면 + 로컬 엔진`을 같이 배포합니다. 그래도 소비자용 최종 배포 품질까지 가려면 아래가 추가로 남습니다.

1. 실제 Apple signing secret 연결
2. 실제 notarization 성공 검증
3. 첫 실행 자동 업데이트
4. Codex / Tailscale 연결 UX 추가 단순화

즉 지금 워크플로우는 `공식 설치본 배포` 단계까지 올라왔고, 마지막 남은 건 신뢰성과 애플 배포 품질 쪽입니다.
