const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const MAGENTA = "\x1b[35m";
const BLUE = "\x1b[34m";
const GRAY = "\x1b[90m";
const WHITE = "\x1b[97m";

export function timestamp(): string {
  return `${GRAY}${new Date().toISOString().slice(5, 23).replace("T", " ")}${RESET}`;
}

function tag(color: string, label: string): string {
  return `${color}${BOLD}[${label}]${RESET}`;
}

export const log = {
  info(msg: string): void {
    console.log(`${timestamp()} ${tag(CYAN, "INFO")} ${msg}`);
  },
  tool(name: string, args: Record<string, unknown>): void {
    const argsStr = Object.keys(args).length ? ` ${DIM}${JSON.stringify(args)}${RESET}` : "";
    console.log(`${timestamp()} ${tag(YELLOW, "TOOL")} ${BOLD}${name}${RESET}${argsStr}`);
  },
  result(msg: string): void {
    console.log(`${timestamp()} ${tag(GREEN, "RESULT")} ${msg}`);
  },
  warn(msg: string): void {
    console.log(`${timestamp()} ${tag(YELLOW, "WARN")} ${msg}`);
  },
  error(msg: string): void {
    console.error(`${timestamp()} ${tag(RED, "ERROR")} ${msg}`);
  },
  captcha(msg: string): void {
    console.log(`\n${timestamp()} ${tag(MAGENTA, "CAPTCHA")} ${BOLD}${msg}${RESET}\n`);
  },
  agent(msg: string): void {
    console.log(`${timestamp()} ${tag(BLUE, "AGENT")} ${msg}`);
  },
  think(msg: string): void {
    console.log(`${timestamp()} ${tag(MAGENTA, "THINK")} ${DIM}${msg}${RESET}`);
  },
  element(detail: string, html: string): void {
    console.log(`${timestamp()} ${tag(CYAN, "ELEMENT")} ${DIM}${detail}${RESET}\n           ${GRAY}${html}${RESET}`);
  },
  debug(msg: string): void {
    if (process.env.DEBUG) {
      console.log(`${timestamp()} ${tag(GRAY, "DEBUG")} ${DIM}${msg}${RESET}`);
    }
  },
  _tokenIn: 0,
  _tokenOut: 0,
  token(pin: number, pout: number): void {
    this._tokenIn += pin;
    this._tokenOut += pout;
  },
  tokenTotal(): void {
    const total = this._tokenIn + this._tokenOut;
    console.log(`${timestamp()} ${tag(WHITE, "TOKEN")} ${DIM}${this._tokenIn} in → ${this._tokenOut} out${RESET} ${GRAY}(${total} total)${RESET}`);
    this._tokenIn = 0;
    this._tokenOut = 0;
  },
  success(msg: string): void {
    console.log(`\n${timestamp()} ${tag(GREEN, "DONE")} ${BOLD}${msg}${RESET}`);
  },
  fail(msg: string): void {
    console.log(`\n${timestamp()} ${tag(RED, "FAIL")} ${BOLD}${msg}${RESET}`);
  },
};
