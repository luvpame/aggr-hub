import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

const createMock = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn(function MockOpenAI(_options?: unknown) {
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
  beforeEach(() => {
    vi.resetModules();
    createMock.mockReset();
  });

  test("uses a reasoning-safe token budget for short summaries", async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: "要約です。" }, finish_reason: "stop" }],
    });

    const { summarizeText } = await import("./summarizer.js");
    const result = await summarizeText("これは十分に長い記事本文です。".repeat(10), undefined, {
      OPENAI_API_KEY: "test-key",
    });

    expect(result).toBe("要約です。");
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoning_effort: "none",
        max_completion_tokens: 800,
      }),
    );
    expect(createMock.mock.calls[0][0]).not.toHaveProperty("temperature");
  });

  test("uses the configured free summary API first", async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: "無料APIの要約です。" }, finish_reason: "stop" }],
    });

    const { summarizeText } = await import("./summarizer.js");
    const result = await summarizeText("これは十分に長い記事本文です。".repeat(10), undefined, {
      SUMMARY_API_BASE_URL: "https://example.test/v1",
      SUMMARY_MODEL: "free-model",
    });

    expect(result).toBe("無料APIの要約です。");
    expect(createMock).toHaveBeenCalledWith(expect.objectContaining({ model: "free-model" }));
  });
});
