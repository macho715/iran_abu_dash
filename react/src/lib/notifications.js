export async function requestNotifPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export function sendCrisisNotif(event) {
  if (typeof document === "undefined" || typeof window === "undefined") return false;
  if (!document.hidden) return false;
  if (!("Notification" in window) || Notification.permission !== "granted") return false;

  const level = String(event?.level || "INFO").toUpperCase();
  const title = level === "ALERT" ? "⚠ ALERT" : "⚡ WARNING";
  const detail = String(event?.detail || "").trim();
  const body = detail ? `${event?.title || ""}\n${detail}`.trim() : String(event?.title || "");

  new Notification(title, {
    body,
    tag: String(event?.noiseKey || event?.title || "urgentdash"),
    requireInteraction: level === "ALERT"
  });
  return true;
}
