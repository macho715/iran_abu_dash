# UrgentDash Independent

HYIE 전황 실시간 모니터링. 현재 로컬 기준의 canonical 프론트엔드는 `react/`이며, 전달 경로는 `lite snapshot` 우선, `AI enrich` 후행 구조로 동작한다. `ui/index_v2.html`은 레거시 호환용으로만 유지한다.

## 실행

### API + React 대시보드 (canonical)
```powershell
.\start_local_dashboard.ps1
# API state : http://127.0.0.1:8000/api/state
# API latest: http://127.0.0.1:8000/api/live/latest
# React     : http://127.0.0.1:5173
```

로컬 대시보드는 `/api/live/latest` 또는 `/api/state` 요청 시 `live/latest.json`이 오래됐거나 없으면 lite 수집을 자동으로 다시 실행한다.

레거시 정적 UI는 필요할 때만 `ui/index_v2.html`을 직접 열어 호환 확인에 사용한다.

### React (수동 실행)
```bash
cd react
npm install
npm run dev
```

### 원샷 실행
```bash
python scripts/run_now.py --mode full --telegram-send
python scripts/run_now.py --mode lite
python scripts/run_now.py --mode ai --ai-input state/ai_input.json --telegram-send
```

## GitHub Actions

- 워크플로: `.github/workflows/monitor.yml`
- 스케줄: `7,22,37,52 * * * *`
- Gate: 마지막 `live/latest.json` 발행 시각이 25분 이내면 skip
- Job 1: lite stage 실행 후 `live/latest.json`, `live/v/<version>/state-lite.json`, `live/hyie_state.json` 발행
- Job 2: 같은 version에 대해 AI enrich 실행 후 `live/v/<version>/state-ai.json` 추가 발행
- 공개 source of truth: `origin/urgentdash-live/live/latest.json`

## 필수

- Python 3.11+, Node.js
- `requirements.txt`
- NotebookLM 인증은 AI enrich에만 필요
  - 로컬: `nlm login`
  - GHA: `NLM_COOKIES_JSON`, `NLM_METADATA_JSON`

## 핵심 파일

- `live/latest.json`: React/Vercel이 30초마다 polling 하는 포인터
- `live/v/<version>/state-lite.json`: AI 없는 canonical snapshot
- `live/v/<version>/state-ai.json`: AI patch payload
- `live/hyie_state.json`: 레거시 호환 snapshot

## 작업 트리 원칙

- `react/`와 `src/`가 현재 개발 기준이다.
- `ui/index_v2.html`과 `ui/hyie-erc2-dashboard.jsx`는 레거시 호환 경로다.
- `db/`, `reports/`, `urgentdash_snapshots/`, `live/v/`, `state/ai_input.json` 같은 로컬 runtime 산출물은 main 브랜치 기준 추적 대상에서 제외한다.

Vercel 배포본은 same-origin `/api/live/latest`, `/api/live/v/...`, `/api/state`를 우선 호출하고, 이 API들은 `urgentdash-live` 브랜치의 `live/` 아티팩트를 no-store 프록시한다. 대시보드 freshness 기준은 1시간이다.

## 문서

- [COMPONENTS.md](./COMPONENTS.md)
- [LAYOUT.md](./LAYOUT.md)
- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)
- [의존성.md](./의존성.md)
- [patchplan.md](./patchplan.md)
