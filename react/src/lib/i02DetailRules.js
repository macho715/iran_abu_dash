function uniq(values = []) {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
}

function normalizeText(text = "") {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export const TAG_RULES = [
  {
    id: "FULL_SUSPENSION",
    label: "Full suspension",
    level: "ALERT",
    re: /(전편\s*(중단|취소)|모든\s*운항\s*(중단|중지)|full\s*suspension|all\s*flights?\s*(suspended|cancelled)|airport\s*closed|runway\s*closed)/i
  },
  {
    id: "PARTIAL_SERVICE",
    label: "Partial service",
    level: "WARN",
    re: /(부분\s*운항|일부\s*운항|limited\s*(service|operations)|partial\s*(service|operations)|selected\s*flights|reduced\s*operations)/i
  },
  {
    id: "SLOT_RESTRICTION",
    label: "Slot restriction",
    level: "WARN",
    re: /(slot\s*restriction|slot\s*control|ATFM|departure\s*slot|arrival\s*slot|슬롯\s*제한|이착륙\s*슬롯)/i
  },
  {
    id: "TERMINAL_SPECIFIC",
    label: "Terminal specific",
    level: "WARN",
    re: /(\bT\d\b|Terminal\s*\d+|터미널\s*\d+)/i
  },
  {
    id: "RESUME_TIME",
    label: "Resume time",
    level: "INFO",
    re: /((?:재개|resume|reopen).{0,20}\d{1,2}:\d{2}|\d{1,2}:\d{2}.{0,20}(?:재개|resume|reopen))/i
  },
  {
    id: "CARGO_ONLY",
    label: "Cargo only",
    level: "WARN",
    re: /(cargo\s*only|cargo-only|freighter\s*only|화물기만)/i
  },
  {
    id: "HUMANITARIAN_ONLY",
    label: "Humanitarian only",
    level: "WARN",
    re: /(repatriation|evacuation|humanitarian|rescue flight|구호편|송환편|대피편)/i
  }
];

const TERMINAL_RE = /\bT\d\b|Terminal\s*\d+|터미널\s*\d+/gi;
const RESUME_TIME_RE = /\b\d{1,2}:\d{2}\s*(?:GST|UTC|LT)?\b|(?:\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2})/gi;

export function parseI02Detail(detail = "") {
  const text = normalizeText(detail);
  const tags = uniq(TAG_RULES.filter((rule) => rule.re.test(text)).map((rule) => rule.id));
  const tagLabels = tags.map((id) => TAG_RULES.find((rule) => rule.id === id)?.label || id);
  const terminals = uniq(text.match(TERMINAL_RE) || []);
  const resumeTimes = uniq(text.match(RESUME_TIME_RE) || []);

  return {
    text,
    tags,
    tagLabels,
    terminals,
    resumeTimes
  };
}

export function diffI02Detail(prevDetail = "", nextDetail = "") {
  const prev = parseI02Detail(prevDetail);
  const next = parseI02Detail(nextDetail);

  return {
    prev,
    next,
    changed: prev.text !== next.text,
    addedTags: next.tags.filter((tag) => !prev.tags.includes(tag)),
    removedTags: prev.tags.filter((tag) => !next.tags.includes(tag)),
    terminalsAdded: next.terminals.filter((item) => !prev.terminals.includes(item)),
    terminalsRemoved: prev.terminals.filter((item) => !next.terminals.includes(item)),
    resumeTimesAdded: next.resumeTimes.filter((item) => !prev.resumeTimes.includes(item)),
    resumeTimesRemoved: prev.resumeTimes.filter((item) => !next.resumeTimes.includes(item))
  };
}
