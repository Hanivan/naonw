import { Box, Text } from "ink";
import figlet from "figlet";
import { ScrollView, type ScrollViewRef } from "ink-scroll-view";
import type { LogEntry, ProviderData } from "@/ui/store.ts";

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
  BRAND: "◆",
  TOOL: "▶", RESULT: "└", DONE: "✓ ", FAIL: "✗", ERROR: "✗",
  AGENT: "│", THINK: "│",
  WARN: "!", CAPTCHA: "⚡",
  INFO: "·", DEBUG: "·", TOKEN: "·",
  ELEMENT: "◈",
};

const FANCY_COLOR: Record<string, string> = {
  BRAND: "blueBright",
  TOOL: "cyan", RESULT: "green", DONE: "green",
  FAIL: "red", ERROR: "red",
  AGENT: "yellow", THINK: "magenta",
  WARN: "yellow", CAPTCHA: "magenta",
  INFO: "gray", DEBUG: "gray", TOKEN: "gray",
  ELEMENT: "cyan",
};

const RESULT_INDENT = new Set(["RESULT"]);
const DIM_LEVELS   = new Set(["INFO", "DEBUG", "TOKEN", "ELEMENT"]);
const BOLD_LEVELS  = new Set(["BRAND", "DONE", "FAIL", "ERROR", "CAPTCHA"]);

function fancyMsg(entry: LogEntry): string {
  if (entry.level === "TOOL") return entry.msg.split(" ")[0] ?? entry.msg;
  if (entry.level === "AGENT" || entry.level === "THINK") {
    const lines = entry.msg.split("\n").filter((l) => l.trim());
    const first = lines[0] ?? entry.msg;
    return lines.length > 1 ? `${first} …` : first;
  }
  return entry.msg;
}

const BRAND_ASCII = figlet.textSync("puppeteer-ai", { font: "Slant" });

function BrandEntry() {
  return (
    <Box marginBottom={1}>
      <Text color="blueBright">{BRAND_ASCII}</Text>
    </Box>
  );
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

function ProviderEntry({ entry }: { entry: LogEntry }) {
  const d = entry.data as ProviderData | undefined;
  if (!d) return <FancyEntry entry={entry} />;
  const name     = d.name.padEnd(10, " ");
  const keyLabel = d.keys === 1 ? "1 key" : `${d.keys} keys`;
  return (
    <Box flexDirection="row" marginLeft={2}>
      <Text color="cyan">{name}</Text>
      <Text color="gray" dimColor>› </Text>
      <Text color="white">{d.model}</Text>
      {d.cloud && <Text color="yellow" dimColor>  cloud</Text>}
      <Text color="gray" dimColor>  {keyLabel}</Text>
    </Box>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
interface LogPaneProps {
  logs: LogEntry[];
  paneHeight: number;
  scrollRef: React.RefObject<ScrollViewRef | null>;
}

export function LogPane({ logs, paneHeight, scrollRef }: LogPaneProps) {
  return (
    <Box height={paneHeight} flexDirection="column">
      <ScrollView ref={scrollRef}>
        {logs.map((entry, idx) =>
          IS_FANCY ? (
            entry.level === "BRAND"
              ? <BrandEntry key={idx} />
              : entry.level === "PROVIDER"
              ? <ProviderEntry key={idx} entry={entry} />
              : <FancyEntry key={idx} entry={entry} />
          ) : (
            <Box key={idx} flexDirection="row">
              <Text color={OLD_COLOR[entry.level] ?? "white"} bold>{`● ${padLevel(entry.level)} `}</Text>
              <Text wrap="wrap">{entry.msg}</Text>
            </Box>
          )
        )}
      </ScrollView>
    </Box>
  );
}
