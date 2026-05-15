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
    for (let i = this.activeIndex; i < this.providers.length; i++) {
      try {
        const result = await this.providers[i]!.chat(tools);
        this.activeIndex = i;
        return result;
      } catch (err: unknown) {
        if (!isRateLimit(err) || i === this.providers.length - 1) throw err;
        const next = this.providers[i + 1]!;
        log.warn(`${this.providers[i]!.provider} rate limited — switching to ${next.provider}`);
        this.activeIndex = i + 1;
      }
    }
    throw new Error("All providers are rate-limited");
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
