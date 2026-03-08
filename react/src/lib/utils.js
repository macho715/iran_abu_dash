import { FALLBACK_EGRESS_LOSS_ETA, GST_TIMEZONE, MIN_EVIDENCE_SOURCES, ROUTE_BUFFER_FACTOR } from "./constants.js";

export function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function readRouteEffectiveHours(route) {
  const n = Number(route?.effective_h ?? route?.effectiveH);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function hasExplicitRouteEffectiveHours(route) {
  return readRouteEffectiveHours(route) != null;
}

export function getRouteEffectiveHours(route, fallbackFactor = ROUTE_BUFFER_FACTOR) {
  const explicit = readRouteEffectiveHours(route);
  if (explicit != null) return explicit;
  const base = Number(route?.base_h ?? route?.baseH);
  const cong = Number(route?.cong ?? route?.congestion ?? 0);
  if (!Number.isFinite(base) || base <= 0) return null;
  return base * (1 + Math.max(0, cong)) * fallbackFactor;
}

export function clampEgress(v, fallback = FALLBACK_EGRESS_LOSS_ETA) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(999, n);
}

export function normalizeWhitespace(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

export function safeGetLS(key, fallback = null) {
  try {
    if (typeof window === "undefined") return fallback;
    const v = window.localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function safeSetLS(key, value) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  } catch { }
}

export function safeJsonParse(raw, fallback) {
  try {
    const v = JSON.parse(raw);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

export function toTsIso(value) {
  if (!value) return "";
  const text = String(value || "").trim();
  const m = text.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/i);
  const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const d = m && monthMap[m[1].toLowerCase()] !== undefined
    ? new Date(new Date().getFullYear(), monthMap[m[1].toLowerCase()], Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5] || "0"), 0)
    : new Date(text);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

export function splitSources(raw = "") {
  return [
    ...new Set(
      String(raw)
        .split(/\/|,/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.replace(/\s+\(.*?\)$/, "").trim())
        .filter(Boolean)
    )
  ];
}

export function inferEvidenceFromSource(raw) {
  const sources = splitSources(raw);
  const sourceCount = Math.max(sources.length, 0);
  return { sourceCount, verified: sourceCount >= MIN_EVIDENCE_SOURCES };
}

export function summarizeSourceHealth(raw) {
  if (!raw || typeof raw !== "object") return { ok: null, total: null };
  const rows = Object.values(raw);
  if (!rows.length) return { ok: null, total: null };
  const ok = rows.filter((r) => Boolean(r && r.ok)).length;
  return { ok, total: rows.length };
}

export function formatTimeGST(tsIso) {
  if (!tsIso) return "—";
  const d = new Date(tsIso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: GST_TIMEZONE });
}

export function formatDateTimeGST(dateLike = new Date()) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ko-KR", { timeZone: GST_TIMEZONE, hour12: false });
}

export function deepClone(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

export function downloadJson(filename, dataObj) {
  const json = JSON.stringify(dataObj, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  downloadBlob(filename, blob);
}

export function downloadText(filename, text) {
  const blob = new Blob([String(text || "")], { type: "text/plain;charset=utf-8" });
  downloadBlob(filename, blob);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function tryCopyText(text) {
  const t = String(text || "");
  if (!t) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch { }
  try {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return Boolean(ok);
  } catch {
    return false;
  }
}

export function truncate(s, max = 140) {
  const t = normalizeWhitespace(s);
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

export function isEditableTarget(target) {
  if (!target || typeof target !== "object") return false;
  const tagName = typeof target.tagName === "string" ? target.tagName.toUpperCase() : "";
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || target.isContentEditable === true;
}
