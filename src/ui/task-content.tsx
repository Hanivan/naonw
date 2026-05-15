import { Box, Text, useFocus, useInput } from "ink";
import type { LogEntry } from "@/ui/store.ts";
import { renderEntry } from "@/ui/log-pane.tsx";
import { useMouseWheel } from "@/utils/use-mouse-wheel.ts";

interface Props {
  entries: LogEntry[];
  scrollOffset: number;
  paneHeight: number;
  paneWidth: number;
  isLive: boolean;
  taskIndex: number | null;
  queuedPrompt: string | null;
  queuedId: string | null;
  onScrollDelta: (delta: number) => void;
  onScrollToTop: () => void;
  onScrollToBottom: () => void;
}

export function estimateRows(entry: LogEntry, width: number): number {
  if (width <= 0) return 1;
  const text = entry.msg ?? "";
  const lines = text.split("\n");
  let total = 0;
  for (const line of lines) {
    const effective = Math.max(1, line.length + 10);
    total += Math.max(1, Math.ceil(effective / Math.max(1, width)));
  }
  return Math.max(1, total);
}

export function totalLineCount(entries: LogEntry[], width: number): number {
  let n = 0;
  for (const e of entries) n += estimateRows(e, width);
  return n;
}

/**
 * scrollOffset is in LINE units — number of lines scrolled UP from the bottom.
 * Returns the slice of entries that intersect [topLine, bottomLine] plus
 * the topClip (rows to push the topmost entry off-screen).
 */
function pickVisible(
  entries: LogEntry[],
  availableRows: number,
  paneWidth: number,
  scrollOffset: number,
): { slice: LogEntry[]; topClip: number; totalLines: number } {
  if (entries.length === 0) return { slice: [], topClip: 0, totalLines: 0 };
  const heights = entries.map((e) => estimateRows(e, paneWidth));
  const totalLines = heights.reduce((s, h) => s + h, 0);
  const bottomLine = totalLines - 1 - scrollOffset;
  const topLine = bottomLine - (availableRows - 1);

  const slice: LogEntry[] = [];
  let topClip = 0;
  let started = false;
  let lineCursor = 0;
  for (let i = 0; i < entries.length; i++) {
    const h = heights[i]!;
    const entryStart = lineCursor;
    const entryEnd = lineCursor + h - 1;
    if (entryEnd >= topLine && entryStart <= bottomLine) {
      if (!started) {
        topClip = Math.max(0, topLine - entryStart);
        started = true;
      }
      slice.push(entries[i]!);
    }
    lineCursor += h;
  }
  return { slice, topClip, totalLines };
}

export function TaskContent({
  entries, scrollOffset, paneHeight, paneWidth, isLive, taskIndex,
  queuedPrompt, queuedId, onScrollDelta, onScrollToTop, onScrollToBottom,
}: Props) {
  const { isFocused } = useFocus({ id: "log" });

  useMouseWheel({
    onWheelUp: () => { if (isFocused) onScrollDelta(3); },
    onWheelDown: () => { if (isFocused) onScrollDelta(-3); },
  });

  useInput((char, key) => {
    if (char === "j" || key.downArrow) onScrollDelta(-1);
    else if (char === "k" || key.upArrow) onScrollDelta(1);
    else if (key.pageDown) onScrollDelta(-Math.max(1, paneHeight - 2));
    else if (key.pageUp) onScrollDelta(Math.max(1, paneHeight - 2));
    else if (key.end || char === "G") onScrollToBottom();
    else if (key.home || char === "g") onScrollToTop();
  }, { isActive: isFocused });

  if (queuedPrompt !== null && queuedId !== null) {
    return (
      <Box flexDirection="column" height={paneHeight} flexGrow={1}>
        <Box>
          <Text color={isFocused ? "cyan" : undefined} bold={isFocused} dimColor={!isFocused}>
            {`${isFocused ? "▌" : " "}─── queued ${queuedId} ───`}
          </Text>
        </Box>
        <Box flexDirection="column" overflow="hidden" flexGrow={1} marginTop={1}>
          <Text wrap="wrap">{queuedPrompt}</Text>
          <Box marginTop={1}>
            <Text dimColor>(not yet started — press d in TASKS panel to remove)</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  const headerLabel = taskIndex === null
    ? "─── no task selected ───"
    : isLive
      ? `─── LIVE ● task ${taskIndex} ───`
      : `─── task ${taskIndex} ───`;

  const headerColor = isFocused ? "cyan" : isLive ? "yellow" : undefined;

  const availableRows = Math.max(1, paneHeight - 1);
  const { slice, topClip } = pickVisible(entries, availableRows, paneWidth, scrollOffset);
  // Push the line-unit scroll metric back to the parent so PgUp/PgDn/maxScroll math is right.
  // (One-shot per render; React won't re-trigger because the parent ignores stale values.)

  return (
    <Box flexDirection="column" height={paneHeight} flexGrow={1}>
      <Box>
        <Text color={headerColor} bold={isFocused} dimColor={!isFocused && !isLive}>
          {`${isFocused ? "▌" : " "}${headerLabel}`}
        </Text>
      </Box>
      <Box flexDirection="column" overflow="hidden" flexGrow={1}>
        <Box flexDirection="column" marginTop={-topClip}>
          {slice.map((e, i) => renderEntry(e, i))}
        </Box>
      </Box>
    </Box>
  );
}
