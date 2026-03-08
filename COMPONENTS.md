# UrgentDash Components

HyIE ERC² 대시보드 React 컴포넌트 문서.

---

## 1. 개요

| 컴포넌트/훅 | 경로 | 역할 |
|-------------|------|------|
| useDashboardData | `react/src/hooks/useDashboardData.js` | 데이터 획득·폴링·history/timeline·오프라인·알림·사운드·export |
| App | `react/src/App.jsx` | 얇은 셸 (useDashboardData + 탭 라우팅) |
| DashboardHeader | `react/src/components/DashboardHeader.jsx` | 헤더, Pill, Refresh, 알림/사운드 토글, 오프라인 배너 |
| TabBar | `react/src/components/TabBar.jsx` | 탭 버튼 바 |
| ShortcutsOverlay | `react/src/components/ShortcutsOverlay.jsx` | 키보드 단축키 가이드 |
| HistoryPlayback | `react/src/components/HistoryPlayback.jsx` | 히스토리 시점 선택·비교 |
| OverviewTab | `react/src/components/tabs/OverviewTab.jsx` | Gauge, Likelihood, Conflict Stats, 루트 요약 |
| AnalysisTab | `react/src/components/tabs/AnalysisTab.jsx` | MultiLineChart, Sparkline, TimelinePanel, HistoryPlayback |
| IntelTab | `react/src/components/tabs/IntelTab.jsx` | Intel Feed 필터·카드 목록 |
| IndicatorsTab | `react/src/components/tabs/IndicatorsTab.jsx` | 지표 카드, Evidence Floor |
| RoutesTab | `react/src/components/tabs/RoutesTab.jsx` | RouteMapLeaflet, 루트 상세 카드 |
| ChecklistTab | `react/src/components/tabs/ChecklistTab.jsx` | 대피 체크리스트 |
| Card, Pill, Bar, Gauge | `react/src/components/ui.jsx` | 재사용 UI |
| Sparkline, MultiLineChart | `react/src/components/charts.jsx` | 차트 |
| TimelinePanel | `react/src/components/TimelinePanel.jsx` | 이벤트 타임라인 |
| RouteMapLeaflet | `react/src/components/RouteMapLeaflet.jsx` | Leaflet 기반 루트 맵 |
| Simulator | `react/src/components/Simulator.jsx` | 긴급 판단: 상황 선택 기반 즉시 권고·추천 경로 |
| TabStatePanel | `react/src/components/TabStatePanel.jsx` | 로딩/에러/empty/no-fresh 배너 |
| intelStatus | `react/src/lib/intelStatus.js` | countIntelStatuses(feed) |
| deriveState | `react/src/lib/deriveState.js` | gateState, modeState, liveLagMinutes, staleSeverity 등 파생 상태 |
| normalizeIncomingPayload | `react/src/lib/normalize.js` | payload 정규화, intelFeed status(official/fresh/repeated)·firstSeenTs |
| livePointer | `react/src/lib/livePointer.js` | fetchLatestPointer, fetchPointerArtifact, normalizeLatestPointer |
| offlineCache | `react/src/lib/offlineCache.js` | IndexedDB 캐시, 오프라인 fallback |

---

## 2. 데이터 흐름 아키텍처

**데이터 획득 프로세스** (useDashboardData.js)

```mermaid
flowchart TD
    subgraph Triggers [트리거]
        Mount[마운트]
        FastPoll[fastPoll 30초]
    end

    subgraph Fetch [fetch]
        LatestCandidates[getLatestCandidates]
        FetchLatest[fetchLatestPointer]
        API[API /api/live/latest]
        RawLatest[GitHub raw latest.json]
        FetchLite[fetchPointerArtifact liteUrl]
        FetchAi[fetchPointerArtifact aiUrl]
    end

    subgraph Process [처리]
        Merge[lite + ai merge]
        Normalize[normalizeIncomingPayload]
        Apply[applyDashboard]
        Derive[deriveState]
    end

    subgraph Fallback [레거시 fallback]
        Legacy[getDashboardCandidates/getFastStateCandidates]
    end

    subgraph AppState [App 상태]
        Dash[dash]
        Derived[derived]
        History[history]
        Timeline[timeline]
    end

    Mount --> FetchLatest
    FastPoll --> FetchLatest
    LatestCandidates --> FetchLatest
    FetchLatest --> API
    FetchLatest --> RawLatest
    FetchLatest --> FetchLite
    versionChanged --> FetchLite
    aiVersionChanged --> FetchAi
    FetchLite --> Merge
    FetchAi --> Merge
    Merge --> Normalize --> Apply
    FetchLatest -->|실패| Legacy
    Legacy --> Normalize
    Apply --> Derive
    Apply --> Dash
    Derive --> Derived
    Apply --> History
    Apply --> Timeline
```

