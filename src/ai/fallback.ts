import type { ChatResult, ToolDefinition } from "@/ai/client.ts";
import { BaseProvider } from "@/ai/providers/base.ts";
import { toMessage } from "@/utils/errors.ts";
import { log } from "@/utils/logger.ts";
import { OllamaClient } from "@/ai/providers/ollama.ts";
import { OpencodeClient } from "@/ai/providers/opencode.ts";
import { OpenRouterClient } from "@/ai/providers/openrouter.ts";

export interface FallbackClientConfig {
  ollama: { apiKeys?: string[]; host?: string; model?: string; supportsVision?: boolean; thinking?: boolean };
  opencode?: { model?: string; baseUrl?: string; apiKeys?: string[] };
  openrouter?: { model?: string; apiKeys?: string[]; siteUrl?: string; siteName?: string };
}

function isRateLimit(err: unknown): boolean {
  const msg = toMessage(err).toLowerCase();
  return msg.includes("rate") || msg.includes("limit") || msg.includes("429") || msg.includes("quota") || msg.includes("too many");
}

function failureReason(err: unknown): string | null {
  const msg = toMessage(err).toLowerCase();
  if (isRateLimit(err)) return "rate limited";
  if (msg.includes("not found") || msg.includes("404")) return "model unavailable";
  if (msg.includes("unauthorized") || msg.includes("401") || msg.includes("403") || msg.includes("invalid api key")) return "auth failed";
  if (msg.includes("503") || msg.includes("502") || msg.includes("server error") || msg.includes("overloaded")) return "server error";
  if (msg.includes("econnrefused") || msg.includes("etimedout") || msg.includes("network") || msg.includes("fetch failed")) return "network error";
  return null;
}

export class FallbackClient extends BaseProvider {
  readonly provider = "fallback";
  // Priority order: openrouter → ollama → opencode
  // Providers without API keys are skipped at construction time.
  private readonly providers: BaseProvider[];
  private activeIndex = 0;

  constructor(config: FallbackClientConfig) {
    super();
    this.providers = [];
    if (config.openrouter?.apiKeys?.length) {
      this.providers.push(new OpenRouterClient(config.openrouter));
    }
    this.providers.push(new OllamaClient(config.ollama));
    if (config.opencode?.apiKeys?.length) {
      this.providers.push(new OpencodeClient(config.opencode));
    }
  }

  addSystem(content: string): void {
    for (const c of this.providers) c.addSystem(content);
  }

  addUser(content: string): void {
    for (const c of this.providers) c.addUser(content);
  }

  addAssistant(content: string): void {
    for (const c of this.providers) c.addAssistant(content);
  }

  addToolResult(toolName: string, content: string): void {
    for (const c of this.providers) c.addToolResult(toolName, content);
  }

  addImage(base64: string): void {
    for (const c of this.providers) c.addImage(base64);
  }

  clearHistory(): void {
    for (const c of this.providers) c.clearHistory();
    this.activeIndex = 0;
  }

  async chat(tools: ToolDefinition[]): Promise<ChatResult> {
    let lastErr: unknown;
    for (let i = this.activeIndex; i < this.providers.length; i++) {
      try {
        const result = await this.providers[i]!.chat(tools);
        this.activeIndex = i;
        if (result.toolCalls.length > 0) {
          for (const p of this.providers) p.mirrorAssistantToolCalls(result.content, result.toolCalls);
        }
        return result;
      } catch (err: unknown) {
        lastErr = err;
        const reason = failureReason(err);
        const isLast = i === this.providers.length - 1;
        if (reason === null || isLast) {
          if (reason && isLast) log.error(`all providers failed — last: ${this.providers[i]!.provider} (${reason}: ${toMessage(err)})`);
          throw err;
        }
        const next = this.providers[i + 1]!;
        log.warn(`${this.providers[i]!.provider} ${reason} — switching to ${next.provider}`);
        this.activeIndex = i + 1;
      }
    }
    throw lastErr ?? new Error("All providers exhausted");
  }

  override async close(): Promise<void> {
    for (const c of this.providers) await c.close();
  }

  // Returns null if at least one provider passes; otherwise a multi-line error.
  override async validate(): Promise<string | null> {
    if (this.providers.length === 0) return "no AI providers configured";
    const errors: string[] = [];
    for (const p of this.providers) {
      const err = await p.validate();
      if (err === null) return null;
      errors.push(`  • ${p.provider}: ${err}`);
    }
    return `all providers failed pre-flight checks:\n${errors.join("\n")}`;
  }
}
