import { Box, Text } from "ink";

export type TaskStatus = "running" | "done" | "failed";

export interface SidebarTask {
  index: number;
  prompt: string;
  status: TaskStatus;
}

interface Props {
  tasks: SidebarTask[];
  selectedIndex: number | null;
  width: number;
}

const STATUS_ICON: Record<TaskStatus, string> = {
  running: "●",
  done: "▸",
  failed: "✗",
};

const STATUS_COLOR: Record<TaskStatus, string> = {
  running: "yellow",
  done: "green",
  failed: "red",
};

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}

export function TaskSidebar({ tasks, selectedIndex, width }: Props) {
  // width includes 1-col left padding. Reserve: 1 (icon) + 1 (space) + 2 (index "N ") = 4 cols of chrome.
  const promptWidth = Math.max(4, width - 5);
  return (
    <Box flexDirection="column" width={width} paddingX={1}>
      <Box marginBottom={1}>
        <Text dimColor>TASKS</Text>
      </Box>
      {tasks.length === 0 ? (
        <Text dimColor>(no tasks yet)</Text>
      ) : (
        tasks.map((t) => {
          const isSelected = t.index === selectedIndex;
          return (
            <Box key={t.index} flexDirection="row">
              <Text color={STATUS_COLOR[t.status]} bold={isSelected}>
                {STATUS_ICON[t.status]}
              </Text>
              <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                {` ${t.index} ${truncate(t.prompt, promptWidth)}`}
              </Text>
            </Box>
          );
        })
      )}
    </Box>
  );
}
