import { get, set } from "idb-keyval";

const CACHE_KEY = "urgentdash-cache/dashboard/latest";

export async function cacheLastDash(dashboard) {
  if (!dashboard) return null;
  const payload = {
    dashboard,
    cachedAt: new Date().toISOString()
  };
  await set(CACHE_KEY, payload);
  return payload;
}

export async function loadCachedDash() {
  const payload = await get(CACHE_KEY);
  if (!payload || typeof payload !== "object" || !payload.dashboard) return null;
  return payload;
}
