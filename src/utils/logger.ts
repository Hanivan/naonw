import { store, type ProviderData } from "@/ui/store.ts";

function ts(): string {
  return new Date().toISOString().slice(5, 23).replace("T", " ");
}

export function timestamp(): string {
  return ts();
}

export const log = {
  brand(msg: string): void {
    store.pushLog({ level: "BRAND", msg, timestamp: ts() });
  },
  provider(name: string, model: string, cloud: boolean, keys: number): void {
    const data: ProviderData = { name, model, cloud, keys };
    store.pushLog({ level: "PROVIDER", msg: `${name} ${model}`, timestamp: ts(), data });
  },
  info(msg: string): void {
    store.pushLog({ level: "INFO", msg, timestamp: ts() });
  },
  tool(name: string, args: Record<string, unknown>, provider?: string): void {
    const argsStr = Object.keys(args).length ? ` ${JSON.stringify(args)}` : "";
    const provStr = provider ? ` @${provider}` : "";
    store.pushLog({ level: "TOOL", msg: `${name}${provStr}${argsStr}`, timestamp: ts() });
  },
  result(msg: string): void {
    store.pushLog({ level: "RESULT", msg, timestamp: ts() });
  },
  warn(msg: string): void {
    store.pushLog({ level: "WARN", msg, timestamp: ts() });
  },
  error(msg: string): void {
    store.pushLog({ level: "ERROR", msg, timestamp: ts() });
  },
  captcha(msg: string): void {
    store.pushLog({ level: "CAPTCHA", msg, timestamp: ts() });
  },
  agent(msg: string): void {
    store.pushLog({ level: "AGENT", msg, timestamp: ts() });
  },
  think(msg: string): void {
    store.pushLog({ level: "THINK", msg, timestamp: ts() });
  },
  element(detail: string, html: string): void {
    store.pushLog({ level: "ELEMENT", msg: `${detail}  ${html}`, timestamp: ts() });
  },
  debug(msg: string): void {
    if (process.env.DEBUG) {
      store.pushLog({ level: "DEBUG", msg, timestamp: ts() });
    }
  },
  stream(chunk: string): void {
    store.appendStream(chunk);
  },
  token(pin: number, pout: number): void {
    store.setStatus({
      tokensIn: store.status.tokensIn + pin,
      tokensOut: store.status.tokensOut + pout,
    });
  },
  tokenTotal(): void {
    const { tokensIn, tokensOut } = store.status;
    store.pushLog({
      level: "TOKEN",
      msg: `${tokensIn} in → ${tokensOut} out (${tokensIn + tokensOut} total)`,
      timestamp: ts(),
    });
  },
  success(msg: string): void {
    store.pushLog({ level: "DONE", msg, timestamp: ts() });
  },
  fail(msg: string): void {
    store.pushLog({ level: "FAIL", msg, timestamp: ts() });
  },
};
