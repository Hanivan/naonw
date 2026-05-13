import type { AIClient, ChatResult, ToolDefinition } from "@/ai/client.ts";

export interface OpencodeClientConfig {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

type OAIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OAIToolCall[] }
  | { role: "tool"; tool_call_id: string; name: string; content: string };

interface OAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export class OpencodeClient implements AIClient {
  readonly provider = "opencode";
  private model: string;
  private baseUrl: string;
  private apiKey: string;
  private messages: OAIMessage[] = [];
  private pendingToolCallIds: string[] = [];
  private pendingImages: string[] = [];
  private skipNextAddAssistant = false;

  constructor(config: OpencodeClientConfig = {}) {
    this.model = config.model ?? "anthropic/claude-sonnet-4-5-20250514";
    this.baseUrl = (config.baseUrl ?? "http://127.0.0.1:4096/v1").replace(/\/$/, "");
    this.apiKey = config.apiKey ?? "opencode";
  }

  addSystem(content: string): void {
    this.messages.push({ role: "system", content });
  }

  addUser(content: string): void {
    this.messages.push({ role: "user", content });
  }

  addAssistant(content: string): void {
    if (this.skipNextAddAssistant) {
      this.skipNextAddAssistant = false;
      return;
    }
    this.messages.push({ role: "assistant", content });
  }

  addToolResult(toolName: string, content: string): void {
    const id = this.pendingToolCallIds.shift() ?? `call_${Date.now()}`;
    this.messages.push({ role: "tool", tool_call_id: id, name: toolName, content });
  }

  addImage(base64: string): void {
    this.pendingImages.push(base64);
  }

  clearHistory(): void {
    this.messages = [];
    this.pendingToolCallIds = [];
    this.pendingImages = [];
    this.skipNextAddAssistant = false;
  }

  async chat(tools: ToolDefinition[]): Promise<ChatResult> {
    const oaiTools = tools.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));

    // keep first msg (task) + last 12 to cap size
    const trimmed =
      this.messages.length > 13
        ? [this.messages[0], ...this.messages.slice(-12)]
        : this.messages;

    this.pendingImages = [];

    if (process.env.DEBUG) {
      console.log(`[DEBUG] opencode → ${this.baseUrl} model=${this.model} msgs=${trimmed.length}`);
    }

    const body = JSON.stringify({ model: this.model, messages: trimmed, tools: oaiTools, tool_choice: "auto" });
    let res!: Response;
    for (let attempt = 0; attempt <= 2; attempt++) {
      if (attempt > 0) await Bun.sleep(1500 * attempt);
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body,
      });
      if (res.ok || res.status < 500) break;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenCode API ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: OAIToolCall[];
        };
      }>;
    };

    if (process.env.DEBUG) {
      console.log(`[DEBUG] opencode response: ${JSON.stringify(data).slice(0, 400)}`);
    }

    const msg = data.choices?.[0]?.message;
    if (!msg) return { content: null, thinking: null, toolCalls: [] };
    const toolCalls = msg.tool_calls ?? [];

    if (toolCalls.length > 0) {
      this.messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: toolCalls });
      this.pendingToolCallIds = toolCalls.map((tc) => tc.id);
      this.skipNextAddAssistant = true;
    }

    return {
      content: msg?.content ?? null,
      thinking: null,
      toolCalls: toolCalls.map((tc) => ({
        name: tc.function.name,
        arguments: (() => {
          try { return JSON.parse(tc.function.arguments); } catch { return {}; }
        })(),
      })),
    };
  }

  async close(): Promise<void> {}
}
