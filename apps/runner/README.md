# Runner

Playwright 또는 desktop-control gateway를 연결하는 러너입니다.

## MVP 역할

- 승인 없는 안전 단계는 자동 실행
- `computer_use` 액션은 리플레이 가능한 이벤트로 기록
- 위험 액션은 `approval.request` 직전에서 중단
- 스크린샷과 액션 JSON은 `/artifacts/<task_id>/` 아래 저장

## Action Contract

desktop/browser 액션 이벤트는 [`desktop-action.schema.json`](/Users/kimhyeonho/Documents/Playground/packages/shared/desktop-action.schema.json)을 따릅니다.

## Planned Next Step

2차 개발에서 Playwright 세션과 실제 클릭/타이핑/스크롤 executor를 연결합니다.
