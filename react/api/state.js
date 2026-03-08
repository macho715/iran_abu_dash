import { proxyLiveJson } from "./_liveProxy.js";

export default async function handler(_request, response) {
  await proxyLiveJson(response, "hyie_state.json");
}