**주요 흐름** (useDashboardData.js):
- `getLatestCandidates()` → `fetchLatestPointer(candidates)` 30초 poll
- `version` 변경 시 `fetchPointerArtifact(liteUrl)` → `state-lite.json`
- `aiVersion` 변경 시 `fetchPointerArtifact(aiUrl)` → `state-ai.json` merge
- 실패 시 레거시 `getDashboardCandidates` / `getFastStateCandidates` fallback
- 오프라인 시 `loadCachedDash()` (offlineCache.js, IndexedDB)
- applyDashboard: `deriveState` → `appendHistory` → `buildDiffEvents` → `mergeTimelineWithNoiseGate`

**livePointer.js 호환**  
구형 `latest.json` 포맷(`litePath`, `publishedAt`, `lite_path` 등)도 `normalizeLatestPointer`에서 처리.

**Vercel /api/state 합성 경로** (react/api/state.js)

```mermaid
flowchart TD
    subgraph Vercel [Vercel Serverless]
        StateAPI["/api/state"]
        LatestFetch["fetch latest.json"]
        LiteFetch["fetch liteUrl"]
        AiFetch["fetch aiUrl"]
        Merge["merge lite + ai"]
        Fallback["legacy fallback"]
    end

    subgraph Upstream [urgentdash-live raw]
        Latest["live/latest.json"]
        LiteFile["live/v/<v>/state-lite.json"]
        AiFile["live/v/<v>/state-ai.json"]
    end

    StateAPI --> LatestFetch
    LatestFetch --> Latest
    LatestFetch -->|pointer| LiteFetch
    LatestFetch -->|pointer| AiFetch
    LiteFetch --> LiteFile
    AiFetch --> AiFile
    LiteFetch --> Merge
    AiFetch --> Merge
    Merge --> StateAPI
    LatestFetch -->|실패| Fallback
```

---

## 3. 데이터 소스 분류표

| 소스 | 타입 | 갱신 | 비고 |
|------|------|------|------|
| latest.json | 외부 | 30초 poll | `getLatestCandidates` → `fetchLatestPointer` |
| state-lite.json, state-ai.json | 외부 | version/aiVersion 변경 시 | `fetchPointerArtifact` (livePointer.js) |
| API / GitHub raw | 외부 | 레거시 fallback | `getDashboardCandidates` |
| dash | 상태 | fetch 시 | intelFeed, indicators, hypotheses, routes, checklist, metadata |
| derived | 파생 | dash 변경 시 | `deriveState(dash, egress)`, `liveLagMinutes`, `staleWarningVisible`, `sourceHealthLabel`, `staleSeverity` (35m/60m/120m) |
| history | 상태 | appendHistory | localStorage 동기화, 최대 96 |
| timeline | 상태 | buildDiffEvents, logEvent | localStorage 동기화, 최대 220 |
| egressLossETA | 상태 | dash.metadata 또는 localStorage | 사용자 수동 저장 |
| offlineCache | 캐시 | IndexedDB | 오프라인 시 `loadCachedDash` |
| KEY_ASSUMPTIONS | 상수 | **고정** | hyieLegacyContent.js |
| I02_SEGMENTS, ROUTE_BUFFER_FACTOR, DATA_REVALIDATION_POLICY, STALE_WARNING_BANNER_THRESHOLD_MINUTES | 상수 | **고정** | constants.js |
| normalize.js (`react/src/lib/normalize.js`) Intel status/firstSeenTs | 파생 | dash.intelFeed | status: official/fresh/repeated, firstSeenTs |
| INITIAL_DASHBOARD | fallback | **고정** | fetch 실패 시 사용 |

