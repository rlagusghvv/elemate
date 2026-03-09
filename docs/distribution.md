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
2. macOS GitHub Actions runner에서 DMG/ZIP 빌드
3. 아티팩트 업로드
4. 태그 릴리스면 GitHub Release 첨부

## 랜딩에서 필요한 환경 변수

공개 랜딩에서 실제 다운로드 링크를 걸려면 아래 값들을 배포 환경에 넣습니다.

- `NEXT_PUBLIC_ELEMATE_DOWNLOAD_URL`
- `NEXT_PUBLIC_ELEMATE_RELEASES_URL`
- `NEXT_PUBLIC_ELEMATE_DOWNLOAD_ARM_URL`
- `NEXT_PUBLIC_ELEMATE_DOWNLOAD_INTEL_URL`

권장:

1. `NEXT_PUBLIC_ELEMATE_DOWNLOAD_URL`는 `/download`
2. 실제 파일 버튼은 ARM/Intel별 GitHub Release asset URL 사용

## 아직 남은 것

현재 데스크탑 앱은 `로컬 런타임과 함께 쓰는 구조`가 이미 강하게 잡혀 있지만, 완전한 소비자용 배포로 가려면 아래가 추가로 필요합니다.

1. Apple code signing
2. notarization
3. 첫 실행 자동 업데이트
4. 로컬 런타임 번들링 정리

즉 지금 워크플로우는 `배포 골격`까지는 마련한 상태이고, 소비자용 최종 배포 품질까지는 아직 추가 작업이 필요합니다.
