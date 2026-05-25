import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

const createMock = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn(function MockOpenAI() {
    return {
      chat: {
        completions: {
          create: createMock,
        },
      },
    };
  }),
}));

describe("summarizer", () => {
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const originalOllamaBaseUrl = process.env.OLLAMA_BASE_URL;

  beforeEach(() => {
    vi.resetModules();
    createMock.mockReset();
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.OLLAMA_BASE_URL;
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    process.env.OLLAMA_BASE_URL = originalOllamaBaseUrl;
  });

  test("uses a reasoning-safe token budget for short summaries", async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: "要約です。" }, finish_reason: "stop" }],
    });

    const { summarizeText } = await import("./summarizer.js");
    const result = await summarizeText("これは十分に長い記事本文です。".repeat(10));

    expect(result).toBe("要約です。");
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoning_effort: "none",
        max_completion_tokens: 800,
      }),
    );
    expect(createMock.mock.calls[0][0]).not.toHaveProperty("temperature");
  });
});