---

## 4. 페이지별 컴포넌트·데이터·로직

### 4.1 Overview 탭

| 컴포넌트/요소 | 데이터 소스 | 고정/업데이트 | 작동 로직 |
|---------------|-------------|---------------|-----------|
| Pill (MODE, Gate, I02) | derived | 업데이트 | deriveState: gateState(I01/I03/I04·triggers), modeState(degraded/ds/triggers), airspaceState(I02) |
| Header (liveLagMinutes, stateTs, source health) | derived | 업데이트 | liveLagMinutes, staleWarningVisible, sourceHealthLabel |
| Gauge (EvidenceConf, ΔScore, Urgency) | derived | 업데이트 | ec, ds, urgencyScore(egress 기반) |
| Likelihood | derived | 업데이트 | H2 score → likelihoodLabel, likelihoodBand, likelihoodBasis |
| Top routes | dash.routes, derived | 업데이트 | usableRoutes = routes 필터·정렬, eff = base_h × (1+cong) × ROUTE_BUFFER_FACTOR |
| Conflict Stats | derived.conflictStats | 업데이트 | normalizeConflictStats(metadata.conflictStats) |
| Key Assumptions | KEY_ASSUMPTIONS | **고정** | import 상수, map으로 렌더 |
| aiAnalysis (조건부) | dash.aiAnalysis | 업데이트 | payload에 있으면 표시 |
| AI-ish Summary | buildOfflineSummary(dash, derived) | 업데이트 | autoSummary ON 시 dash 변경 시 재생성 |

### 4.2 Analysis 탭

| 컴포넌트 | 데이터 소스 | 고정/업데이트 | 작동 로직 |
|----------|-------------|---------------|-----------|
| MultiLineChart | history | 업데이트 | histH0/H1/H2 = history.map(scores), appendHistory로 누적 |
| Sparkline (ΔScore, EC) | history | 업데이트 | histDs, histEc |
| TimelinePanel | timeline | 업데이트 | buildDiffEvents로 diff 누적, logEvent로 수동 추가, Clear/Export |

### 4.3 Intel 탭

| 컴포넌트 | 데이터 소스 | 고정/업데이트 | 작동 로직 |
|----------|-------------|---------------|-----------|
| countIntelStatuses | dash.intelFeed | 업데이트 | freshCount, repeatedCount, officialCount, hasFresh (official은 fresh로 간주) |
| TabStatePanel no-fresh | allRepeated | 업데이트 | `repeatedCount === allIntelFeed.length`일 때만 배너 표시 |
| 필터 버튼 (ALL/CRITICAL/HIGH/MEDIUM) | intelFilter (로컬) | 사용자 선택 | 카운트: 전체 feed 기준, 렌더: 필터 결과 기준 |
| Intel 카드 목록 | dash.intelFeed | 업데이트 | allIntelFeed(카운트), filteredIntelFeed(렌더), 정렬: official → fresh → repeated |
| repeated 배지 | item.status, firstSeenTs | 업데이트 | `변동없음`, stale label (h/d) |

### 4.4 Indicators 탭

| 컴포넌트 | 데이터 소스 | 고정/업데이트 | 작동 로직 |
|----------|-------------|---------------|-----------|
| Indicator 카드 | dash.indicators | 업데이트 | Bar(value=state), tier/state/detail/cv 등 normalize |
| Evidence Floor | derived | 업데이트 | evidenceFloorT0, evidenceFloorPassed |

### 4.5 Routes 탭

| 컴포넌트 | 데이터 소스 | 고정/업데이트 | 작동 로직 |
|----------|-------------|---------------|-----------|
| RouteMapLeaflet | dash.routes, dash.routeGeo | 업데이트 | routeGeo 없으면 DEFAULT_ROUTE_GEO, OSRM/Mapbox로 geometry fetch |
| Route 상세 카드 | dash.routes | 업데이트 | status, base_h, cong, effective 계산 |
| selectedRouteId | 로컬 state | 사용자 선택 | 클릭 시 하이라이트 |

