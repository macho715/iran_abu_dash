const DEFAULT_OWNER = "macho715";
const DEFAULT_REPO = "iran_abu_dash";
const DEFAULT_BRANCH = "urgentdash-live";

function githubRef(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

export function getPublishSource() {
  return {
    owner: githubRef(process.env.URGENTDASH_GITHUB_OWNER, DEFAULT_OWNER),
    repo: githubRef(process.env.URGENTDASH_GITHUB_REPO, DEFAULT_REPO),
    branch: githubRef(process.env.URGENTDASH_PUBLISH_BRANCH, DEFAULT_BRANCH)
  };
}

export function buildLiveArtifactUrl(...segments) {
  const { owner, repo, branch } = getPublishSource();
  const path = segments
    .filter(Boolean)
    .map((segment) => encodeURIComponent(String(segment)))
    .join("/");
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/live/${path}`;
}

async function fetchUpstreamJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache"
    }
  });

  const body = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body
  };
}

function applyProxyHeaders(response, upstreamUrl) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");
  response.setHeader("X-UrgentDash-Upstream", upstreamUrl);
}

export async function proxyLiveJson(response, ...segments) {
  const upstreamUrl = buildLiveArtifactUrl(...segments);
  applyProxyHeaders(response, upstreamUrl);

  try {
    const upstream = await fetchUpstreamJson(upstreamUrl);
    if (!upstream.ok) {
      response.status(upstream.status).send(
        JSON.stringify({
          error: "upstream_fetch_failed",
          upstreamStatus: upstream.status,
          upstreamUrl
        })
      );
      return;
    }

    response.status(200).send(upstream.body);
  } catch (error) {
    response.status(502).send(
      JSON.stringify({
        error: "upstream_request_error",
        message: String(error?.message || error || ""),
        upstreamUrl
      })
    );
  }
}
