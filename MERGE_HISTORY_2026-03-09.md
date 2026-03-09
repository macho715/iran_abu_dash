# PR 통합 및 로컬 실행 작업 기록

작성일: 2026-03-09  
작업 브랜치: `main`  
최종 로컬 HEAD: `b6df44e`

## 1. 목적

이 문서는 2026-03-09 기준으로 `macho715/iran_abu_dash` 저장소의 PR 검토, 로컬 병합, 충돌 해소, 회귀 수정, 테스트 검증, 로컬 실행 상태를 재현 가능하게 남기기 위한 작업 기록이다.

이번 작업의 목표는 다음 두 축이었다.

1. 기존 미반영 PR을 검토하고 로컬 `main`에 반영한다.
2. 사용자가 이미 갖고 있던 로컬 수정과 런타임 산출물은 가능한 한 보존한다.

## 2. 원격 브랜치/PR 정리 결과

초기 확인 시점 기준 기능 브랜치는 아래와 같았다.

- `codex/extend-simulator-and-derivestate-functionality` (`#5`)
- `codex/modify-sse-endpoint-and-hook-logic` (`#4`)
- `codex/implement-integrity-checks-for-ci-workflow` (`#2`)
- `codex/add-metrics-to-dashboard-and-reporting` (`#3`)
- `codex/define-data-contract-for-json-files` (`#6`)
- `codex/add-.stat-grid-class-for-responsive-layout` (`#7`)
- `codex/expand-layout-to-header,-main,-aside-structure` (`#8`)
- `codex/add-local-helper-to-normalize.js` (`#9`)
- `codex/update-conflictdaylabel-condition` (`#10`)
- `codex/consolidate-status-expression-rules-and-reduce-inline-styles` (`#11`)
- `codex/enhance-accessibility-for-tabs-and-modals` (`#12`)

별도 브랜치 `urgentdash-live`는 배포용 snapshot 브랜치로 취급했고, `main` 병합 대상에는 포함하지 않았다.

## 3. 1차 통합 작업

초기에는 현재 작업트리를 건드리지 않기 위해 별도 worktree를 만들고 그 위에서 통합 검토를 진행했다.

- worktree: `/mnt/c/Users/minky/Downloads/escapeplan_merge_review`
- 통합 브랜치: `review/merge-all`

이 단계에서 반영한 주요 내용:

- `#3` (`add-metrics-to-dashboard-and-reporting`)
- `#6` (`define-data-contract-for-json-files`)
- `#8` (`expand-layout-to-header,-main,-aside-structure`)

이 과정에서 PR 자체 외에 아래 회귀 수정도 함께 반영했다.

### 3.1 `setSelectedRouteId` setter 호환성 유지

문제:

- `RoutesTab`에서 React setter 스타일 updater callback을 넘길 수 있는 구조였는데, 병합 중 일반 함수처럼 다루면 상태에 함수 객체가 들어갈 수 있었다.

조치:

- `react/src/hooks/useDashboardData.js`에서 setter 시그니처를 React state setter와 호환되게 유지했다.
- 관련 회귀 테스트를 `react/src/hooks/useDashboardData.test.jsx`에 추가했다.

### 3.2 알림 설정 변경 이벤트와 KPI 계산 분리

문제:

- 알림 설정 변경 이벤트를 `alert_response`처럼 기록하면 KPI 집계 시 운영 지표와 섞여 `warningAccuracy`, `falseAlarmRate`가 왜곡됐다.

조치:

- 설정 변경은 `notification_preference`로 분리했다.
- `react/src/lib/summary.test.js`에 검증을 추가했다.

## 4. 실제 `main` 반영 전 상태

사용자 로컬 `main`은 이후 아래 통합 내용을 이미 갖고 있었지만 원격 `main`과는 갈라진 상태였다.

- 이전 통합 결과 포함
- 사용자의 추가 UI 수정 포함
- 런타임 산출물 존재

즉, `main`은 단순 fast-forward 대상이 아니라 충돌을 동반한 수동 통합 대상이었다.

## 5. 2차 통합 작업: PR #9 ~ #12

이후 새로 생긴 PR `#9`~`#12`를 기준으로 다시 정리했다.

당시 원격 상태:

- `origin/main`에는 `#12`, `#9`가 이미 병합되어 있었음
- `#10`, `#11`은 아직 원격 `main`에 없고 별도 브랜치 상태였음

### 5.1 병합 순서

실제 반영 순서는 아래와 같다.

1. 현재 작업트리 전체 stash
2. `origin/main` 병합
3. `origin/codex/update-conflictdaylabel-condition` 병합
4. `origin/codex/consolidate-status-expression-rules-and-reduce-inline-styles` 병합
5. stash pop
6. 사용자 수정과 새 PR 변경 수동 통합

생성된 merge commit:

- `033e5a8` `Merge remote-tracking branch 'origin/main'`
- `dded622` `Merge remote-tracking branch 'origin/codex/update-conflictdaylabel-condition'`
- `b6df44e` `Merge remote-tracking branch 'origin/codex/consolidate-status-expression-rules-and-reduce-inline-styles'`