### 4.6 긴급 판단 탭 (Simulator)

| 컴포넌트 | 데이터 소스 | 고정/업데이트 | 작동 로직 |
|----------|-------------|---------------|-----------|
| 초기값 | liveDash | 업데이트 | buildInitialSim: hypotheses, indicators, routes, metadata에서 복사 |
| 상황/범위/시급도/제약 선택 | sim (로컬 state) | 사용자 입력 | applyScenarioPreset, applyScopePreset 등 |
| 파생 상태 | simDash, simDerived | 시뮬레이션 | buildDashFromSim → deriveState (dash 미반영) |
| timeline | onLog | 자동 | 선택 변경 시 SIM 이벤트 자동 기록 (signature dedupe) |

### 4.7 Checklist 탭

| 컴포넌트 | 데이터 소스 | 고정/업데이트 | 작동 로직 |
|----------|-------------|---------------|-----------|
| 체크리스트 항목 | dash.checklist | 업데이트 | mergeChecklist: payload 새 항목 + prev done 유지 |
| done | 로컬 (merge) | 사용자 + fetch | 체크 시 로컬 유지, fetch 시 payload structure 병합 |

---

## 5. ui.jsx

### 5.1 Card

섹션 래퍼. children을 카드 스타일로 감쌈.

**데이터 소스** N/A (UI 래퍼) · **고정/업데이트** 고정

**Props**

| prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| children | ReactNode | - | 자식 요소 |
| style | object | - | 추가 인라인 스타일 (merge) |

**스타일**  
`background #0f172a`, `border 1px solid #334155`, `borderRadius 14`, `padding 16`, `marginBottom 12`

**사용 예**

```jsx
<Card>
  <div>내용</div>
</Card>
<Card style={{ marginBottom: 0 }}>
  ...
</Card>
```

---

### 5.2 Pill

라벨+값 조합 배지. MODE, Gate, I02 등 상태 표시용.

**데이터 소스** derived · **고정/업데이트** 업데이트

**Props**

| prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| label | string | - | 라벨 (예: "MODE") |
| value | string | - | 값 (예: "SHELTER") |
| color | string | `#94a3b8` | 값 색상 |

**스타일**  
`display flex`, `background #0b1220`, `border 1px solid #1e293b`, `borderRadius 999`, `padding 6px 10px`  
label: `fontSize 10`, `color #64748b`, `fontWeight 800`  
value: `fontSize 11`, `fontWeight 900`, `fontFamily monospace`

**사용 예**

```jsx
<Pill label="MODE" value={derived.modeState} color={derived.modeColor} />
<Pill label="Gate" value="CAUTION" color="#f59e0b" />
```

---

### 5.3 Bar

0~1 비율 진행률 바.

**데이터 소스** dash.indicators (또는 derived) · **고정/업데이트** 업데이트

**Props**

| prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| value | number | 0 | 0~1 진행률 |
| color | string | `#22c55e` | 채우기 색상 |
| h | number | 8 | 높이(px) |

**스타일**  
트랙: `background #111827`, `border 1px solid #1e293b`, `borderRadius 999`  
채우기: `width ${value*100}%`, `background color`

**사용 예**

```jsx
<Bar value={0.75} color="#22c55e" />
<Bar value={ind.state} color={ind.state >= 0.8 ? "#ef4444" : "#22c55e"} h={6} />
```

---

### 5.4 Gauge

반원 게이지. EvidenceConf, ΔScore, Urgency 등 0~1 값 표시.

**데이터 소스** derived · **고정/업데이트** 업데이트

**Props**

| prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| value | number | 0 | 0~1 값 |
| label | string | `""` | 하단 라벨 |
| sub | string | `""` | 보조 텍스트 (선택) |

**동작**

