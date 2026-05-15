import type { ChatResult, ToolDefinition } from "@/ai/client.ts";
import { OAIProvider, type OAIMessage, type OAIToolCall } from "@/ai/providers/base.ts";
import { log } from "@/utils/logger.ts";

export interface OpenRouterClientConfig {
  model?: string;
  apiKeys?: string[];
  siteUrl?: string;
  siteName?: string;
}

export class OpenRouterClient extends OAIProvider {
  readonly provider = "openrouter";
  private readonly baseUrl = "https://openrouter.ai/api/v1";
  private readonly extraHeaders: Record<string, string>;

  constructor(config: OpenRouterClientConfig = {}) {
    super(
      config.model ?? "openrouter/owl-alpha",
      config.apiKeys?.filter(Boolean) ?? [],
    );
    this.extraHeaders = {
      ...(config.siteUrl ? { "HTTP-Referer": config.siteUrl } : {}),
      ...(config.siteName ? { "X-Title": config.siteName } : {}),
    };
  }

  protected async doChat(messages: OAIMessage[], tools: ToolDefinition[]): Promise<ChatResult> {
    const oaiTools = tools.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    if (process.env.DEBUG) {
      log.debug(`openrouter → model=${this.model} msgs=${messages.length}`);
    }

    const body = JSON.stringify({ model: this.model, messages, tools: oaiTools, tool_choice: "auto" });
    let usedKey = this.nextKey();
    if (!usedKey) throw new Error("All OpenRouter API keys are rate-limited");

    let res!: Response;
    for (let attempt = 0; attempt <= Math.min(this.apiKeys.length, 3); attempt++) {
      if (attempt > 0) await Bun.sleep(1000 * attempt);
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${usedKey.key}`,
          ...this.extraHeaders,
        },
        body,
      });
      if (res.status === 429) { this.lockKey(usedKey.index); usedKey = this.nextKey() ?? usedKey; continue; }
      if (res.ok || res.status < 500) break;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter API ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = await res.json() as {
      choices: Array<{ message: { content: string | null; tool_calls?: OAIToolCall[] } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    if (data.usage) log.token(data.usage.prompt_tokens, data.usage.completion_tokens);
    if (process.env.DEBUG) log.debug(`openrouter response: ${JSON.stringify(data).slice(0, 400)}`);

    const msg = data.choices?.[0]?.message;
    if (!msg) return { content: null, thinking: null, toolCalls: [], provider: this.provider };

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length > 0) this.recordToolCalls(msg.content ?? null, toolCalls);

    return {
      content: msg.content ?? null,
      thinking: null,
      provider: this.provider,
      toolCalls: this.parseToolCalls(toolCalls),
    };
  }
}
