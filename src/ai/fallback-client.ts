import type { AIClient, ChatResult, ToolDefinition } from "@/ai/client.ts";
import { toMessage } from "@/utils/errors.ts";
import { log } from "@/utils/logger.ts";
import { OllamaClient } from "./ollama-client.ts";
import { OpencodeClient } from "./opencode-client.ts";

export interface FallbackClientConfig {
  ollama: { apiKey?: string; host?: string; model?: string; supportsVision?: boolean; thinking?: boolean };
  opencode?: { model?: string; baseUrl?: string; apiKey?: string };
}

export class FallbackClient implements AIClient {
  readonly provider = "fallback";
  private primary: OllamaClient;
  private fallback: OpencodeClient;
  private switched = false;

  constructor(config: FallbackClientConfig) {
    this.primary = new OllamaClient(config.ollama);
    this.fallback = new OpencodeClient(config.opencode ?? {});
  }

  addSystem(content: string): void {
    this.primary.addSystem(content);
    this.fallback.addSystem(content);
  }

  addUser(content: string): void {
    if (!this.switched) this.primary.addUser(content);
    this.fallback.addUser(content);
  }

  addAssistant(content: string): void {
    if (!this.switched) this.primary.addAssistant(content);
    this.fallback.addAssistant(content);
  }

  addToolResult(toolName: string, content: string): void {
    if (!this.switched) this.primary.addToolResult(toolName, content);
    this.fallback.addToolResult(toolName, content);
  }

  addImage(base64: string): void {
    if (!this.switched) this.primary.addImage(base64);
    this.fallback.addImage(base64);
  }

  clearHistory(): void {
    this.primary.clearHistory();
    this.fallback.clearHistory();
  }

  async chat(tools: ToolDefinition[]): Promise<ChatResult> {
    if (this.switched) {
      return this.fallback.chat(tools);
    }

    try {
      return await this.primary.chat(tools);
    } catch (err: unknown) {
      const lower = toMessage(err).toLowerCase();
      const isRateLimit =
        lower.includes("rate") ||
        lower.includes("limit") ||
        lower.includes("429") ||
        lower.includes("quota") ||
        lower.includes("too many");

      if (isRateLimit) {
        log.warn("Ollama rate limited — switching to opencode");
        this.switched = true;
        return this.fallback.chat(tools);
      }

      throw err;
    }
  }

  async close(): Promise<void> {
    await this.fallback.close();
  }
}
