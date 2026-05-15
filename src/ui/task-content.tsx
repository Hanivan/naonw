import { Box, Text } from "ink";
import type { LogEntry } from "@/ui/store.ts";
import { renderEntry } from "@/ui/log-pane.tsx";

interface Props {
  entries: LogEntry[];
  scrollOffset: number;
  paneHeight: number;
  isLive: boolean;
  taskIndex: number | null;
}

export function TaskContent({ entries, scrollOffset, paneHeight, isLive, taskIndex }: Props) {
  const headerLabel = taskIndex === null
    ? "─── no task selected ───"
    : isLive
      ? `─── LIVE ● task ${taskIndex} ───`
      : `─── task ${taskIndex} ───`;
  return (
    <Box flexDirection="column" height={paneHeight} flexGrow={1}>
      <Box>
        <Text color={isLive ? "yellow" : undefined} dimColor={!isLive}>
          {headerLabel}
        </Text>
      </Box>
      <Box flexDirection="column" overflow="hidden" flexGrow={1}>
        <Box flexDirection="column" marginTop={-scrollOffset}>
          {entries.map((e, i) => renderEntry(e, i))}
        </Box>
      </Box>
    </Box>
  );
}
