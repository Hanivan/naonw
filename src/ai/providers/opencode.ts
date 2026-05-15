import type { ChatResult, ToolDefinition } from "@/ai/client.ts";
import { OAIProvider, type OAIMessage, type OAIToolCall } from "@/ai/providers/base.ts";
import { log } from "@/utils/logger.ts";

export interface OpencodeClientConfig {
  model?: string;
  baseUrl?: string;
  apiKeys?: string[];
}

export class OpencodeClient extends OAIProvider {
  readonly provider = "opencode";
  private baseUrl: string;

  constructor(config: OpencodeClientConfig = {}) {
    super(
      config.model ?? "minimax-m2.5",
      config.apiKeys?.filter(Boolean) ?? ["opencode"],
    );
    this.baseUrl = (config.baseUrl ?? "http://127.0.0.1:4096/v1").replace(/\/$/, "");
  }

  protected async doChat(messages: OAIMessage[], tools: ToolDefinition[]): Promise<ChatResult> {
    const oaiTools = tools.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    if (process.env.DEBUG) {
      log.debug(`opencode → ${this.baseUrl} model=${this.model} msgs=${messages.length}`);
    }

    const body = JSON.stringify({ model: this.model, messages, tools: oaiTools, tool_choice: "auto" });
    let res!: Response;
    let usedKey = this.nextKey();
    if (!usedKey) throw new Error("All OpenCode API keys are rate-limited");

    for (let attempt = 0; attempt <= Math.min(this.apiKeys.length, 3); attempt++) {
      if (attempt > 0) await Bun.sleep(1000 * attempt);
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${usedKey.key}` },
        body,
      });
      if (res.status === 429) { this.lockKey(usedKey.index); usedKey = this.nextKey() ?? usedKey; continue; }
      if (res.ok || res.status < 500) break;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenCode API ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = await res.json() as {
      choices: Array<{ message: { content: string | null; tool_calls?: OAIToolCall[] } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    if (data.usage) log.token(data.usage.prompt_tokens, data.usage.completion_tokens);
    if (process.env.DEBUG) log.debug(`opencode response: ${JSON.stringify(data).slice(0, 400)}`);

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
