import { Box, Text, useFocus, useInput } from "ink";
import type { QueuedMessage } from "@/ui/store.ts";
import { store } from "@/ui/store.ts";

export type TaskStatus = "running" | "done" | "failed";

export interface SidebarTask {
  index: number;
  prompt: string;
  status: TaskStatus;
}

interface Props {
  tasks: SidebarTask[];
  queued: QueuedMessage[];
  selectedIndex: number | null;
  selectedQueueId: string | null;
  width: number;
  onSelectTask: (index: number) => void;
  onSelectQueue: (id: string) => void;
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

export function TaskSidebar({
  tasks, queued, selectedIndex, selectedQueueId, width,
  onSelectTask, onSelectQueue,
}: Props) {
  const { isFocused } = useFocus({ id: "tasks" });

  type Slot = { kind: "task"; index: number } | { kind: "queue"; id: string };
  const slots: Slot[] = [
    ...tasks.map((t): Slot => ({ kind: "task", index: t.index })),
    ...queued.map((q): Slot => ({ kind: "queue", id: q.id })),
  ];

  useInput((char, key) => {
    if (slots.length === 0) return;

    function pos(): number {
      if (selectedQueueId !== null) {
        const i = slots.findIndex((s) => s.kind === "queue" && s.id === selectedQueueId);
        if (i >= 0) return i;
      }
      if (selectedIndex !== null) {
        const i = slots.findIndex((s) => s.kind === "task" && s.index === selectedIndex);
        if (i >= 0) return i;
      }
      return -1;
    }

    function apply(slot: Slot) {
      if (slot.kind === "task") onSelectTask(slot.index);
      else onSelectQueue(slot.id);
    }

    if (char === "j" || key.downArrow) {
      const p = pos();
      apply(slots[((p < 0 ? -1 : p) + 1 + slots.length) % slots.length]!);
      return;
    }
    if (char === "k" || key.upArrow) {
      const p = pos();
      apply(slots[((p < 0 ? slots.length : p) - 1 + slots.length) % slots.length]!);
      return;
    }
    if ((char === "d" || key.delete) && selectedQueueId !== null) {
      const id = selectedQueueId;
      const removedIdx = slots.findIndex((s) => s.kind === "queue" && s.id === id);
      store.removeQueued(id);
      const next = slots.filter((_s, i) => i !== removedIdx);
      if (next.length > 0) apply(next[Math.min(removedIdx, next.length - 1)]!);
      return;
    }
  }, { isActive: isFocused });

  const taskDigits = tasks.length === 0 ? 1 : String(tasks.length).length;
  const queueIdLen = queued.reduce((m, q) => Math.max(m, q.id.length), 0);
  const indexDigits = Math.max(taskDigits, queueIdLen);
  const promptWidth = Math.max(4, width - 5 - indexDigits);

  return (
    <Box flexDirection="column" width={width} paddingX={1}>
      <Box marginBottom={1}>
        <Text color={isFocused ? "cyan" : undefined} bold={isFocused} dimColor={!isFocused}>
          {isFocused ? "▌TASKS" : " TASKS"}
        </Text>
      </Box>
      {tasks.length === 0 && queued.length === 0 ? (
        <Text dimColor>(no tasks yet)</Text>
      ) : (
        <>
          {tasks.map((t) => {
            const isSelected = t.index === selectedIndex;
            return (
              <Box key={`t-${t.index}`} flexDirection="row">
                <Text color={STATUS_COLOR[t.status]} bold={isSelected}>
                  {STATUS_ICON[t.status]}
                </Text>
                <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                  {` ${t.index} ${truncate(t.prompt, promptWidth)}`}
                </Text>
              </Box>
            );
          })}
          {queued.map((q) => {
            const isSelected = q.id === selectedQueueId;
            return (
              <Box key={`q-${q.id}`} flexDirection="row">
                <Text color="gray" bold={isSelected}>◌</Text>
                <Text color={isSelected ? "cyan" : "gray"} bold={isSelected} dimColor={!isSelected}>
                  {` ${q.id} ${truncate(q.prompt, promptWidth)}`}
                </Text>
              </Box>
            );
          })}
        </>
      )}
    </Box>
  );
}
