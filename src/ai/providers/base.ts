import type { AIClient, ChatResult, ToolDefinition } from "@/ai/client.ts";
import { log } from "@/utils/logger.ts";

// ── Shared OAI wire types ────────────────────────────────────────────────────

export type OAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type OAIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | OAIContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: OAIToolCall[] }
  | { role: "tool"; tool_call_id: string; name: string; content: string };

// ── Tier 1: root for all providers (single and composite) ───────────────────

export abstract class BaseProvider implements AIClient {
  abstract readonly provider: string;
  abstract addSystem(content: string): void;
  abstract addUser(content: string): void;
  abstract addAssistant(content: string): void;
  abstract addToolResult(toolName: string, content: string): void;
  abstract addImage(base64: string): void;
  abstract clearHistory(): void;
  abstract chat(tools: ToolDefinition[]): Promise<ChatResult>;
  // Mirror the assistant turn that ANOTHER provider produced. Default: no-op.
  // Overridden by OAI providers so a fallback target inherits a syntactically
  // valid history when it later becomes active mid-conversation.
  mirrorAssistantToolCalls(_content: string | null, _toolCalls: { name: string; arguments: Record<string, unknown> }[]): void {}
  async close(): Promise<void> {}

  // Pre-flight check. Return null if usable, otherwise a one-line error string.
  // Default: assume usable (override in subclasses that can verify).
  async validate(): Promise<string | null> { return null; }
}

// ── Tier 2: single-endpoint providers — adds API key rotation ────────────────

export abstract class DirectProvider extends BaseProvider {
  protected readonly apiKeys: string[];
  protected readonly lockedKeys = new Set<number>();
  protected keyIndex = 0;

  constructor(apiKeys: string[] = []) {
    super();
    this.apiKeys = apiKeys;
  }

  protected nextKey(): { key: string; index: number } | null {
    if (!this.apiKeys.length) return null;
    for (let i = 0; i < this.apiKeys.length; i++) {
      const idx = this.keyIndex % this.apiKeys.length;
      this.keyIndex++;
      if (!this.lockedKeys.has(idx)) return { key: this.apiKeys[idx]!, index: idx };
    }
    return null;
  }

  protected lockKey(index: number): void {
    this.lockedKeys.add(index);
    log.warn(`[${this.provider}] key #${index + 1} rate-limited — locked (${this.lockedKeys.size}/${this.apiKeys.length})`);
  }
}

// ── Tier 3: OAI-compatible — adds shared message management + doChat ─────────
// Extend this for any OpenAI-compatible provider. Only doChat() needs implementation.

export abstract class OAIProvider extends DirectProvider {
  protected readonly model: string;
  protected messages: OAIMessage[] = [];
  protected pendingToolCallIds: string[] = [];
  protected skipNextAdd = false;

  constructor(model: string, apiKeys: string[] = []) {
    super(apiKeys);
    this.model = model;
  }

  addSystem(content: string): void {
    this.messages.push({ role: "system", content });
  }

  addUser(content: string): void {
    this.messages.push({ role: "user", content });
  }

  addAssistant(content: string): void {
    if (this.skipNextAdd) { this.skipNextAdd = false; return; }
    this.messages.push({ role: "assistant", content });
  }

  addToolResult(toolName: string, content: string): void {
    const id = this.pendingToolCallIds.shift() ?? `call_${Date.now()}`;
    this.messages.push({ role: "tool", tool_call_id: id, name: toolName, content });
  }

  addImage(base64: string): void {
    this.messages.push({
      role: "user",
      content: [{ type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } }],
    });
  }

  clearHistory(): void {
    this.messages = [];
    this.pendingToolCallIds = [];
    this.skipNextAdd = false;
    this.skipNextMirror = false;
  }

  protected trimHistory(): OAIMessage[] {
    if (this.messages.length <= 13) return this.messages;
    const result = [this.messages[0]!, ...this.messages.slice(-12)];
    while (result.length > 1 && result[1]?.role === "tool") result.splice(1, 1);
    return result;
  }

  protected recordToolCalls(content: string | null, toolCalls: OAIToolCall[]): void {
    this.messages.push({ role: "assistant", content, tool_calls: toolCalls });
    this.pendingToolCallIds = toolCalls.map((tc) => tc.id);
    this.skipNextAdd = true;
    this.skipNextMirror = true;
  }

  protected skipNextMirror = false;

  override mirrorAssistantToolCalls(content: string | null, toolCalls: { name: string; arguments: Record<string, unknown> }[]): void {
    if (this.skipNextMirror) { this.skipNextMirror = false; return; }
    const synth: OAIToolCall[] = toolCalls.map((tc, i) => ({
      id: `mirror_${Date.now()}_${i}`,
      type: "function" as const,
      function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
    }));
    this.messages.push({ role: "assistant", content, tool_calls: synth });
    this.pendingToolCallIds = synth.map((tc) => tc.id);
  }

  protected parseToolCalls(raw: OAIToolCall[]): ChatResult["toolCalls"] {
    return raw.map((tc) => ({
      name: tc.function.name,
      arguments: (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })(),
    }));
  }

  protected abstract doChat(messages: OAIMessage[], tools: ToolDefinition[]): Promise<ChatResult>;

  async chat(tools: ToolDefinition[]): Promise<ChatResult> {
    return this.doChat(this.trimHistory(), tools);
  }
}
