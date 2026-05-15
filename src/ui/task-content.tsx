import { Box, Text } from "ink";
import type { LogEntry } from "@/ui/store.ts";
import { renderEntry } from "@/ui/log-pane.tsx";

interface Props {
  entries: LogEntry[];
  scrollOffset: number;
  paneHeight: number;
  isLive: boolean;
  taskIndex: number | null;
  queuedPrompt: string | null;
  queuedId: string | null;
}

export function TaskContent({ entries, scrollOffset, paneHeight, isLive, taskIndex, queuedPrompt, queuedId }: Props) {
  if (queuedPrompt !== null && queuedId !== null) {
    return (
      <Box flexDirection="column" height={paneHeight} flexGrow={1}>
        <Box>
          <Text dimColor>{`─── queued ${queuedId} ───`}</Text>
        </Box>
        <Box flexDirection="column" overflow="hidden" flexGrow={1} marginTop={1}>
          <Text wrap="wrap">{queuedPrompt}</Text>
          <Box marginTop={1}>
            <Text dimColor>(not yet started — press d to remove)</Text>
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
