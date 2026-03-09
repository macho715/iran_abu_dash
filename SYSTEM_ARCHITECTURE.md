# UrgentDash System Architecture

## 1. 개요

| 항목 | 내용 |
|------|------|
| 프로젝트 | `iran_abu_dash` |
| 목적 | 이란·UAE 위기 대시보드용 실시간 상태 전달 |
| 발행 cadence | GHA 15분 주기, 매 사이클 refresh (freshness gate 없음) |
| 대시보드 freshness 기준 | 1시간 stale / 2시간 severe / 4시간 critical |
| 공개 source of truth | `origin/urgentdash-live/live/latest.json` |
| 대시보드 전략 | `latest.json` fast poll, `live/v/<version>/state-lite.json`, `state-ai.json` lazy fetch |
| canonical 프론트엔드 | `react/` |

## 2. 전체 흐름

```mermaid
flowchart LR
    subgraph Sources["수집 소스"]
        Scrape["UAE media / RSS / SNS"]
        Tier["tier0 / tier1 / tier2"]
    end

    subgraph Runtime["런타임"]
        Lite["lite stage"]
        AI["AI stage"]
        State["state_engine"]
    end

    subgraph Live["live bundle"]
        Latest["live/latest.json"]
        LiteFile["live/v/<version>/state-lite.json"]
        AIFile["live/v/<version>/state-ai.json"]
        Compat["live/hyie_state.json"]
    end

    subgraph Clients["클라이언트"]
        API["FastAPI /api/state /api/live/*"]
        React["React / Vercel"]
        Legacy["legacy static html (compat)"]
    end

    Scrape --> Lite
    Tier --> Lite
    Lite --> State
    State --> LiteFile
    Lite --> Latest
    Lite --> Compat
    Lite --> AI
    AI --> AIFile
    AI --> Latest
    AI --> Compat
    Latest --> React
    LiteFile --> React
    AIFile --> React
    Compat --> API
    Compat --> Legacy
```

Vercel `react/api/state.js`는 `latest.json` 포인터를 읽어 LiteFile·AiFile을 병합한 합성 payload를 React에 전달한다. 로컬 FastAPI는 Compat(hyie_state)를 직접 사용.

### 2.1 전체 파이프라인 (상세 Mermaid)

```mermaid
flowchart TB
    subgraph Ext["1. 외부 소스"]
        UAEMedia["UAE media (Playwright)"]
        RSS["RSS (AP, Reuters 등)"]
        Tier0["tier0"]
        Tier1["tier1"]
        Tier2["tier2"]
    end

    subgraph GHA["2. GitHub Actions"]
        Cron["cron 12,27,42,57"]
        LiteJob["lite: scrape → state_engine → publish"]
        AIJob["ai: NotebookLM/fallback → publish"]
        Cron --> LiteJob
        LiteJob -->|artifact| AIJob
    end

    subgraph Live["3. live bundle (urgentdash-live)"]
        Latest["latest.json"]
        LiteFile["state-lite.json"]
        AIFile["state-ai.json"]
        Compat["hyie_state.json"]
    end

    subgraph API["4. API 계층"]
        VercelState["Vercel /api/state (state.js)"]
        VercelLive["Vercel /api/live/* (_liveProxy)"]
        FastAPI["로컬 FastAPI health.py"]
    end

    subgraph React["5. React"]
        useData["useDashboardData"]
        Tabs["Overview | Intel | Routes | 긴급 판단 | Checklist"]
    end

    UAEMedia --> LiteJob
    RSS --> LiteJob
    Tier0 --> LiteJob
    Tier1 --> LiteJob
    Tier2 --> LiteJob

    LiteJob --> Latest
    LiteJob --> LiteFile
    LiteJob --> Compat
    AIJob --> AIFile
    AIJob --> Latest
    AIJob --> Compat

    Latest --> VercelState
    LiteFile --> VercelState
    AIFile --> VercelState
    Latest --> VercelLive
    LiteFile --> VercelLive
    AIFile --> VercelLive
    Compat --> FastAPI

    VercelState --> useData
    VercelLive --> useData
    FastAPI --> useData
    useData --> Tabs
```

## 3. GitHub Actions

```mermaid
sequenceDiagram
    participant GHA as GitHub Actions
    participant Lite as lite job
    participant AI as ai job
    participant GH as urgentdash-live

    GHA->>Lite: cron 12,27,42,57
    Lite->>Lite: 매 사이클 refresh (skip 없음)
    Lite->>Lite: scrape + HyIE state + live/latest.json
    Lite->>GH: publish lite bundle
    Lite->>AI: upload artifact (live + state/ai_input.json)
    AI->>AI: NotebookLM or fallback
    AI->>GH: publish state-ai.json + patch latest.json
    AI->>GH: prune versions older than 7 days
```

## 4. Live Bundle Layout

```text
live/
  latest.json
  hyie_state.json
  last_updated.json
  v/
    2026-03-06T05-27-22Z/
      state-lite.json
      state-ai.json
```

- `latest.json`
  - `version`, `collectedAt`, `stateTs`
  - `liteUrl`, `aiVersion`, `aiUpdatedAt`, `aiUrl`, `legacyUrl`
  - `status.lite`, `status.ai`
  - split health metadata (`lastLiteSuccessAt`, `lastAiSuccessAt`, ...)
- `state-lite.json`
  - 기존 HyIE snapshot schema 유지
  - `ai_analysis` 제외
- `state-ai.json`
  - 같은 `version`에 대한 AI patch payload
- `hyie_state.json`
  - 레거시 클라이언트용 merge 결과

