import { proxyLiveJson } from "../../../_liveProxy.js";

const ALLOWED_ARTIFACTS = new Set(["state-lite.json", "state-ai.json"]);

export default async function handler(request, response) {
  const version = String(request.query?.version || "").trim();
  const artifact = String(request.query?.artifact || "").trim();

  if (!version || !ALLOWED_ARTIFACTS.has(artifact)) {
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");
    response.status(404).send(JSON.stringify({ error: "unsupported_artifact" }));
    return;
  }

  await proxyLiveJson(response, "v", version, artifact);
}
