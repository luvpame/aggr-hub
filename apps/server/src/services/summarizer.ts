import OpenAI from "openai";
import type { feeds } from "../db/schema.js";

type FeedType = (typeof feeds.$inferSelect)["feedType"];

const MIN_TEXT_LENGTH = 50;

const DEFAULT_SYSTEM_PROMPT =
  "あなたは記事要約アシスタントです。与えられたテキストを日本語で1〜2文に要約してください。要約のみを返してください。";

const GITHUB_RELEASES_SHORT_SYSTEM_PROMPT =
  "あなたはGitHub Releasesの要約アシスタントです。与えられたリリースノートの変更内容を日本語で1〜2文に要約してください。要約のみを返してください。";

const GITHUB_RELEASES_SYSTEM_PROMPT =
  "あなたはGitHub Releasesの翻訳・要約アシスタントです。与えられたリリースノートの変更内容を日本語に翻訳し、Markdown箇条書きで網羅的にまとめてください。カテゴリ（新機能、バグ修正、破壊的変更など）があればそのまま見出しとして残してください。要約のみを返してください。";

const SHORT_SUMMARY_MAX_COMPLETION_TOKENS = 800;
const DETAILED_SUMMARY_MAX_COMPLETION_TOKENS = 4096;
const OPENAI_MODEL = "gpt-5.4-nano";

interface LLMClient {
  client: OpenAI;
  model: string;
}

export type SummaryEnv = {
  SUMMARY_API_BASE_URL?: string;
  SUMMARY_API_KEY?: string;
  SUMMARY_MODEL?: string;
  OPENAI_API_KEY?: string;
};

function createClients(env: SummaryEnv = {}): LLMClient[] {
  const clients: LLMClient[] = [];
  if (env.SUMMARY_API_BASE_URL) {
    clients.push({
      client: new OpenAI({
        baseURL: env.SUMMARY_API_BASE_URL,
        apiKey: env.SUMMARY_API_KEY ?? "free",
      }),
      model: env.SUMMARY_MODEL ?? "default",
    });
  }
  if (env.OPENAI_API_KEY) {
    clients.push({ client: new OpenAI({ apiKey: env.OPENAI_API_KEY }), model: OPENAI_MODEL });
  }
  console.log(
    `[summarizer] createClients: ${clients.length} client(s) available [${clients.map((c) => c.model).join(", ")}]`,
  );
  return clients;
}

async function callLLMWithClient(
  client: LLMClient,
  systemPrompt: string,
  text: string,
  maxCompletionTokens: number,
  retries = 3,
): Promise<string | undefined> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(
        `[summarizer] callLLM attempt ${attempt + 1}/${retries + 1} (model: ${client.model}, input: ${text.length} chars, maxTokens: ${maxCompletionTokens})`,
      );
      const response = await client.client.chat.completions.create({
        model: client.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        reasoning_effort: "none",
        max_completion_tokens: maxCompletionTokens,
      });
      const raw = response.choices[0]?.message?.content;
      const content = raw?.trim() || undefined;
      console.log(
        `[summarizer] callLLM success (model: ${client.model}, output: ${content?.length ?? 0} chars, finishReason: ${response.choices[0]?.finish_reason})`,
      );
      return content;
    } catch (error) {
      console.error(
        `[summarizer] callLLM error attempt ${attempt + 1}/${retries + 1} (model: ${client.model}):`,
        error,
      );
      if (attempt < retries) {
        const delay = 1000 * 2 ** attempt;
        console.log(`[summarizer] retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      return undefined;
    }
  }
  return undefined;
}

async function callLLM(
  clients: LLMClient[],
  systemPrompt: string,
  text: string,
  maxCompletionTokens: number,
): Promise<string | undefined> {
  for (let i = 0; i < clients.length; i++) {
    const result = await callLLMWithClient(clients[i], systemPrompt, text, maxCompletionTokens);
    if (result) return result;
    if (i < clients.length - 1) {
      console.log(`[summarizer] falling back to next client (${clients[i + 1].model})...`);
    }
  }
  console.error("[summarizer] all clients failed");
  return undefined;
}

export async function summarizeText(
  text: string,
  feedType?: FeedType,
  env: SummaryEnv = {},
): Promise<string | undefined> {
  if (text.length < MIN_TEXT_LENGTH) return text;

  const clients = createClients(env);
  if (clients.length === 0) return undefined;

  if (feedType === "github-releases") {
    const input = text.slice(0, 2000);
    return callLLM(
      clients,
      GITHUB_RELEASES_SHORT_SYSTEM_PROMPT,
      input,
      SHORT_SUMMARY_MAX_COMPLETION_TOKENS,
    );
  }

  const input = text.slice(0, 2000);
  return callLLM(clients, DEFAULT_SYSTEM_PROMPT, input, SHORT_SUMMARY_MAX_COMPLETION_TOKENS);
}

export interface SummaryResult {
  summary: string;
  detailedSummary?: string;
  skipped?: boolean;
}

export async function summarizeItems(
  items: { id: string; text: string | null }[],
  feedType?: FeedType,
  env: SummaryEnv = {},
  concurrency?: number,
): Promise<Map<string, SummaryResult>> {
  const effectiveConcurrency = concurrency ?? (feedType === "github-releases" ? 1 : 3);
  const results = new Map<string, SummaryResult>();
  let index = 0;

  console.log(
    `[summarizer] summarizeItems: ${items.length} items, feedType=${feedType}, concurrency=${effectiveConcurrency}`,
  );

  const clients = createClients(env);
  if (clients.length === 0) {
    console.warn("[summarizer] no LLM clients available, skipping summarization");
    return results;
  }

  async function worker() {
    while (index < items.length) {
      const i = index++;
      const item = items[i];
      if (!item?.text) {
        console.log(`[summarizer] skipping item ${item.id}: text is null`);
        continue;
      }

      if (item.text.length < MIN_TEXT_LENGTH) {
        console.log(
          `[summarizer] item ${item.id}: text too short (${item.text.length} chars), using original text as summary`,
        );
        results.set(item.id, { summary: item.text, skipped: true });
        continue;
      }

      console.log(`[summarizer] processing item ${item.id} (${item.text.length} chars)`);

      if (feedType === "github-releases") {
        const shortInput = item.text.slice(0, 2000);
        const [summary, detailedSummary] = await Promise.all([
          callLLM(
            clients,
            GITHUB_RELEASES_SHORT_SYSTEM_PROMPT,
            shortInput,
            SHORT_SUMMARY_MAX_COMPLETION_TOKENS,
          ),
          callLLM(
            clients,
            GITHUB_RELEASES_SYSTEM_PROMPT,
            item.text,
            DETAILED_SUMMARY_MAX_COMPLETION_TOKENS,
          ),
        ]);
        console.log(
          `[summarizer] item ${item.id} result: summary=${!!summary}, detailedSummary=${!!detailedSummary}`,
        );
        if (summary) {
          results.set(item.id, {
            summary,
            detailedSummary: detailedSummary ?? undefined,
          });
        }
      } else {
        const input = item.text.slice(0, 2000);
        const summary = await callLLM(
          clients,
          DEFAULT_SYSTEM_PROMPT,
          input,
          SHORT_SUMMARY_MAX_COMPLETION_TOKENS,
        );
        console.log(`[summarizer] item ${item.id} result: summary=${!!summary}`);
        if (summary) {
          results.set(item.id, { summary });
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(effectiveConcurrency, items.length) }, () =>
    worker(),
  );
  await Promise.allSettled(workers);

  return results;
}