주의:

- 실제 커밋 메시지의 브랜치명은 Git이 생성한 원문을 사용한다.
- 최종 HEAD는 `b6df44e`다.

## 6. PR별 반영 내용

### 6.1 PR #9 `codex/add-local-helper-to-normalize.js`

핵심:

- `react/src/lib/normalize.js`에 `toBooleanLoose()`를 추가했다.
- `metadata.degraded`를 다음 입력에서 안정적으로 boolean으로 정규화한다.
  - `true`
  - `false`
  - `"true"`
  - `"false"`
  - `1`
  - `0`

병합 시 유의점:

- 기존 schema contract 검증 로직은 유지해야 했다.
- 따라서 `normalizeMetadata()`는 기존 `schemaCompatible` / `schemaMismatchReason` 흐름을 그대로 두고, `degraded`의 입력 처리만 개선했다.

관련 테스트:

- `react/src/lib/normalize.test.js`

### 6.2 PR #10 `codex/update-conflictdaylabel-condition`

핵심:

- `react/src/lib/deriveState.js`에서 `conflictDayLabel`을 계산된 fallback day가 아니라 raw `conflict_day` 기준으로 표시하게 바꿨다.

반영 후 동작:

- `metadata.conflictStats.conflict_day` 또는 `metadata.conflict_stats.conflict_day`가 정수이면서 `0` 이상인 경우에만 `Day N`
- 그 외에는 `n/a`

이유:

- `normalizeConflictStats()`가 start date로부터 day를 계산하는 것은 내부 정규화 편의용으로는 유효하지만, UI 라벨은 실제 입력값이 없으면 `n/a`가 맞다.

관련 테스트:

- `react/src/lib/deriveState.test.js`

### 6.3 PR #11 `codex/consolidate-status-expression-rules-and-reduce-inline-styles`

핵심:

- 공통 status theme 유틸 파일 `react/src/lib/statusTheme.js` 추가
- 아래 컴포넌트의 inline color 규칙을 class/theme 기반으로 통합
  - `react/src/components/DashboardHeader.jsx`
  - `react/src/components/RouteMapLeaflet.jsx`
  - `react/src/components/tabs/OverviewTab.jsx`
  - `react/src/components/tabs/IntelTab.jsx`
  - `react/src/components/tabs/RoutesTab.jsx`
- `react/src/styles.css`에 상태 클래스와 공통 표현용 CSS 추가

충돌 해소 원칙:

- 기존 사용자의 `dashboard-shell`, `dashboard-content`, `dashboard-aside` 레이아웃은 유지
- `tab-bar-sticky-wrap`, `dashboard-content-grid` 같은 이전 레이아웃 클래스를 복구하지 않음
- status class, tooltip, legend, map header, repeated badge 등 표현 계층만 additive하게 반영

### 6.4 PR #12 `codex/enhance-accessibility-for-tabs-and-modals`

핵심:

- `react/src/components/TabBar.jsx`
  - `role="tablist"`
  - 각 탭에 `role="tab"`, `aria-selected`, `id`, `aria-controls`
  - roving `tabIndex`
  - `ArrowLeft`, `ArrowRight`, `Home`, `End` 키 이동
- `react/src/components/ShortcutsOverlay.jsx`
  - `role="dialog"`
  - `aria-modal="true"`
  - close 버튼 초기 포커스
  - Tab focus trap
  - `Escape` close
  - 닫힌 뒤 trigger focus 복귀
- 테스트 추가
  - `react/src/components/TabBar.test.jsx`
  - `react/src/components/ShortcutsOverlay.test.jsx`

충돌 해소 원칙:

- `react/src/App.jsx`는 사용자가 구성한 `DashboardAside` 레이아웃을 유지
- 접근성 요구사항은 메인 패널을 감싸는 `section[role="tabpanel"]`로 반영
- 활성 탭만 렌더링하는 기존 구조는 유지

## 7. 수동 충돌 해소 상세

### 7.1 `react/src/App.jsx`

충돌 포인트:

- 원격 `main` 쪽은 구형 레이아웃 위에 `tabpanel` 래퍼를 추가
- 로컬 작업은 `DashboardAside` 기반 `header + main + aside` 셸을 도입

최종 결정:

- 레이아웃은 로컬 셸 유지
- 메인 콘텐츠는 아래처럼 접근성 semantics 적용
  - `role="tabpanel"`
  - `id="panel-${dashboard.tab}"`
  - `aria-labelledby="tab-${dashboard.tab}"`

### 7.2 `react/src/components/TabBar.jsx`

충돌 포인트:

- 로컬 수정은 새 레이아웃에 맞춘 간단한 tab bar
- PR `#12`는 완전한 roving tabindex 구현

최종 결정:

- props는 `tabs`, `activeTab`, `onChange` 유지
- 접근성 계약은 `#12` 기준 전체 반영
- 라벨은 테스트와 일치하도록 `Dashboard sections`

