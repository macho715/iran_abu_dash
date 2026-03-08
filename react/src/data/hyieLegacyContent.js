export const KEY_ASSUMPTIONS = [
  {
    id: "A1",
    text: "Al Ain/Buraimi border remains OPEN",
    fail: "Switch to Fujairah route (~9.3h)",
    status: "ok",
    verified: "Canada advisory: border OPEN"
  },
  {
    id: "A2",
    text: "Stay-indoors guidance will be lifted",
    fail: "Keep SHELTER mode + direct embassy contact",
    status: "warn",
    verified: "Not lifted yet"
  },
  {
    id: "A3",
    text: "Situation worsens gradually, not abruptly",
    fail: "Tighten SHELTER posture (no movement)",
    status: "warn",
    verified: "Escalation signals observed"
  },
  {
    id: "A4",
    text: "Fuel remains sufficient / refueling available",
    fail: "Only shortest route remains valid",
    status: "ok",
    verified: "Fuel supply currently normal"
  },
  {
    id: "A5",
    text: "Communications remain available",
    fail: "Fallback to last-known signal + pause decay logic",
    status: "ok",
    verified: "General communications normal"
  },
  {
    id: "A6",
    text: "Private vehicle movement remains possible",
    fail: "Walking/public transit fallback (evac_h x3)",
    status: "ok",
    verified: "Most roads are open"
  }
];

export const VERSION_HISTORY = [
  { v: "v2026.03", desc: "Single confidence -> RED", change: "Starting point" },
  { v: "v2026.03.1", desc: "+Decay +Hysteresis +DataStale", change: "Reduce flicker / stale impact" },
  { v: "v2026.03.2", desc: "+ERC (evacuation reverse-time)", change: "Airport closure -> road fallback" },
  { v: "v2026.04", desc: "+HyIE (3 hypotheses) + ICD 203", change: "Lower false positives + explainability" },
  { v: "v2026.05", desc: "+ERC2 + Conf/Urg split + MovementRiskGate", change: "Current active", active: true }
];
