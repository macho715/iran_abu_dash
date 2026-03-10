import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callAiChat, extractAiText } from "./aiChat.js";

describe("aiChat", () => {
  beforeEach(() => {
    window.__JPT71_AI_ENDPOINT__ = "https://proxy.example.com/api/ai/chat";
    window.__JPT71_AI_PROXY_TOKEN__ = "top-secret";
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "request-1234"),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.__JPT71_AI_ENDPOINT__;
    delete window.__JPT71_AI_PROXY_TOKEN__;
  });

  it("posts chat requests with the expected headers and payload", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "응답 본문" } }],
      }),
    });

    const result = await callAiChat({
      messages: [{ role: "user", content: "테스트 질문" }],
    });

    expect(result.text).toBe("응답 본문");
    expect(fetch).toHaveBeenCalledWith(
      "https://proxy.example.com/api/ai/chat",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-request-id": "request-1234",
          "x-ai-sensitivity": "internal",
          "x-ai-proxy-token": "top-secret",
        }),
      })
    );
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1].body)).toEqual({
      model: "github-copilot/gpt-5-mini",
      sensitivity: "internal",
      messages: [{ role: "user", content: "테스트 질문" }],
    });
  });

  it("maps proxy error details into thrown errors", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ detail: "policy blocked" }),
    });

    await expect(callAiChat({
      messages: [{ role: "user", content: "차단 테스트" }],
    })).rejects.toThrow("AI proxy error: policy blocked");
  });

  it("extracts text from common response shapes", () => {
    expect(extractAiText({
      output: [{ content: [{ text: "첫 번째 응답" }] }],
    })).toBe("첫 번째 응답");

    expect(extractAiText({
      messages: [{ role: "assistant", content: [{ text: "두 번째 응답" }] }],
    })).toBe("두 번째 응답");
  });
});
