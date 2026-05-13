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

function timestamp(): string {
  return `${GRAY}${new Date().toISOString().slice(11, 23)}${RESET}`;
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
  debug(msg: string): void {
    if (process.env.DEBUG) {
      console.log(`${timestamp()} ${tag(GRAY, "DEBUG")} ${DIM}${msg}${RESET}`);
    }
  },
  success(msg: string): void {
    console.log(`\n${timestamp()} ${tag(GREEN, "DONE")} ${BOLD}${msg}${RESET}`);
  },
  fail(msg: string): void {
    console.log(`\n${timestamp()} ${tag(RED, "FAIL")} ${BOLD}${msg}${RESET}`);
  },
};
