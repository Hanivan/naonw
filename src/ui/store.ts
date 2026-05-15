import { EventEmitter } from "node:events";

function ts(): string {
  return new Date().toISOString().slice(5, 23).replace("T", " ");
}

export type LogLevel =
  | "THINK"
  | "AGENT"
  | "INFO"
  | "WARN"
  | "ERROR"
  | "TOOL"
  | "RESULT"
  | "CAPTCHA"
  | "ELEMENT"
  | "DEBUG"
  | "TOKEN"
  | "DONE"
  | "FAIL";

export type ProviderData = {
  name: string;
  model: string;
  cloud: boolean;
  keys: number;
};

export type LogEntry = {
  level: LogLevel;
  msg: string;
  timestamp: string;
  groupId?: string;
};

export type AgentStatus = "idle" | "thinking" | "tool" | "done" | "interrupted";

export type Status = {
  provider: string;
  model: string;
  agentStatus: AgentStatus;
  iteration: number;
  maxIterations: number;
  tokensIn: number;
  tokensOut: number;
  currentUrl: string;
  browserOpen: boolean;
  promptLabel: string;
  agentStartTime: number;
  supportsVision: boolean;
  supportsThinking: boolean;
};

const DEFAULT_STATUS: Status = {
  provider: "",
  model: "",
  agentStatus: "idle",
  iteration: 0,
  maxIterations: 20,
  tokensIn: 0,
  tokensOut: 0,
  currentUrl: "",
  browserOpen: false,
  promptLabel: "Task",
  agentStartTime: 0,
  supportsVision: false,
  supportsThinking: false,
};

const MAX_LOGS = 2000;

class Store extends EventEmitter {
  logs: LogEntry[] = [];
  status: Status = { ...DEFAULT_STATUS };
  providers: ProviderData[] = [];
  pushLog(entry: LogEntry): void {
    this.logs.push(entry);
    if (this.logs.length > MAX_LOGS) this.logs.splice(0, this.logs.length - MAX_LOGS);
    this.emit("log");
  }

  appendStream(chunk: string, groupId?: string): void {
    const last = this.logs[this.logs.length - 1];
    if (last && (last.level === "THINK" || last.level === "AGENT")) {
      this.logs[this.logs.length - 1] = { ...last, msg: last.msg + chunk };
    } else {
      this.logs.push({ level: "AGENT", msg: chunk, timestamp: ts(), groupId });
    }
    this.emit("log");
  }

  addProvider(p: ProviderData): void {
    this.providers = [...this.providers, p];
    this.emit("providers");
  }

  setStatus(patch: Partial<Status>): void {
    this.status = { ...this.status, ...patch };
    this.emit("status");
  }

  reset(): void {
    this.logs = [];
    this.status = { ...DEFAULT_STATUS };
    this.emit("log");
    this.emit("status");
  }
}

export const store = new Store();
