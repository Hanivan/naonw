import { Box, Text } from "ink";
import figlet from "figlet";
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

// ── Collapsed group line ───────────────────────────────────────────────────────
function CollapsedGroupLine({ count, isSelected }: { groupId: string; count: number; isSelected: boolean }) {
  const label = `↳ ${count} step${count !== 1 ? "s" : ""}`;
  return (
    <Box flexDirection="row" marginLeft={2}>
      <Text color={isSelected ? "cyan" : undefined} bold={isSelected} dimColor={!isSelected}>
        {label}
      </Text>
      {isSelected && <Text dimColor color="gray">  [ctrl+g / enter to expand]</Text>}
    </Box>
  );
}

// ── Render item types ─────────────────────────────────────────────────────────
export type RenderItem =
  | { type: "entry"; entry: LogEntry; key: number }
  | { type: "collapsed"; groupId: string; count: number }
  | { type: "group-footer"; groupId: string };

export function buildRenderItems(logs: LogEntry[], collapsedGroups: Set<string>): RenderItem[] {
  const seenGroups = new Set<string>();
  const groupCounts = new Map<string, number>();
  for (const e of logs) {
    if (e.groupId) groupCounts.set(e.groupId, (groupCounts.get(e.groupId) ?? 0) + 1);
  }

  const result: RenderItem[] = [];
  let idx = 0;
  for (let i = 0; i < logs.length; i++) {
    const entry = logs[i]!;
    const gid = entry.groupId;
    if (!gid) {
      result.push({ type: "entry", entry, key: idx++ });
      continue;
    }
    if (collapsedGroups.has(gid)) {
      if (!seenGroups.has(gid)) {
        seenGroups.add(gid);
        result.push({ type: "collapsed", groupId: gid, count: groupCounts.get(gid) ?? 0 });
        idx++;
      }
    } else {
      result.push({ type: "entry", entry, key: idx++ });
      const nextGid = logs[i + 1]?.groupId;
      if (nextGid !== gid) {
        result.push({ type: "group-footer", groupId: gid });
      }
    }
  }
  return result;
}

// ── Entry renderer ────────────────────────────────────────────────────────────
function renderEntry(entry: LogEntry, key: number) {
  if (!IS_FANCY) {
    return (
      <Box key={key} flexDirection="row">
        <Text color={OLD_COLOR[entry.level] ?? "white"} bold>{`● ${padLevel(entry.level)} `}</Text>
        <Text wrap="wrap">{entry.msg}</Text>
      </Box>
    );
  }
  if (entry.level === "BRAND") return <BrandEntry key={key} />;
  if (entry.level === "PROVIDER") return <ProviderEntry key={key} entry={entry} />;
  return <FancyEntry key={key} entry={entry} />;
}

// ── Component ─────────────────────────────────────────────────────────────────
interface LogPaneProps {
  items: RenderItem[];
  scrollTop: number;
  paneHeight: number;
  selectedGroupId: string | null;
  lastGroupId: string | null;
}

export function LogPane({ items, scrollTop, paneHeight, selectedGroupId, lastGroupId }: LogPaneProps) {
  const visible = items.slice(scrollTop, scrollTop + paneHeight);
  return (
    <Box height={paneHeight} flexDirection="column">
      {visible.map((item) => {
        if (item.type === "collapsed") {
          return (
            <CollapsedGroupLine
              key={`cg-${item.groupId}`}
              groupId={item.groupId}
              count={item.count}
              isSelected={item.groupId === selectedGroupId}
            />
          );
        }
        if (item.type === "group-footer") {
          if (item.groupId !== lastGroupId && item.groupId !== selectedGroupId) return null;
          const isSelected = item.groupId === selectedGroupId;
          return (
            <Box key={`gf-${item.groupId}`} marginLeft={2}>
              <Text color={isSelected ? "cyan" : undefined} bold={isSelected} dimColor={!isSelected}>
                {isSelected ? "[enter to collapse]" : "[ctrl+g to collapse]"}
              </Text>
            </Box>
          );
        }
        return renderEntry(item.entry, item.key);
      })}
    </Box>
  );
}
