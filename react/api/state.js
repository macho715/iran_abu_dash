import { buildLiveArtifactUrl, fetchUpstreamJson, proxyUpstreamJson } from "./_liveProxy.js";

function resolveStateArtifactSegments(pointer) {
  const rel = String(pointer?.aiUrl || pointer?.liteUrl || "").trim().replace(/^live\//, "");
  if (!rel.endsWith(".json")) return [];
  return rel.split("/").filter(Boolean);
}

export default async function handler(_request, response) {
  const latestUrl = buildLiveArtifactUrl("latest.json");

  try {
    const latest = await fetchUpstreamJson(latestUrl);
    if (latest.ok) {
      const pointer = JSON.parse(latest.body || "{}");
      const segments = resolveStateArtifactSegments(pointer);
      if (segments.length) {
        response.setHeader("X-UrgentDash-State-Mode", "latest-pointer");
        await proxyUpstreamJson(response, buildLiveArtifactUrl(...segments));
        return;
      }
    }
  } catch {
    /* fall back to legacy pointer */
  }

  response.setHeader("X-UrgentDash-State-Mode", "legacy");
  await proxyUpstreamJson(response, buildLiveArtifactUrl("hyie_state.json"));
}