- value가 0~1로 clamp
- 색상: v≥0.8 → `#ef4444`, v≥0.4 → `#f59e0b`, else `#22c55e`
- SVG 반원 arc: cx 45, cy 52, r 28, 180도 기준

**사용 예**

```jsx
<Gauge value={derived.ec} label="EvidenceConf" sub={`thr=${derived.effectiveThreshold.toFixed(2)}`} />
<Gauge value={derived.urgencyScore} label="Urgency" sub={`egress=${egressLossETA}h`} />
```

---

## 6. charts.jsx

### 6.1 Sparkline

단일 시계열 데이터를 선 그래프로 표시.

**데이터 소스** history · **고정/업데이트** 업데이트

**Props**

| prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| data | number[] | `[]` | 시계열 데이터 |
| min | number | 0 | Y축 최소 |
| max | number | 1 | Y축 최대 |
| color | string | `#60a5fa` | 선 색상 |
| height | number | 44 | 높이(px) |

**스타일**  
viewBox `0 0 220 44`, 배경 `#0b1220`, stroke `#1e293b`, rx 10  
path: `strokeWidth 2.4`, `opacity 0.95`

**사용 예**

```jsx
<Sparkline data={histDs} min={-0.2} max={0.6} color="#60a5fa" />
<Sparkline data={histEc} color="#22c55e" />
```

---

### 6.2 MultiLineChart

여러 시계열을 한 차트에 그리기. H0, H1, H2 등 가설 추이용.

**데이터 소스** history · **고정/업데이트** 업데이트

**Props**

| prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| series | Array | `[]` | `{ id, label, color, data }[]` |
| min | number | 0 | Y축 최소 |
| max | number | 1 | Y축 최대 |
| height | number | 160 | 높이(px) |

**series 항목**

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | 시리즈 식별자 |
| label | string | 라벨 |
| color | string | 선 색상 |
| data | number[] | 시계열 |

**스타일**  
viewBox `0 0 560 160`, gridY 0.25/0.5/0.75, 마지막 점 circle r 3.6

**사용 예**

```jsx
<MultiLineChart
  height={160}
  min={0}
  max={1}
  series={[
    { id: "H0", label: "H0", color: "#22c55e", data: histH0 },
    { id: "H1", label: "H1", color: "#f59e0b", data: histH1 },
    { id: "H2", label: "H2", color: "#ef4444", data: histH2 }
  ]}
/>
```

---

## 7. TimelinePanel

이벤트 로그(타임라인) 표시. level별 색상, 필터 없음.

**데이터 소스** timeline · **고정/업데이트** 업데이트

**timeline 채우는 흐름**  
`buildDiffEvents(dash, prevDash)`로 dash 변경 시 diff 이벤트 누적 → `mergeTimelineWithNoiseGate`로 노이즈 제거 후 timeline에 반영. `logEvent(ev)`로 Simulator(자동 SIM 이벤트) 또는 사용자(수동)가 추가. Clear/Export로 제어.

**Props**

| prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| timeline | Array | `[]` | 이벤트 배열 |
| onClear | function | - | Clear 클릭 핸들러 |
| onExport | function | - | Export 클릭 핸들러 |

**이벤트 구조**

| 필드 | 타입 | 설명 |
|------|------|------|
| id | string | 고유 ID |
| level | string | ALERT, WARN, INFO, SYSTEM |
| category | string | SYSTEM, MODE, GATE 등 |
| title | string | 제목 |
| detail | string | 상세 (선택) |
| ts | string | ISO 시각 |

**LEVEL_COLORS**  
ALERT `#ef4444`, WARN `#f59e0b`, INFO `#22c55e`, SYSTEM `#94a3b8`

**사용 예**

```jsx
<TimelinePanel
  timeline={timeline}
  onClear={() => setTimeline([])}
  onExport={exportTimeline}
/>
```

---

## 8. RouteMapLeaflet

Leaflet 기반 루트 맵. OSRM/Mapbox로 도로 geometry 조회 후 Polyline 그리기.

**데이터 소스** dash.routes, dash.routeGeo · **고정/업데이트** 업데이트

