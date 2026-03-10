import { getAiEndpoint, getAiProxyToken } from "./aiConfig.js";
import { normalizeWhitespace } from "./utils.js";

const DEFAULT_MODEL = "github-copilot/gpt-5-mini";
const DEFAULT_SENSITIVITY = "internal";

function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function contentToText(content) {
  if (typeof content === "string") return normalizeWhitespace(content);
  if (content && typeof content === "object" && !Array.isArray(content)) {
    if (typeof content.text === "string") return normalizeWhitespace(content.text);
    if (typeof content.content === "string") return normalizeWhitespace(content.content);
    if (Array.isArray(content.content)) {
      return normalizeWhitespace(
        content.content
          .map((item) => contentToText(item))
          .filter(Boolean)
          .join("\n")
      );
    }
  }
  if (Array.isArray(content)) {
    return normalizeWhitespace(
      content
        .map((item) => {
          if (typeof item === "string") return item;
          if (!item || typeof item !== "object") return "";
          if (typeof item.text === "string") return item.text;
          if (typeof item.content === "string") return item.content;
          return "";
        })
        .filter(Boolean)
        .join("\n")
    );
  }
  return "";
}

function extractTextFromOutput(output) {
  if (!Array.isArray(output)) return "";

  return normalizeWhitespace(
    output
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        if (typeof item.text === "string") return item.text;
        if (Array.isArray(item.content)) {
          return item.content
            .map((part) => {
              if (typeof part === "string") return part;
              if (!part || typeof part !== "object") return "";
              if (typeof part.text === "string") return part.text;
              return "";
            })
            .filter(Boolean)
            .join("\n");
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
  );
}

export function extractAiText(payload) {
  if (typeof payload === "string") return normalizeWhitespace(payload);
  if (!payload || typeof payload !== "object") return "";

  const directCandidates = [
    payload.text,
    payload.output_text,
    payload.outputText,
    payload.answer,
    payload.message,
    payload.message?.content,
    payload.response,
    payload.result?.text,
    payload.result?.message,
    payload.result?.message?.content,
    payload.data?.text,
    payload.data?.message?.content,
  ];
  for (const candidate of directCandidates) {
    const text = contentToText(candidate);
    if (text) return text;
  }

  if (Array.isArray(payload.choices)) {
    for (const choice of payload.choices) {
      const choiceText = contentToText(choice?.message?.content)
        || contentToText(choice?.delta?.content)
        || contentToText(choice?.text);
      if (choiceText) return choiceText;
    }
  }

  if (Array.isArray(payload.messages)) {
    const assistantMessage = [...payload.messages]
      .reverse()
      .find((message) => message?.role === "assistant" && message?.content);
    const assistantText = contentToText(assistantMessage?.content);
    if (assistantText) return assistantText;
  }

  const outputText = extractTextFromOutput(payload.output);
  if (outputText) return outputText;

  return "";
}

export async function callAiChat({ messages, sensitivity = DEFAULT_SENSITIVITY, model = DEFAULT_MODEL, signal } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("AI chat requires at least one message.");
  }

  const proxyToken = getAiProxyToken();
  const headers = {
    "Content-Type": "application/json",
    "x-request-id": createRequestId(),
    "x-ai-sensitivity": sensitivity,
  };

  if (proxyToken) {
    headers["x-ai-proxy-token"] = proxyToken;
  }

  const response = await fetch(getAiEndpoint(), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      sensitivity,
      messages,
    }),
    signal,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = normalizeWhitespace(
      payload?.detail
      || payload?.error?.message
      || payload?.message
      || `HTTP ${response.status}`
    );
    throw new Error(`AI proxy error: ${detail}`);
  }

  const text = extractAiText(payload);
  if (!text) {
    throw new Error("AI proxy returned no text content.");
  }

  return { text, payload };
}
