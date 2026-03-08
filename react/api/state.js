import { applyProxyHeaders, buildLiveArtifactUrl, fetchUpstreamJson, proxyUpstreamJson } from "./_liveProxy.js";

function resolveArtifactSegments(relPath) {
  const rel = String(relPath || "").trim().replace(/^live\//, "");
  if (!rel.endsWith(".json")) return [];
  return rel.split("/").filter(Boolean);
}

export default async function handler(_request, response) {
  const latestUrl = buildLiveArtifactUrl("latest.json");

  try {
    const latest = await fetchUpstreamJson(latestUrl);
    if (latest.ok) {
      const pointer = JSON.parse(latest.body || "{}");
      const liteSegments = resolveArtifactSegments(pointer?.liteUrl);
      if (liteSegments.length) {
        const baseUrl = buildLiveArtifactUrl(...liteSegments);
        const baseState = await fetchUpstreamJson(baseUrl);
        if (baseState.ok) {
          const payload = JSON.parse(baseState.body || "{}");
          const aiSegments = resolveArtifactSegments(pointer?.aiUrl);
          if (aiSegments.length) {
            const aiUrl = buildLiveArtifactUrl(...aiSegments);
            const aiState = await fetchUpstreamJson(aiUrl);
            if (aiState.ok) {
              const aiPayload = JSON.parse(aiState.body || "{}");
              if (aiPayload?.ai_analysis) payload.ai_analysis = aiPayload.ai_analysis;
              if (aiPayload?.aiVersion) payload.aiVersion = aiPayload.aiVersion;
              if (aiPayload?.aiUpdatedAt) payload.aiUpdatedAt = aiPayload.aiUpdatedAt;
              if (aiPayload?.aiStatus) payload.aiStatus = aiPayload.aiStatus;
              response.setHeader("X-UrgentDash-AI-Upstream", aiUrl);
            }
          }

          applyProxyHeaders(response, baseUrl);
          response.setHeader("X-UrgentDash-State-Mode", "latest-pointer-merged");
          response.status(200).send(JSON.stringify(payload));
          return;
        }
      }

      const legacySegments = resolveArtifactSegments(pointer?.legacyUrl);
      if (legacySegments.length) {
        response.setHeader("X-UrgentDash-State-Mode", "latest-pointer-legacy");
        await proxyUpstreamJson(response, buildLiveArtifactUrl(...legacySegments));
        return;
      }
    }
  } catch {
    /* fall back to legacy pointer */
  }

  response.setHeader("X-UrgentDash-State-Mode", "legacy");
  await proxyUpstreamJson(response, buildLiveArtifactUrl("hyie_state.json"));
}
