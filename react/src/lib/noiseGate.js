import { EVENT_NOISE_WINDOW_MS } from "./constants.js";

function normalizeNoiseText(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function toTsMs(ts) {
  const parsed = Date.parse(ts || "");
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function eventNoiseKey(ev = {}) {
  if (ev.noiseKey) return String(ev.noiseKey);
  return [
    String(ev.category || ""),
    String(ev.title || ""),
    normalizeNoiseText(ev.detail || "")
  ].join("|");
}

export function isSuppressed(prevTimeline = [], ev = {}, windowMs = EVENT_NOISE_WINDOW_MS) {
  const key = eventNoiseKey(ev);
  const ts = toTsMs(ev?.ts);
  return prevTimeline.some((old) => eventNoiseKey(old) === key && Math.abs(toTsMs(old?.ts) - ts) <= windowMs);
}

export function mergeTimelineWithNoiseGate(
  prevTimeline = [],
  incomingEvents = [],
  { windowMs = EVENT_NOISE_WINDOW_MS, maxItems = 220 } = {}
) {
  const accepted = [];
  for (const ev of incomingEvents) {
    if (!isSuppressed([...accepted, ...prevTimeline], ev, windowMs)) {
      accepted.push(ev);
    }
  }
  return [...accepted, ...prevTimeline].slice(0, maxItems);
}
