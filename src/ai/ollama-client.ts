import type {
  AIClient,
  ChatResult,
  ToolCallResult,
  ToolDefinition,
} from "@/ai/client.ts";
import { Ollama, type Message, type Tool } from "ollama";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GRAY = "\x1b[90m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const BLUE = "\x1b[34m";

function ts(): string {
  return `${GRAY}${new Date().toISOString().slice(11, 23)}${RESET}`;
}

export interface OllamaClientConfig {
  apiKey?: string;
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

export class OllamaClient implements AIClient {
  readonly provider = "ollama";
  private ollama: Ollama;
  private model: string;
  private supportsVision: boolean;
  private thinking: boolean;
  private messages: OllamaMessage[] = [];
  private cachedTools: Tool[] | null = null;
  private cachedToolsSource: ToolDefinition[] | null = null;

  constructor(config: OllamaClientConfig) {
    const host = config.host ?? "http://localhost:11434";
    this.ollama = new Ollama({
      host,
      ...(config.apiKey
        ? { headers: { Authorization: `Bearer ${config.apiKey}` } }
        : {}),
    });
    this.model = config.model ?? "qwen3-vl:4b-instruct";
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
      process.stdout.write(
        `\n${ts()} ${GRAY}[DEBUG] → ${this.model} (${this.messages.length} msgs)\n${dump}\n  tools: [${toolNames}]${RESET}\n\n`,
      );
    }

    if (!this.thinking) {
      const response = await this.ollama.chat({
        model: this.model,
        messages: this.messages,
        tools: this.cachedTools!,
        think: this.thinking,
      });
      if (process.env.DEBUG) {
        process.stdout.write(`\n${ts()} ${GRAY}[DEBUG] response (non-stream): ${JSON.stringify(response.message)}${RESET}\n`);
      }
      const toolCalls: ToolCallResult[] = (response.message?.tool_calls ?? []).map((tc) => ({
        name: tc.function.name,
        arguments: tc.function.arguments as Record<string, unknown>,
      }));
      const content = response.message?.content ?? null;
      const thinking = (response.message as { thinking?: string }).thinking ?? null;
      if (thinking && this.thinking) process.stdout.write(`${ts()} ${MAGENTA}${BOLD}[THINK]${RESET} ${DIM}${thinking}${RESET}\n`);
      if (content) process.stdout.write(`${ts()} ${BLUE}${BOLD}[AGENT]${RESET} ${CYAN}AI:${RESET} ${content}\n`);
      return { content, thinking, toolCalls, streamed: true };
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
    let printedThinkPrefix = false;
    let printedContentPrefix = false;
    let inThinkTag = false;
    let firstChunk = true;

    for await (const chunk of stream) {
      if (firstChunk) {
        firstChunk = false;
      }
      lastMessage = chunk.message;
      const thinking = (chunk.message as { thinking?: string }).thinking ?? "";
      const content = chunk.message.content ?? "";

      if (thinking) {
        fullThinking += thinking;
        if (this.thinking) {
          if (!printedThinkPrefix) {
            process.stdout.write(`${ts()} ${MAGENTA}${BOLD}[THINK]${RESET} ${DIM}`);
            printedThinkPrefix = true;
          }
          process.stdout.write(thinking);
        }
      }

      if (content) {
        fullContent += content;

        // parse visible text across chunk boundaries
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
          if (printedThinkPrefix && !printedContentPrefix) {
            process.stdout.write(`${RESET}\n`);
          }
          if (!printedContentPrefix) {
            process.stdout.write(`${ts()} ${BLUE}${BOLD}[AGENT]${RESET} ${CYAN}AI:${RESET} `);
            printedContentPrefix = true;
          }
          process.stdout.write(visible);
        }
      }
    }

    if (printedThinkPrefix || printedContentPrefix) {
      process.stdout.write(`${RESET}\n`);
    }

    fullContent = fullContent.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    if (process.env.DEBUG) {
      process.stdout.write(`\n${ts()} ${GRAY}[DEBUG] lastMessage: ${JSON.stringify(lastMessage)}${RESET}\n`);
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
    };
  }
}
