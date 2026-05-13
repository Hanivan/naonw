export interface ToolCallResult {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatResult {
  content: string | null;
  thinking: string | null;
  toolCalls: ToolCallResult[];
  streamed?: boolean;
}

export interface AIClient {
  addSystem(content: string): void;
  addUser(content: string): void;
  addAssistant(content: string): void;
  addToolResult(toolName: string, content: string): void;
  addImage(base64: string): void;
  chat(tools: ToolDefinition[]): Promise<ChatResult>;
  clearHistory(): void;
  readonly provider: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    required?: string[];
    properties: Record<string, { type: string; description?: string; enum?: string[]; items?: { type: string } }>;
  };
}