**geometry fetch 순서**  
`fetchRouteGeometryCached` → OSRM 우선, Mapbox 대체, fallback(routeGeo 없으면 DEFAULT_ROUTE_GEO) 순으로 시도.

**Props**

| prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| routes | Array | `[]` | 루트 목록 `{ id, status, base_h, cong }` |
| routeGeo | object | null | 노드/waypoints (없으면 DEFAULT_ROUTE_GEO) |
| selectedId | string | null | 선택된 루트 ID |
| onSelect | function | `()=>{}` | 루트/맵 클릭 시 `(routeId|null)` 호출 |

**의존성**

- `react-leaflet`, `leaflet`
- `routeApi.js`: `fetchRouteGeometryCached`, `resolveRouteWaypoints`
- `routeGeoDefault.js`: `DEFAULT_ROUTE_GEO`
- `VITE_LEAFLET_TILES_URL`, `VITE_MAPBOX_TOKEN` (env)

**Polyline**  
status별 color, BLOCKED 시 opacity 0.65, CAUTION 시 dashArray `10 8`  
선택 시 weight 7, 기본 5

**사용 예**

```jsx
<RouteMapLeaflet
  routes={dash.routes || []}
  routeGeo={routeGeo}
  selectedId={selectedRouteId}
  onSelect={setSelectedRouteId}
/>
```

---

## 9. 긴급 판단 (Simulator)

상황 선택 기반 즉시 권고·추천 경로를 제공하는 의사결정 UI.

**데이터 소스** liveDash (초기화), sim 로컬 state (선택) · **고정/업데이트** liveDash 기반 초기화

**동작 요약**  
초기값은 `buildInitialSim(liveDash)`로 복사. 사용자가 상황/범위/시급도/제약을 선택하면 `applyScenarioPreset` 등으로 sim을 업데이트 → `buildDashFromSim` → `deriveState`로 simDerived 계산. **시뮬레이션 결과는 dash에 반영하지 않음.** 선택 변경 시 자동으로 onLog로 SIM 이벤트 전달 (signature dedupe).

**입력**

- 상황: 현재 유지, 공습 징후, 영공 폐쇄, 국경 봉쇄, 대사관 경보, 부분 정상화
- 범위: 국지, 광역, 전면
- 시급도: 즉시, 오늘 안, 대기 가능
- 제약: 항공 불가, 육로 불안 등
- Route quick edit: 정상/주의/폐쇄/+1h/초기화

**출력**

- 행동 권고 카드: action.title, action.detail, action.reason (tone: danger/warning/success)
- 추천 경로 정렬: ETA, 권장 배지, baseline 대비 변화

**Props**

| prop | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| liveDash | object | - | 현재 대시보드 데이터 |
| onLog | function | `()=>{}` | 자동 SIM 이벤트 시 `(event)` 호출 |

**사용 예**

```jsx
<Simulator
  liveDash={dash}
  onLog={(ev) => logEvent(ev)}
/>
```

---

## 10. App.jsx에서의 사용

App.jsx는 얇은 셸이며 `useDashboardData`와 탭 컴포넌트만 조합한다.

| 탭 | 탭 컴포넌트 | 내부 사용 |
|----|-------------|-----------|
| overview | OverviewTab | Card, Gauge, Pill, Bar |
| analysis | AnalysisTab | MultiLineChart, Sparkline, TimelinePanel, HistoryPlayback |
| intel | IntelTab | Card, TabStatePanel |
| indicators | IndicatorsTab | Card, Bar |
| routes | RoutesTab | RouteMapLeaflet, Card |
| sim | Simulator (긴급 판단) | Card |
| checklist | ChecklistTab | Card |

---

## 11. 관련 문서

- [README.md](./README.md)
- [Iran Abu Dash 운영 안정화 및 긴급 판단 UI 개편 종합 문서](./Iran%20Abu%20Dash%20운영%20안정화%20및%20긴급%20판단%20UI%20개편%20종합%20문서.md)
- [LAYOUT.md](./LAYOUT.md)
- [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)
- [의존성.md](./의존성.md)
- [patchplan.md](./patchplan.md)
