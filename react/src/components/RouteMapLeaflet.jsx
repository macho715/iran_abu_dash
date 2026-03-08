import React, { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";

import { ROUTE_BUFFER_FACTOR } from "../lib/constants.js";
import { fetchRouteGeometryCached, resolveRouteWaypoints } from "../lib/routeApi.js";
import { DEFAULT_ROUTE_GEO } from "../lib/routeGeoDefault.js";
import { getRouteEffectiveHours, hasExplicitRouteEffectiveHours } from "../lib/utils.js";

function FitBounds({ latlngs = [] }) {
  const map = useMap();

  useEffect(() => {
    if (!latlngs.length) return;
    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, latlngs]);

  return null;
}

function MapClickHandler({ onSelect }) {
  useMapEvents({
    click: () => onSelect(null)
  });
  return null;
}

function flattenLatLngs(routeGeo, resolvedLines) {
  const all = [];

  Object.values(routeGeo?.nodes || {}).forEach((node) => {
    if (Number.isFinite(node?.lat) && Number.isFinite(node?.lng)) {
      all.push([node.lat, node.lng]);
    }
  });

  Object.values(resolvedLines || {}).forEach((line) => {
    (line?.latlngs || []).forEach((point) => {
      if (Array.isArray(point) && point.length === 2) all.push(point);
    });
  });

  return all;
}

function colorForStatus(status = "OPEN") {
  if (status === "BLOCKED") return "#ef4444";
  if (status === "CAUTION") return "#f59e0b";
  return "#22c55e";
}

export default function RouteMapLeaflet({
  routes = [],
  routeGeo = null,
  selectedId = null,
  onSelect = () => {}
}) {
  const geo = routeGeo || DEFAULT_ROUTE_GEO;
  const routeById = useMemo(() => new Map(routes.map((route) => [route.id, route])), [routes]);
  const [resolvedLines, setResolvedLines] = useState({});

  const tileUrl = import.meta.env.VITE_LEAFLET_TILES_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const tileAttr = import.meta.env.VITE_LEAFLET_TILES_ATTRIBUTION || "&copy; OpenStreetMap contributors";

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    async function run() {
      const entries = await Promise.all(
        routes.map(async (route) => {
          const def = geo?.routes?.[route.id] || {};
          const waypoints = resolveRouteWaypoints(route.id, geo);
          if (waypoints.length < 2) return [route.id, null];

          const provider = def.provider || (import.meta.env.VITE_MAPBOX_TOKEN ? "mapbox" : "osrm");
          const profile = def.profile || (provider === "mapbox" ? "mapbox/driving-traffic" : "driving");

          try {
            const fetched = await fetchRouteGeometryCached({
              waypoints,
              provider,
              profile,
              signal: controller.signal
            });
            return [
              route.id,
              {
                ...fetched,
                waypoints,
                isFallback: false
              }
            ];
          } catch (err) {
            return [
              route.id,
              {
                provider: "fallback",
                profile: "straight",
                isFallback: true,
                waypoints,
                latlngs: waypoints.map((p) => [p.lat, p.lng]),
                distanceM: null,
                durationS: null,
                error: String(err?.message || err || "route fetch failed")
              }
            ];
          }
        })
      );

      if (!alive) return;
      setResolvedLines(Object.fromEntries(entries.filter(([, value]) => Boolean(value))));
    }

    run();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [routes, geo]);

  const allLatLngs = useMemo(() => flattenLatLngs(geo, resolvedLines), [geo, resolvedLines]);
  const center = geo?.nodes?.ABU ? [geo.nodes.ABU.lat, geo.nodes.ABU.lng] : [24.4539, 54.3773];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900 }}>🗺️ Route Map (actual roads)</div>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
            OSRM first, Mapbox fallback. If both fail, waypoint straight-line is used.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 900 }}>● OPEN</span>
          <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 900 }}>● CAUTION</span>
          <span style={{ fontSize: 10, color: "#ef4444", fontWeight: 900 }}>● BLOCKED</span>
        </div>
      </div>

      <div className="route-map">
        <MapContainer center={center} zoom={7} scrollWheelZoom style={{ width: "100%", height: "100%" }}>
          <TileLayer url={tileUrl} attribution={tileAttr} />
          <MapClickHandler onSelect={onSelect} />
          <FitBounds latlngs={allLatLngs} />

          {Object.entries(resolvedLines).map(([routeId, line]) => {
            const route = routeById.get(routeId) || { status: "OPEN", base_h: 0, cong: 0, congestion: 0 };
            const effective = getRouteEffectiveHours(route);
            const hasExplicitEff = hasExplicitRouteEffectiveHours(route);
            const isSelected = selectedId === routeId;
            return (
              <Polyline
                key={routeId}
                positions={line.latlngs}
                pathOptions={{
                  color: colorForStatus(route.status),
                  weight: isSelected ? 7 : 5,
                  opacity: route.status === "BLOCKED" ? 0.65 : 0.95,
                  dashArray: route.status === "CAUTION" ? "10 8" : undefined
                }}
                eventHandlers={{ click: () => onSelect(routeId) }}
              >
                <Tooltip sticky direction="top">
                  <div style={{ fontSize: 12, fontWeight: 900 }}>
                    Route {routeId} <span style={{ color: colorForStatus(route.status) }}>{route.status}</span>
                  </div>
                  <div style={{ fontSize: 11 }}>
                    effective ~{Number.isFinite(effective) ? effective.toFixed(1) : "—"}h {hasExplicitEff ? "(backend)" : `(buffer x${ROUTE_BUFFER_FACTOR})`}
                  </div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>
                    source: {line.isFallback ? "fallback" : `${line.provider}/${line.profile}`}
                  </div>
                  {line.error ? <div style={{ fontSize: 10, color: "#fca5a5", marginTop: 4 }}>{line.error}</div> : null}
                </Tooltip>
              </Polyline>
            );
          })}

          {Object.entries(geo?.nodes || {}).map(([nodeId, node]) => (
            <CircleMarker
              key={nodeId}
              center={[node.lat, node.lng]}
              radius={5}
              pathOptions={{ color: "#94a3b8", fillColor: "#94a3b8", fillOpacity: 0.9 }}
            >
              <Tooltip direction="top">
                <div style={{ fontSize: 12, fontWeight: 900 }}>{node.label || nodeId}</div>
                <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>
                  {Number(node.lat).toFixed(4)}, {Number(node.lng).toFixed(4)}
                </div>
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
