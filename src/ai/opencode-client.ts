import { createOpencode } from "@opencode-ai/sdk";
import type { AIClient, ChatResult, ToolDefinition } from "@/ai/client.ts";

export interface OpencodeClientConfig {
  model?: string;
  hostname?: string;
  port?: number;
}

export class OpencodeClient implements AIClient {
  readonly provider = "opencode";
  private model: string;
  private hostname: string;
  private port: number;
  private messageHistory: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  private pendingToolResults: Array<{ toolName: string; result: string }> = [];
  private pendingImages: string[] = [];
  private opencode: Awaited<ReturnType<typeof createOpencode>> | null = null;
  private sessionId: string | null = null;

  constructor(config: OpencodeClientConfig = {}) {
    this.model = config.model ?? "anthropic/claude-sonnet-4-5-20250514";
    this.hostname = config.hostname ?? "127.0.0.1";
    this.port = config.port ?? 4096;
  }

  private async ensureSession(): Promise<string> {
    if (!this.sessionId) {
      this.opencode = await createOpencode({
        hostname: this.hostname,
        port: this.port,
        config: { model: this.model },
      });
      const res = await this.opencode.client.session.create({ body: {} });
      this.sessionId = res.data?.id ?? "";
    }
    return this.sessionId;
  }

  addSystem(content: string): void {
    this.messageHistory.push({ role: "system", content });
  }

  addUser(content: string): void {
    this.messageHistory.push({ role: "user", content });
  }

  addAssistant(content: string): void {
    this.messageHistory.push({ role: "assistant", content });
  }

  addToolResult(toolName: string, content: string): void {
    this.pendingToolResults.push({ toolName, result: content });
  }

  addImage(base64: string): void {
    this.pendingImages.push(base64);
  }

  clearHistory(): void {
    this.messageHistory = [];
    this.pendingToolResults = [];
    this.pendingImages = [];
  }

  async chat(tools: ToolDefinition[]): Promise<ChatResult> {
    const sessionId = await this.ensureSession();

    const toolDescriptions = tools
      .map((t) => {
        const params = Object.entries(t.parameters.properties)
          .map(([k, v]) => {
            const enumStr = v.enum ? ` (options: ${v.enum.join("/")})` : "";
            const reqStr = t.parameters.required?.includes(k) ? " (required)" : "";
            return `- ${k}: ${v.description ?? ""}${enumStr}${reqStr}`;
          })
          .join("\n");
        return `${t.name}: ${t.description}\nParameters:\n${params}`;
      })
      .join("\n\n");

    let systemMsg: (typeof this.messageHistory)[0] | undefined;
    const conversationMsgs: typeof this.messageHistory = [];
    for (const m of this.messageHistory) {
      if (m.role === "system") systemMsg = m;
      else conversationMsgs.push(m);
    }

    let promptText = "";
    if (systemMsg) {
      promptText += systemMsg.content + "\n\n";
    }
    promptText += `You have access to these tools. To call a tool, respond with ONLY a JSON array: [{"name": "tool_name", "arguments": {"param": "value"}}]\nIf the task is complete, respond with plain text (no JSON).\n\n${toolDescriptions}\n\n`;

    for (const msg of conversationMsgs) {
      promptText += `[${msg.role}]: ${msg.content}\n`;
    }

    if (this.pendingToolResults.length > 0) {
      const toolResultsText = this.pendingToolResults
        .map((r) => `Tool ${r.toolName} result: ${r.result}`)
        .join("\n");
      promptText += `[tool]: Tool results:\n${toolResultsText}\n`;
      this.pendingToolResults = [];
    }

    const imageParts = this.pendingImages.map((b64) => ({
      type: "image" as const,
      image: b64,
      mediaType: "image/png" as const,
    }));
    this.pendingImages = [];

    const response = await this.opencode!.client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text" as const, text: promptText }, ...imageParts],
      },
    });

    const allParts: Array<Record<string, unknown>> = (response.data?.parts ?? []) as Array<Record<string, unknown>>;
    const textParts = allParts
      .filter((p) => p.type === "text")
      .map((p) => String(p.text ?? ""))
      .join("");

    const toolParts = allParts
      .filter((p) => p.type === "tool")
      .map((p) => {
        const state = p.state as Record<string, unknown> | undefined;
        return {
          name: String(p.tool ?? ""),
          arguments: (state?.input ?? {}) as Record<string, unknown>,
        };
      });

    if (toolParts.length > 0) {
      this.messageHistory.push({ role: "assistant", content: textParts || JSON.stringify(toolParts) });
      return { content: textParts || null, thinking: null, toolCalls: toolParts };
    }

    this.messageHistory.push({ role: "assistant", content: textParts });

    const parsed = this.parseResponse(textParts);
    return parsed;
  }

  private parseResponse(text: string): ChatResult {
    const trimmed = text.trim();
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return {
          content: null,
          thinking: null,
          toolCalls: parsed.map((tc: unknown) => {
            const obj = tc as Record<string, unknown>;
            return {
              name: String(obj.name),
              arguments: (obj.arguments ?? {}) as Record<string, unknown>,
            };
          }),
        };
      }
      if (typeof parsed === "object" && parsed !== null && "name" in parsed && typeof (parsed as Record<string, unknown>).name === "string") {
        const obj = parsed as Record<string, unknown>;
        return {
          content: null,
          thinking: null,
          toolCalls: [{ name: String(obj.name), arguments: (obj.arguments ?? {}) as Record<string, unknown> }],
        };
      }
    } catch {
      // not JSON — plain text
    }
    return { content: text, thinking: null, toolCalls: [] };
  }

  async close(): Promise<void> {
    if (this.opencode) {
      this.opencode.server.close();
    }
  }
}