### 7.3 `react/src/components/DashboardHeader.jsx`

충돌 포인트:

- 기존에는 SSE 연결 상태 pill이 있었음
- PR `#11`은 gate/airspace 색을 `statusTheme` 기반으로 바꾸는 변경

최종 결정:

- `connectionBadgeConfig()`는 유지
- `gateTheme`, `airspaceTheme`를 추가해 둘 다 함께 사용

### 7.4 `react/src/lib/normalize.test.js`

충돌 포인트:

- 기존 로컬 테스트는 schema contract degraded 검증
- PR `#9` 테스트는 loose boolean degraded 입력 검증

최종 결정:

- 두 테스트 세트를 모두 유지

### 7.5 `react/src/lib/deriveState.test.js`

충돌 포인트:

- 기존 로컬 테스트는 `schemaCompatible=false` 회귀 검증
- PR `#10` 테스트는 `conflict_day: null => n/a`

최종 결정:

- 두 테스트 모두 유지

## 8. 최종 포함 여부 확인

최종 HEAD `b6df44e` 기준으로 아래 브랜치는 모두 포함된 상태다.

- `origin/codex/add-local-helper-to-normalize.js`
- `origin/codex/update-conflictdaylabel-condition`
- `origin/codex/consolidate-status-expression-rules-and-reduce-inline-styles`
- `origin/codex/enhance-accessibility-for-tabs-and-modals`

추가로 이전에 통합했던 아래 내용도 그대로 포함 상태다.

- `add-metrics-to-dashboard-and-reporting`
- `define-data-contract-for-json-files`
- `expand-layout-to-header,-main,-aside-structure`
- `extend-simulator-and-derivestate-functionality`
- `modify-sse-endpoint-and-hook-logic`
- `implement-integrity-checks-for-ci-workflow`

## 9. 테스트 및 검증 기록

### 9.1 프런트엔드 테스트

실행 명령:

```bash
cmd.exe /c npm.cmd test -- src/hooks/useDashboardData.test.jsx src/lib/summary.test.js src/components/tabs/RoutesTab.test.jsx src/components/Simulator.test.jsx api/state.test.js src/lib/normalize.test.js src/lib/deriveState.test.js src/components/TabBar.test.jsx src/components/ShortcutsOverlay.test.jsx
```

결과:

- 9개 테스트 파일 통과
- 36개 테스트 통과

### 9.2 프런트엔드 빌드

실행 명령:

```bash
cmd.exe /c npm.cmd run build
```

결과:

- build 성공

### 9.3 Python 회귀 테스트

실행 명령:

```bash
/mnt/c/Users/minky/Downloads/escapeplan/.venv/bin/python -m pytest -q -s tests/test_live_publish.py tests/test_health_api.py tests/test_reporter_weekly.py
```

결과:

- 9개 테스트 통과

## 10. 로컬 실행 상태

로컬 대시보드는 실행 상태를 확인했다.

- UI: `http://127.0.0.1:5173`
- API state: `http://127.0.0.1:8000/api/state`
- API latest: `http://127.0.0.1:8000/api/live/latest`

확인 결과:

- `5173` 응답 정상 (`200 OK`)
- `8000/api/state`는 `GET` 기준 정상 응답

확인 당시 프로세스:

- React dev server PID: `27552`
- API PID: `26888`

## 11. 현재 워크트리 상태

현재 저장소는 의도적으로 완전 clean 상태로 만들지 않았다. 이유는 사용자의 로컬 수정과 런타임 산출물을 보존하기 위해서다.

### 11.1 현재 미커밋 변경

tracked 수정:

- `live/hyie_state.json`
- `live/last_updated.json`
- `react/src/components/TabBar.jsx`
- `react/src/components/tabs/AnalysisTab.jsx`
- `react/src/hooks/useDashboardData.js`
- `react/src/hooks/useDashboardData.test.jsx`
- `react/src/styles.css`
- `state/hyie_state.json`

untracked:

- `live/hyie_state.json.sha256`
- `live/hyie_state.json.sig`
- `live/last_updated.json.sha256`
- `live/last_updated.json.sig`
- `live/latest.json.sha256`
- `live/latest.json.sig`
- `p2.md`
- `react/dev-dist/`
- `react/src/components/DashboardAside.jsx`
- `useDashboardData.js`
- `useDashboardData.test.jsx`

### 11.2 stash 보존

안전 복구용 stash는 삭제하지 않았다.

- `pre-pr9-12-merge-2026-03-09`
- `pre-all-pr-merge-2026-03-09`
- `pre-main-merge-2026-03-09`

## 12. 최종 판단

이번 작업으로 로컬 `main`은 다음 상태가 되었다.

- 기존 통합 PR 유지
- 새 PR `#9`~`#12` 반영
- 사용자의 로컬 수정 유지
- 런타임 산출물 유지
- 테스트 및 빌드 통과
- 로컬 대시보드 실행 가능

즉, 현재 상태는 “전체 PR 통합 완료 + 사용자 작업 보존 + 실행/검증 완료”로 볼 수 있다.
