import {
  applyProxyHeaders,
  buildLiveArtifactUrl,
  fetchAndVerifyArtifact,
  fetchUpstreamJson,
  proxyUpstreamJson
} from "./_liveProxy.js";

function resolveArtifactSegments(relPath) {
  const rel = String(relPath || "").trim().replace(/^live\//, "");
  if (!rel.endsWith(".json") && !rel.endsWith(".sha256") && !rel.endsWith(".sig")) return [];
  return rel.split("/").filter(Boolean);
}

function policy() {
  const raw = String(process.env.URGENTDASH_INTEGRITY_FAILURE_POLICY || "fallback").toLowerCase();
  return raw === "error" ? "error" : "fallback";
}

export default async function handler(_request, response) {
  const latestUrl = buildLiveArtifactUrl("latest.json");
  const integrityPolicy = policy();

  try {
    const latest = await fetchUpstreamJson(latestUrl);
    if (latest.ok) {
      const pointer = JSON.parse(latest.body || "{}");
      const liteSegments = resolveArtifactSegments(pointer?.liteUrl);
      if (liteSegments.length) {
        const litePath = liteSegments.join("/");
        const liteUrl = buildLiveArtifactUrl(...liteSegments);
        const liteIntegrity = pointer?.integrity?.lite || null;

        const verifiedLite = await fetchAndVerifyArtifact({
          artifactUrl: liteUrl,
          filename: "state-lite.json",
          integrity: liteIntegrity
        });

        if (verifiedLite.ok) {
          const payload = JSON.parse(verifiedLite.body || "{}");
          if (!payload.metadata || typeof payload.metadata !== "object") payload.metadata = {};
          payload.metadata.integrity = {
            status: "verified",
            artifact: litePath,
            verifiedAt: new Date().toISOString(),
            failCount: 0
          };

          const aiSegments = resolveArtifactSegments(pointer?.aiUrl);
          if (aiSegments.length && pointer?.integrity?.ai) {
            const aiUrl = buildLiveArtifactUrl(...aiSegments);
            const verifiedAi = await fetchAndVerifyArtifact({
              artifactUrl: aiUrl,
              filename: "state-ai.json",
              integrity: pointer.integrity.ai
            });
            if (verifiedAi.ok) {
              const aiPayload = JSON.parse(verifiedAi.body || "{}");
              if (aiPayload?.ai_analysis) payload.ai_analysis = aiPayload.ai_analysis;
              if (aiPayload?.aiVersion) payload.aiVersion = aiPayload.aiVersion;
              if (aiPayload?.aiUpdatedAt) payload.aiUpdatedAt = aiPayload.aiUpdatedAt;
              if (aiPayload?.aiStatus) payload.aiStatus = aiPayload.aiStatus;
              response.setHeader("X-UrgentDash-AI-Upstream", aiUrl);
            }
          }

          applyProxyHeaders(response, liteUrl);
          response.setHeader("X-UrgentDash-State-Mode", "latest-pointer-merged");
          response.setHeader("X-UrgentDash-Integrity", "verified");
          response.setHeader("X-UrgentDash-Integrity-Last-Success-At", payload.metadata.integrity.verifiedAt);
          response.setHeader("X-UrgentDash-Integrity-Fail-Count", "0");
          response.status(200).send(JSON.stringify(payload));
          return;
        }

        if (integrityPolicy === "error") {
          applyProxyHeaders(response, liteUrl);
          response.setHeader("X-UrgentDash-State-Mode", "integrity-error");
          response.setHeader("X-UrgentDash-Integrity", "failed");
          response.setHeader("X-UrgentDash-Integrity-Fail-Count", "1");
          response.status(502).send(
            JSON.stringify({ error: "integrity_verification_failed", reason: verifiedLite.reason })
          );
          return;
        }
      }

      const legacySegments = resolveArtifactSegments(pointer?.legacyUrl);
      if (legacySegments.length) {
        response.setHeader("X-UrgentDash-State-Mode", "latest-pointer-legacy");
        response.setHeader("X-UrgentDash-Integrity", "fallback");
        response.setHeader("X-UrgentDash-Integrity-Fail-Count", "1");
        await proxyUpstreamJson(response, buildLiveArtifactUrl(...legacySegments));
        return;
      }
    }
  } catch {
    /* fall back to legacy pointer */
  }

  response.setHeader("X-UrgentDash-State-Mode", "legacy");
  response.setHeader("X-UrgentDash-Integrity", "fallback");
  response.setHeader("X-UrgentDash-Integrity-Fail-Count", "1");
  await proxyUpstreamJson(response, buildLiveArtifactUrl("hyie_state.json"));
}
