const routeCache = new Map();

function round6(value) {
  return Number(value).toFixed(6);
}

function serializeWaypoints(waypoints = []) {
  return waypoints.map((p) => `${round6(p.lng)},${round6(p.lat)}`).join(";");
}

function ensureWaypoints(waypoints = []) {
  return waypoints
    .map((item) => ({
      lat: Number(item?.lat),
      lng: Number(item?.lng),
      label: String(item?.label || "")
    }))
    .filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
}

function coordToLatLng(coord) {
  if (Array.isArray(coord) && coord.length >= 2) {
    const lat = Number(coord[0]);
    const lng = Number(coord[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng, label: "" };
    }
  }
  const lat = Number(coord?.lat);
  const lng = Number(coord?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng, label: String(coord?.label || "") };
  }
  return null;
}

function coordsToLeafletLatLngs(coords = []) {
  return coords
    .map((pair) => {
      const lng = Number(pair?.[0]);
      const lat = Number(pair?.[1]);
      return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
    })
    .filter(Boolean);
}

function pickMapboxProfile(profile = "mapbox/driving-traffic") {
  if (!profile) return "mapbox/driving-traffic";
  if (String(profile).startsWith("mapbox/")) return String(profile);
  return `mapbox/${profile}`;
}

export function resolveRouteWaypoints(routeId, routeGeo) {
  const route = routeGeo?.routes?.[routeId];
  if (!route) return [];

  if (Array.isArray(route.coords) && route.coords.length >= 2) {
    return route.coords.map(coordToLatLng).filter(Boolean);
  }

  const nodeIds = Array.isArray(route.waypoints) ? route.waypoints : [];
  return nodeIds
    .map((id) => {
      const node = routeGeo?.nodes?.[id];
      if (!node) return null;
      const lat = Number(node.lat);
      const lng = Number(node.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng, label: String(node.label || id), id };
    })
    .filter(Boolean);
}

export async function fetchOsrmRoute({ waypoints = [], profile = "driving", signal } = {}) {
  const safeWaypoints = ensureWaypoints(waypoints);
  if (safeWaypoints.length < 2) throw new Error("At least 2 waypoints are required");

  const base = (import.meta.env.VITE_OSRM_BASE_URL || "https://router.project-osrm.org").replace(/\/+$/, "");
  const routeProfile = profile === "driving-traffic" ? "driving" : String(profile || "driving").replace(/^mapbox\//, "");
  const coords = serializeWaypoints(safeWaypoints);
  const url = `${base}/route/v1/${routeProfile}/${coords}?overview=full&geometries=geojson&steps=false&alternatives=false`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);

  const json = await res.json();
  const route = json?.routes?.[0];
  const geometry = route?.geometry?.coordinates;
  if (json?.code !== "Ok" || !Array.isArray(geometry)) {
    throw new Error(`OSRM invalid response: ${json?.code || "unknown"}`);
  }

  return {
    provider: "osrm",
    profile: routeProfile,
    latlngs: coordsToLeafletLatLngs(geometry),
    distanceM: Number.isFinite(Number(route?.distance)) ? Number(route.distance) : null,
    durationS: Number.isFinite(Number(route?.duration)) ? Number(route.duration) : null
  };
}

export async function fetchMapboxRoute({ waypoints = [], profile = "mapbox/driving-traffic", signal } = {}) {
  const safeWaypoints = ensureWaypoints(waypoints);
  if (safeWaypoints.length < 2) throw new Error("At least 2 waypoints are required");
  if (safeWaypoints.length > 25) throw new Error("Mapbox supports up to 25 waypoints");

  const token = String(import.meta.env.VITE_MAPBOX_TOKEN || "").trim();
  if (!token) throw new Error("Missing VITE_MAPBOX_TOKEN");

  const mapboxProfile = pickMapboxProfile(profile);
  const coords = serializeWaypoints(safeWaypoints);
  const url =
    `https://api.mapbox.com/directions/v5/${mapboxProfile}/${coords}` +
    `?geometries=geojson&overview=full&steps=false&alternatives=false&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Mapbox ${res.status}`);

  const json = await res.json();
  const route = json?.routes?.[0];
  const geometry = route?.geometry?.coordinates;
  if (json?.code !== "Ok" || !Array.isArray(geometry)) {
    throw new Error(`Mapbox invalid response: ${json?.code || "unknown"}`);
  }

  return {
    provider: "mapbox",
    profile: mapboxProfile,
    latlngs: coordsToLeafletLatLngs(geometry),
    distanceM: Number.isFinite(Number(route?.distance)) ? Number(route.distance) : null,
    durationS: Number.isFinite(Number(route?.duration)) ? Number(route.duration) : null
  };
}

async function fetchRouteGeometry({ waypoints = [], provider = "osrm", profile = "driving", signal } = {}) {
  const providerLower = String(provider || "osrm").toLowerCase();
  if (providerLower === "mapbox") {
    return fetchMapboxRoute({ waypoints, profile, signal });
  }

  try {
    return await fetchOsrmRoute({ waypoints, profile, signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    const hasMapbox = Boolean(String(import.meta.env.VITE_MAPBOX_TOKEN || "").trim());
    if (!hasMapbox) throw err;
    const fallbackProfile = profile === "driving" ? "mapbox/driving" : pickMapboxProfile(profile);
    return fetchMapboxRoute({ waypoints, profile: fallbackProfile, signal });
  }
}

export async function fetchRouteGeometryCached(args = {}) {
  const waypoints = ensureWaypoints(args.waypoints);
  const provider = String(args.provider || "osrm");
  const profile = String(args.profile || "driving");
  const key = `${provider}|${profile}|${serializeWaypoints(waypoints)}`;

  if (routeCache.has(key)) return routeCache.get(key);

  const promise = fetchRouteGeometry({ ...args, waypoints, provider, profile });
  routeCache.set(key, promise);
  try {
    const value = await promise;
    routeCache.set(key, Promise.resolve(value));
    return value;
  } catch (err) {
    routeCache.delete(key);
    throw err;
  }
}
