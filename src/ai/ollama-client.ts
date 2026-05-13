import type { ChatResult, ToolCallResult, ToolDefinition } from "@/ai/client.ts";
import { DirectProvider } from "@/ai/provider.ts";
import { Ollama, type Message, type Tool } from "ollama";
import { log } from "@/utils/logger.ts";


export interface OllamaClientConfig {
  apiKeys?: string[];
  host?: string;
  model?: string;
  supportsVision?: boolean;
  thinking?: boolean;
}

type OllamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_name?: string;
  images?: string[];
};

export class OllamaClient extends DirectProvider {
  readonly provider = "ollama";
  private ollama: Ollama;
  private host: string;
  private readonly model: string;
  private supportsVision: boolean;
  private thinking: boolean;
  private messages: OllamaMessage[] = [];
  private cachedTools: Tool[] | null = null;
  private cachedToolsSource: ToolDefinition[] | null = null;

  constructor(config: OllamaClientConfig) {
    super(config.apiKeys?.filter(Boolean) ?? []);
    this.host = (config.host ?? "http://localhost:11434").replace(/\/$/, "");
    this.ollama = new Ollama({
      host: this.host,
      ...(this.apiKeys.length
        ? { headers: { Authorization: `Bearer ${this.apiKeys[0]}` } }
        : {}),
    });
    this.model = config.model ?? "minimax-m2.5";
    this.supportsVision = config.supportsVision ?? false;
    this.thinking = config.thinking ?? false;
  }

  addSystem(content: string): void {
    this.messages.push({ role: "system", content });
  }

  addUser(content: string): void {
    this.messages.push({ role: "user", content });
  }

  addAssistant(content: string): void {
    this.messages.push({ role: "assistant", content });
  }

  addToolResult(toolName: string, content: string): void {
    this.messages.push({ role: "tool", content, tool_name: toolName });
  }

  addImage(base64: string): void {
    if (!this.supportsVision) return;
    this.messages.push({
      role: "user",
      content: "Screenshot of current page:",
      images: [base64],
    });
  }

  clearHistory(): void {
    this.messages = [];
  }

  async chat(tools: ToolDefinition[]): Promise<ChatResult> {
    if (this.apiKeys.length) {
      const entry = this.nextKey();
      if (!entry) throw new Error("All Ollama API keys are rate-limited");
      this.ollama = new Ollama({
        host: this.host,
        headers: { Authorization: `Bearer ${entry.key}` },
      });
    }
    if (tools !== this.cachedToolsSource) {
      this.cachedToolsSource = tools;
      this.cachedTools = tools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    if (process.env.DEBUG) {
      const dump = this.messages
        .map((m, i) => {
          const role = m.tool_name ? `${m.role}(${m.tool_name})` : m.role;
          const img = m.images?.length ? ` [+${m.images.length} img]` : "";
          const body = m.content.length > 400 ? `${m.content.slice(0, 400)}…` : m.content;
          return `  #${i} [${role}]${img} ${body}`;
        })
        .join("\n");
      const toolNames = this.cachedTools?.map((t) => t.function.name).join(", ") ?? "none";
      log.debug(`→ ${this.model} (${this.messages.length} msgs)\n${dump}\n  tools: [${toolNames}]`);
    }

    if (!this.thinking) {
      let response;
      try {
        response = await this.ollama.chat({
          model: this.model,
          messages: this.messages,
          tools: this.cachedTools!,
          think: this.thinking,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("429") || msg.includes("rate") || msg.includes("limit")) {
          if (this.apiKeys.length) {
            const entry = this.nextKey();
            if (entry) {
              this.lockKey(entry.index);
              this.ollama = new Ollama({ host: this.host, headers: { Authorization: `Bearer ${entry.key}` } });
              response = await this.ollama.chat({
                model: this.model,
                messages: this.messages,
                tools: this.cachedTools!,
                think: this.thinking,
              });
            } else {
              throw new Error("All Ollama API keys are rate-limited");
            }
          } else {
            throw err;
          }
        } else {
          throw err;
        }
      }
      if (process.env.DEBUG) {
        log.debug(`response (non-stream): ${JSON.stringify(response.message)}`);
      }
      if (response.prompt_eval_count !== undefined || response.eval_count !== undefined) {
        log.token(response.prompt_eval_count ?? 0, response.eval_count ?? 0);
      }
      const toolCalls: ToolCallResult[] = (response.message?.tool_calls ?? []).map((tc) => ({
        name: tc.function.name,
        arguments: tc.function.arguments as Record<string, unknown>,
      }));
      const content = response.message?.content ?? null;
      const thinking = (response.message as { thinking?: string }).thinking ?? null;
      if (thinking && this.thinking) log.think(thinking);
      if (content) log.agent(`AI: ${content}`);
      return { content, thinking, toolCalls, streamed: true, provider: "ollama" };
    }

    const stream = await this.ollama.chat({
      model: this.model,
      messages: this.messages,
      tools: this.cachedTools!,
      think: this.thinking,
      stream: true,
    });

    let fullContent = "";
    let fullThinking = "";
    let lastMessage: Message | null = null;
    let lastPromptEval = 0;
    let lastEvalCount = 0;
    let inThinkTag = false;
    let thinkingStarted = false;
    let contentStarted = false;

    for await (const chunk of stream) {
      lastMessage = chunk.message;
      if (chunk.prompt_eval_count) lastPromptEval = chunk.prompt_eval_count;
      if (chunk.eval_count) lastEvalCount = chunk.eval_count;
      const thinking = (chunk.message as { thinking?: string }).thinking ?? "";
      const content = chunk.message.content ?? "";

      if (thinking) {
        fullThinking += thinking;
        if (this.thinking) {
          if (!thinkingStarted) {
            log.think("");
            thinkingStarted = true;
          }
          log.stream(thinking);
        }
      }

      if (content) {
        fullContent += content;

        let visible = "";
        let buf = content;
        while (buf.length > 0) {
          if (inThinkTag) {
            const end = buf.indexOf("</think>");
            if (end === -1) { buf = ""; break; }
            inThinkTag = false;
            buf = buf.slice(end + 8);
          } else {
            const start = buf.indexOf("<think>");
            if (start === -1) { visible += buf; break; }
            visible += buf.slice(0, start);
            inThinkTag = true;
            buf = buf.slice(start + 7);
          }
        }

        if (visible) {
          if (!contentStarted) {
            log.agent("AI: ");
            contentStarted = true;
          }
          log.stream(visible);
        }
      }
    }

    if (lastPromptEval || lastEvalCount) {
      log.token(lastPromptEval, lastEvalCount);
    }

    fullContent = fullContent.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    if (process.env.DEBUG) {
      log.debug(`lastMessage: ${JSON.stringify(lastMessage)}`);
    }

    const toolCalls: ToolCallResult[] = (
      (
        lastMessage as Message & {
          tool_calls?: {
            function: { name: string; arguments: Record<string, unknown> };
          }[];
        }
      )?.tool_calls ?? []
    ).map((tc) => ({
      name: tc.function.name,
      arguments: tc.function.arguments as Record<string, unknown>,
    }));

    return {
      content: fullContent || null,
      thinking: fullThinking || null,
      toolCalls,
      streamed: true,
      provider: "ollama",
    };
  }
}
