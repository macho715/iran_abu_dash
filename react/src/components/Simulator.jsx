import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "./ui.jsx";
import { clamp01, clampEgress, deepClone } from "../lib/utils.js";
import { normalizeDashboard } from "../lib/normalize.js";
import { deriveState } from "../lib/deriveState.js";
import { ROUTE_BUFFER_FACTOR } from "../lib/constants.js";

export default function Simulator({ liveDash, onLog = () => {} }) {
  const [sim, setSim] = useState(null);

  const buildInitialSim = useCallback(() => {
    const dash = liveDash || {};
    const findH = (id) => (dash.hypotheses || []).find((x) => x.id === id)?.score ?? 0;
    const findI = (id) => (dash.indicators || []).find((x) => x.id === id)?.state ?? 0;
    return {
      hypotheses: { H0: clamp01(findH("H0")), H1: clamp01(findH("H1")), H2: clamp01(findH("H2")) },
      indicators: { I01: clamp01(findI("I01")), I02: clamp01(findI("I02")), I03: clamp01(findI("I03")), I04: clamp01(findI("I04")) },
      triggers: { ...(dash.metadata?.triggers || {}) },
      degraded: Boolean(dash.metadata?.degraded),
      egressLossETA: clampEgress(dash.metadata?.egressLossETA ?? 2),
      evidenceConf: clamp01(dash.metadata?.evidenceConf ?? 0.55),
      effectiveThreshold: clamp01(dash.metadata?.effectiveThreshold ?? 0.8),
      deltaScore: Number.isFinite(Number(dash.metadata?.deltaScore)) ? Number(dash.metadata.deltaScore) : 0,
      routes: (dash.routes || []).map((r) => ({ id: r.id, status: r.status, cong: clamp01(r.cong ?? r.congestion), base_h: Math.max(0, Number(r.base_h || 0)) }))
    };
  }, [liveDash]);

  useEffect(() => setSim(buildInitialSim()), [buildInitialSim]);

  const buildDashFromSim = useCallback((s) => {
    if (!s) return null;
    const dash = liveDash || {};
    const hyp = ["H0", "H1", "H2"].map((id) => ({
      ...(dash.hypotheses || []).find((x) => x.id === id),
      id,
      name: (dash.hypotheses || []).find((x) => x.id === id)?.name || id,
      score: clamp01(s.hypotheses[id] || 0)
    }));
    const ind = ["I01", "I02", "I03", "I04"].map((id) => ({
      ...(dash.indicators || []).find((x) => x.id === id),
      id,
      name: (dash.indicators || []).find((x) => x.id === id)?.name || id,
      state: clamp01(s.indicators[id] || 0),
      srcCount: (dash.indicators || []).find((x) => x.id === id)?.srcCount ?? 0,
      cv: (dash.indicators || []).find((x) => x.id === id)?.cv ?? true
    }));
    const routes = (s.routes || []).map((r) => ({ ...(dash.routes || []).find((x) => x.id === r.id), ...r }));
    const next = {
      intelFeed: dash.intelFeed || [],
      indicators: ind,
      hypotheses: hyp,
      routes,
      checklist: dash.checklist || [],
      metadata: {
        ...(dash.metadata || {}),
        egressLossETA: clampEgress(s.egressLossETA),
        evidenceConf: clamp01(s.evidenceConf),
        effectiveThreshold: clamp01(s.effectiveThreshold ?? 0.8),
        deltaScore: Number(s.deltaScore || 0),
        degraded: Boolean(s.degraded),
        triggers: { ...(s.triggers || {}) },
        source: "SIMULATOR",
        status: "sim",
        stateTs: new Date().toISOString()
      }
    };
    return normalizeDashboard(next) || next;
  }, [liveDash]);

  const simDash = useMemo(() => buildDashFromSim(sim), [sim, buildDashFromSim]);
  const simDerived = useMemo(() => (simDash ? deriveState(simDash, sim?.egressLossETA) : null), [simDash, sim]);

  const update = (path, value) => {
    setSim((prev) => {
      if (!prev) return prev;
      const next = deepClone(prev);
      const parts = path.split(".");
      let cur = next;
      for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
      cur[parts[parts.length - 1]] = value;
      return next;
    });
  };

  const toggleTrig = (k) => {
    setSim((prev) => (prev ? { ...prev, triggers: { ...prev.triggers, [k]: !prev.triggers?.[k] } } : prev));
  };

  if (!sim || !simDash || !simDerived) {
    return <div style={{ color: "#94a3b8", fontSize: 12 }}>Simulator initializing…</div>;
  }

  const routeStatusColor = (st) => (st === "BLOCKED" ? "#ef4444" : st === "CAUTION" ? "#f59e0b" : "#22c55e");

  return (
    <div className="sim-grid">
      <Card style={{ marginBottom: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900 }}>🧪 Scenario Simulator</div>
            <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>가정치를 바꾸면 파생 상태(MODE/Gate/I02 segment/Route eff)가 즉시 재계산됩니다.</div>
          </div>
          <button
            onClick={() => onLog({ level: "INFO", category: "SIM", title: "Simulator snapshot logged", detail: `MODE=${simDerived.modeState} Gate=${simDerived.gateState} I02seg=${simDerived.airspaceSegment} Δ=${simDerived.ds.toFixed(3)} Conf=${simDerived.ec.toFixed(3)}` })}
            style={{ background: "#0b1220", border: "1px solid #1e293b", color: "#e2e8f0", borderRadius: 10, padding: "10px 12px", fontSize: 11, fontWeight: 900, cursor: "pointer" }}
          >
            Log to timeline
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ background: "#0b1220", border: "1px solid #1e293b", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#e2e8f0" }}>Hypotheses</div>
            {["H0", "H1", "H2"].map((id) => (
              <div key={id} style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8" }}>
                  <span style={{ fontWeight: 900, color: id === "H2" ? "#ef4444" : id === "H1" ? "#f59e0b" : "#22c55e" }}>{id}</span>
                  <span style={{ fontFamily: "monospace" }}>{Number(sim.hypotheses[id] || 0).toFixed(2)}</span>
                </div>
                <input type="range" min="0" max="1" step="0.01" value={Number(sim.hypotheses[id] || 0)} onChange={(e) => update(`hypotheses.${id}`, Number(e.target.value))} style={{ width: "100%" }} />
              </div>
            ))}
          </div>

          <div style={{ background: "#0b1220", border: "1px solid #1e293b", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#e2e8f0" }}>Engine</div>
            {[["evidenceConf", "evidenceConf", 0, 1, 0.01], ["effectiveThreshold", "effectiveThreshold", 0, 1, 0.01], ["deltaScore", "deltaScore", -0.2, 0.6, 0.01], ["egressLossETA", "egressLossETA(h)", 0, 12, 0.1]].map(([key, label, min, max, step]) => (
              <div key={key} style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8" }}>
                  <span style={{ fontWeight: 900 }}>{label}</span>
                  <span style={{ fontFamily: "monospace" }}>{Number(sim[key] || 0).toFixed(2)}</span>
                </div>
                <input type="range" min={min} max={max} step={step} value={Number(sim[key] || 0)} onChange={(e) => update(key, Number(e.target.value))} style={{ width: "100%" }} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
          <div style={{ background: "#0b1220", border: "1px solid #1e293b", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#e2e8f0" }}>Indicators (I01~I04)</div>
            {["I01", "I02", "I03", "I04"].map((id) => (
              <div key={id} style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8" }}>
                  <span style={{ fontWeight: 900 }}>{id}</span>
                  <span style={{ fontFamily: "monospace" }}>{Number(sim.indicators[id] || 0).toFixed(2)}</span>
                </div>
                <input type="range" min="0" max="1" step="0.01" value={Number(sim.indicators[id] || 0)} onChange={(e) => update(`indicators.${id}`, Number(e.target.value))} style={{ width: "100%" }} />
              </div>
            ))}
          </div>

          <div style={{ background: "#0b1220", border: "1px solid #1e293b", borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#e2e8f0" }}>Triggers</div>
            {[["kr_leave_immediately", "KR leave immediately"], ["strike_detected", "strike_detected"], ["border_change", "border_change"], ["red_imminent", "red_imminent"]].map(([k, label]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={Boolean(sim.triggers?.[k])} onChange={() => toggleTrig(k)} />
                <span style={{ fontSize: 12, color: "#e2e8f0" }}>{label}</span>
              </label>
            ))}
            <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={Boolean(sim.degraded)} onChange={() => update("degraded", !sim.degraded)} />
              <span style={{ fontSize: 12, color: "#e2e8f0" }}>degraded</span>
            </label>
          </div>
        </div>

        <div style={{ marginTop: 12, background: "#0b1220", border: "1px solid #1e293b", borderRadius: 12, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, fontWeight: 900 }}>Routes (what-if)</div>
            <div style={{ fontSize: 10, color: "#64748b" }}>status / congestion / base_h</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {(sim.routes || []).map((r, idx) => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr", gap: 8, alignItems: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#e2e8f0" }}>Route {r.id}</div>
                <select value={r.status} onChange={(e) => setSim((prev) => { const next = deepClone(prev); next.routes[idx].status = e.target.value; return next; })} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, color: routeStatusColor(r.status), padding: "8px 10px", fontWeight: 900 }}>
                  <option value="OPEN">OPEN</option>
                  <option value="CAUTION">CAUTION</option>
                  <option value="BLOCKED">BLOCKED</option>
                </select>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b" }}><span>cong</span><span style={{ fontFamily: "monospace" }}>{Number(r.cong || 0).toFixed(2)}</span></div>
                  <input type="range" min="0" max="1" step="0.01" value={Number(r.cong || 0)} onChange={(e) => setSim((prev) => { const next = deepClone(prev); next.routes[idx].cong = Number(e.target.value); return next; })} style={{ width: "100%" }} />
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b" }}><span>base_h</span><span style={{ fontFamily: "monospace" }}>{Number(r.base_h || 0).toFixed(1)}</span></div>
                  <input type="range" min="2" max="24" step="0.1" value={Number(r.base_h || 0)} onChange={(e) => setSim((prev) => { const next = deepClone(prev); next.routes[idx].base_h = Number(e.target.value); return next; })} style={{ width: "100%" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 10, color: "#475569" }}>💡 Simulator는 라이브 데이터를 바꾸지 않습니다. "Log to timeline"으로 기록만 남깁니다.</div>
      </Card>

      <Card style={{ marginBottom: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 900 }}>파생 상태</div>
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[["MODE", simDerived.modeState, simDerived.modeColor], ["Gate", simDerived.gateState, simDerived.gateState === "BLOCKED" ? "#ef4444" : simDerived.gateState === "CAUTION" ? "#f59e0b" : "#22c55e"], ["Airspace", `${simDerived.airspaceState} (${simDerived.airspaceSegment})`, simDerived.airspaceState === "OPEN" ? "#22c55e" : simDerived.airspaceState === "DISRUPTED" ? "#f59e0b" : "#ef4444"], ["Evidence", simDerived.evidenceState, simDerived.evidenceState === "PASSED" ? "#22c55e" : "#f59e0b"]].map(([k, v, c]) => (
            <div key={k} style={{ background: "#0b1220", border: "1px solid #1e293b", borderRadius: 12, padding: 12 }}>
              <div style={{ fontSize: 10, color: "#64748b" }}>{k}</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: c, marginTop: 4 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, background: "#0b1220", border: "1px solid #1e293b", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 900 }}>추천 루트(사용 가능)</div>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>buffer x{ROUTE_BUFFER_FACTOR} 반영</div>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {(() => {
              const list = (simDash.routes || []).filter((r) => r.status !== "BLOCKED").map((r) => ({ id: r.id, status: r.status, eff: r.base_h * (1 + (r.cong ?? r.congestion ?? 0)) * ROUTE_BUFFER_FACTOR })).sort((a, b) => a.eff - b.eff);
              if (!list.length) return <div style={{ fontSize: 12, color: "#fca5a5" }}>사용 가능한 루트가 없습니다.</div>;
              return list.slice(0, 3).map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 10, border: "1px solid #1e293b", background: "#0f172a" }}>
                  <div style={{ fontSize: 12, fontWeight: 900 }}>Route {r.id} <span style={{ fontSize: 10, color: routeStatusColor(r.status), fontWeight: 900 }}>{r.status}</span></div>
                  <div style={{ fontFamily: "monospace", fontWeight: 900 }}>{r.eff.toFixed(1)}h</div>
                </div>
              ));
            })()}
          </div>
        </div>
      </Card>
    </div>
  );
}
