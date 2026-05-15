import { Box, Text } from "ink";
import type { LogEntry } from "@/ui/store.ts";

const IS_FANCY = process.env.LOG_TYPE !== "old";

// ── Old mode ──────────────────────────────────────────────────────────────────
const OLD_COLOR: Record<string, string> = {
  TOOL: "green", RESULT: "green", DONE: "green",
  INFO: "gray", DEBUG: "gray", TOKEN: "gray",
  AGENT: "yellow", WARN: "yellow",
  THINK: "magenta", CAPTCHA: "magenta",
  ERROR: "red", FAIL: "red", ELEMENT: "cyan",
};

function padLevel(level: string): string { return level.padEnd(7); }

// ── Fancy mode ────────────────────────────────────────────────────────────────
const FANCY_SYMBOL: Record<string, string> = {
  TOOL: "▶", RESULT: "└", DONE: "✓ ", FAIL: "✗", ERROR: "✗",
  AGENT: "│", THINK: "│",
  WARN: "⚠", CAPTCHA: "⚡",
  INFO: "·", DEBUG: "·", TOKEN: "·",
  ELEMENT: "◈",
};

const FANCY_COLOR: Record<string, string> = {
  TOOL: "cyan", RESULT: "green", DONE: "green",
  FAIL: "red", ERROR: "red",
  AGENT: "yellow", THINK: "magenta",
  WARN: "yellow", CAPTCHA: "magenta",
  INFO: "gray", DEBUG: "gray", TOKEN: "gray",
  ELEMENT: "cyan",
};

const RESULT_INDENT = new Set(["RESULT"]);
const DIM_LEVELS   = new Set(["INFO", "DEBUG", "TOKEN", "ELEMENT"]);
const BOLD_LEVELS  = new Set(["DONE", "FAIL", "ERROR", "CAPTCHA"]);

function fancyMsg(entry: LogEntry): string {
  if (entry.level === "TOOL") {
    const jsonIdx = entry.msg.indexOf(" {");
    return jsonIdx >= 0 ? entry.msg.slice(0, jsonIdx) : entry.msg;
  }
  if (entry.level === "AGENT" || entry.level === "THINK") {
    const lines = entry.msg.split("\n").filter((l) => l.trim());
    const first = lines[0] ?? entry.msg;
    return lines.length > 1 ? `${first} …` : first;
  }
  return entry.msg;
}

function FancyEntry({ entry }: { entry: LogEntry }) {
  const color  = FANCY_COLOR[entry.level]  ?? "white";
  const symbol = FANCY_SYMBOL[entry.level] ?? "·";
  const indent = RESULT_INDENT.has(entry.level) ? 2 : 0;
  const dim    = DIM_LEVELS.has(entry.level);
  const bold   = BOLD_LEVELS.has(entry.level);
  return (
    <Box flexDirection="row" marginLeft={indent}>
      <Text color={color} bold={bold}>{symbol} </Text>
      <Text wrap="wrap" bold={bold} dimColor={dim}>{fancyMsg(entry)}</Text>
    </Box>
  );
}

// ── Entry renderer ────────────────────────────────────────────────────────────
export function renderEntry(entry: LogEntry, key: number) {
  if (!IS_FANCY) {
    return (
      <Box key={key} flexDirection="row">
        <Text color={OLD_COLOR[entry.level] ?? "white"} bold>{`● ${padLevel(entry.level)} `}</Text>
        <Text wrap="wrap">{entry.msg}</Text>
      </Box>
    );
  }
  return <FancyEntry key={key} entry={entry} />;
}
