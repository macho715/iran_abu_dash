# Implemented Patch Plan

## 핵심 결론

- 전달 경로의 기준은 이제 `live/latest.json`이다.
- `lite snapshot`이 먼저 발행되고, `AI enrich`는 같은 version을 후행 patch한다.
- 레거시 호환을 위해 `live/hyie_state.json`은 유지한다.
- 워크플로는 파일 두 개로 쪼개지 않고, 하나의 `.github/workflows/monitor.yml` 안에서 `lite` → `ai` 두 job으로 나눈다.

## 실제 반영 내용

### 1. 런타임 분리

- `src/iran_monitor/app.py`
  - `run_lite_cycle()`
  - `run_ai_cycle()`
  - `run_full_cycle()`
- `scripts/run_now.py`
  - `--mode full|lite|ai`
  - `--ai-input state/ai_input.json`
- storage upsert는 동일 `run_id`를 공유해 dedup를 깨지 않도록 유지한다.

### 2. live bundle

```text
live/
  latest.json
  hyie_state.json
  last_updated.json
  v/
    <version>/
      state-lite.json
      state-ai.json
```

- `latest.json`
  - `version`
  - `collectedAt`
  - `stateTs`
  - `liteUrl`
  - `aiVersion`
  - `aiUpdatedAt`
  - `aiUrl`
  - `legacyUrl`
  - `status.lite`
  - `status.ai`
- `state-lite.json`
  - HyIE snapshot schema 유지
  - `ai_analysis` 제거
- `state-ai.json`
  - 같은 version에 대한 AI patch payload

### 3. API

- `GET /api/live/latest`
- `GET /api/live/v/{version}/{artifact}`
- `GET /api/state`
  - `live/hyie_state.json` 우선
  - 없으면 `state/hyie_state.json` fallback
- `GET /health`
  - `last_lite_success_at`
  - `last_ai_success_at`
  - `last_lite_duration_ms`
  - `last_ai_duration_ms`
  - `last_error_stage`
  - `stale_reason`
  - legacy alias `last_success_at`

### 4. 프론트

- React는 `latest.json`만 30초 fast poll 한다.
- `version`이 바뀌면 `state-lite.json` fetch
- `aiVersion`이 바뀌면 `state-ai.json` fetch
- 기존 `VITE_DASHBOARD_CANDIDATES`, `VITE_FAST_STATE_CANDIDATES`는 legacy fallback으로만 남긴다.
- stale한 `iran-war-notelm` raw URL 기본값은 제거했다.

### 5. GitHub Actions

- cron: `7,22,37,52 * * * *`
- freshness gate: 마지막 `collectedAt`가 25분 이내면 skip
- `lite` job
  - bundle 생성
  - `urgentdash-live` 즉시 publish
  - `live + state/ai_input.json` artifact 업로드
- `ai` job
  - artifact 다운로드
  - AI enrich
  - 같은 version republish
  - 7일보다 오래된 `live/v/*` prune

## 의도적으로 바꾼 점

- 초기 문서의 `PHASE2_REQUIRED` 전제는 현재 repo와 맞지 않아 제거했다.
- Vercel phase 1은 GitHub Raw `latest.json` consumer로 두고, runtime object storage 이전은 보류했다.
- 레거시 HTML은 phase 1에서 그대로 유지하고 compat file로만 살린다.