## 5. 주요 모듈

| 파일 | 역할 |
|------|------|
| `src/iran_monitor/app.py` | lite stage / AI stage 분리, storage upsert, live publish |
| `src/iran_monitor/live_publish.py` | `latest.json`, versioned snapshots, compat file, prune |
| `src/iran_monitor/health.py` | `/health`, `/api/state`, `/api/live/latest`, `/api/live/v/...`, **요청 기반 auto-refresh** |
| `scripts/run_now.py` | `--mode full|lite|ai` CLI |
| `scripts/export_hyie_live.py` | 현재 state에서 live bundle 재생성 |
| `react/src/hooks/useDashboardData.js` | 데이터 획득·폴링·history/timeline·오프라인·알림·사운드 |
| `react/src/App.jsx` | 얇은 셸 (useDashboardData + 탭 라우팅) |
| `react/src/components/Simulator.jsx` | 긴급 판단 탭: 상황 선택 → 즉시 권고·추천 경로 |
| `react/api/state.js` | Vercel /api/state: latest 포인터 → lite+ai 병합 |
| `react/api/_liveProxy.js` | upstream fetch, no-store 캐시 제어, fixed source |

## 6. API

### 6.0 /api/state 합성 경로 (Vercel state.js)

```mermaid
flowchart TD
    subgraph Request["요청"]
        Client["React /api/state"]
    end

    subgraph StateJS["react/api/state.js"]
        Step1["1. fetch latest.json"]
        Step2["2. liteUrl → state-lite.json"]
        Step3["3. aiUrl → state-ai.json"]
        Step4["4. merge lite + ai"]
        Step5["5. 반환"]
    end

    subgraph Upstream["urgentdash-live raw"]
        Latest["live/latest.json"]
        LiteFile["live/v/<v>/state-lite.json"]
        AiFile["live/v/<v>/state-ai.json"]
    end

    Client --> Step1
    Step1 --> Latest
    Step1 -->|pointer| Step2
    Step1 -->|pointer| Step3
    Step2 --> LiteFile
    Step3 --> AiFile
    Step2 --> Step4
    Step3 --> Step4
    Step4 --> Step5
    Step5 --> Client

    Step1 -->|실패| Fallback["legacy fallback"]
    Fallback --> Step5
```

### 6.1 엔드포인트

| 엔드포인트 | 설명 |
| `GET /health` | lite/ai split health metadata 반환 |
| `GET /api/state` | `latest.json` 포인터 → lite+ai artifact 병합 합성 payload (legacy fallback 유지) |
| `GET /api/live/latest` | 포인터 payload |
| `GET /api/live/v/{version}/{artifact}` | `state-lite.json` 또는 `state-ai.json` |
| `GET/POST /api/state/egress-eta` | 수동 이그레스 ETA |

**요청 기반 auto-refresh** (health.py): `/api/live/latest` 또는 `/api/state` 요청 시 `live/latest.json`이 없거나 오래됐으면 `run_lite_cycle()`를 직접 실행 후 최신 번들 반환. 별도 monitor 프로세스 없이 `start_local_dashboard.ps1`만으로 1시간 이상 stale 후 다음 poll에서 자동 수집. lock, cooldown, timeout은 `config.py`에 설정.

## 7. 로컬 실행

- `python scripts/run_now.py --mode lite`
- `python scripts/run_now.py --mode ai --ai-input state/ai_input.json --telegram-send`
- `python scripts/run_now.py --mode full --telegram-send`
- `python scripts/run_monitor.py`

## 8. 호환성 원칙

- React 앱(`react/`)이 canonical 프론트엔드다.
- 레거시 HTML(`ui/index_v2.html`)은 호환성 확인과 수동 fallback 용도로만 유지한다.
- Vercel은 same-origin `/api/live/latest`, `/api/live/v/...`, `/api/state`를 우선 호출하고, 이 API들은 `macho715/iran_abu_dash@urgentdash-live`의 `live/`를 no-store 프록시한다.
- `livePointer.js`는 구형 `latest.json` 포맷(`litePath`, `publishedAt` 등)을 `normalizeLatestPointer`에서 호환 처리한다.
- `/api/state`(Vercel `react/api/state.js`)는 `latest.json` 포인터를 읽어 lite+ai artifact를 병합한 합성 payload를 반환한다. upstream 없을 때만 legacy fallback.

## 9. UI 구성 (2026-03-08 기준)

| 요소 | 설명 |
|------|------|
| 헤더 | liveLagMinutes, stateTs, source health, stale 배너 (`데이터가 N분 전입니다`) |
| Intel | Intel Feed `official`→`fresh`→`repeated` 정렬, repeated-only 시 no-fresh 배너 |
| 긴급 판단 | 상황 선택 기반 즉시 권고·추천 경로 (기존 Simulator 대체) |

Intel Feed status: `official` 신규 공식 신호, `fresh` 신규 일반 신호, `repeated` 이미 본 신호.

## 10. 관련 문서

- [README.md](./README.md)
- [Iran Abu Dash 운영 안정화 및 긴급 판단 UI 개편 종합 문서](./Iran%20Abu%20Dash%20운영%20안정화%20및%20긴급%20판단%20UI%20개편%20종합%20문서.md)
- [COMPONENTS.md](./COMPONENTS.md)
- [LAYOUT.md](./LAYOUT.md)
- [의존성.md](./의존성.md)
- [patchplan.md](./patchplan.md)
- [MERGE_HISTORY_2026-03-09.md](./MERGE_HISTORY_2026-03-09.md)
