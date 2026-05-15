import { Box, useInput, useFocus } from "ink";
import { useRef, useEffect, forwardRef, useImperativeHandle, useState, useMemo } from "react";
import { TaskSidebar } from "@/ui/task-sidebar.tsx";
import { TaskContent } from "@/ui/task-content.tsx";
import { useMouseWheel } from "@/utils/use-mouse-wheel.ts";
import type { LogEntry, QueuedMessage } from "@/ui/store.ts";
import { store } from "@/ui/store.ts";

const SIDEBAR_WIDTH = 22;

export interface LogPanelRef {
  scrollToBottom: () => void;
}

interface LogPanelProps {
  logs: LogEntry[];
  paneHeight: number;
  queued: QueuedMessage[];
}

type TaskInfo = {
  groupId: string;
  index: number;
  prompt: string;
  status: "running" | "done" | "failed";
  entries: LogEntry[];
};

function deriveTasks(logs: LogEntry[]): TaskInfo[] {
  const result: TaskInfo[] = [];
  let current: TaskInfo | null = null;
  for (const e of logs) {
    if (e.level === "AGENT") {
      if (current) result.push(current);
      const firstLine = e.msg.split("\n")[0] ?? e.msg;
      current = {
        groupId: e.groupId ?? `agent-${result.length}`,
        index: result.length + 1,
        prompt: firstLine,
        status: "running",
        entries: [e],
      };
      continue;
    }
    if (current) {
      current.entries.push(e);
      if (e.level === "DONE") current.status = "done";
      else if (e.level === "FAIL") current.status = "failed";
    }
  }
  if (current) result.push(current);
  return result;
}

export const LogPanel = forwardRef<LogPanelRef, LogPanelProps>(function LogPanel(
  { logs, paneHeight, queued },
  ref,
) {
  const { isFocused } = useFocus({ id: "log" });
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const atBottomRef = useRef(true);
  const prevLastIndexRef = useRef<number | null>(null);
  const prevLiveIndexRef = useRef<number | null>(null);

  const tasks = useMemo<TaskInfo[]>(() => deriveTasks(logs), [logs]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;

  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const queuedRef = useRef(queued);
  queuedRef.current = queued;
  const selectedQueueIdRef = useRef(selectedQueueId);
  selectedQueueIdRef.current = selectedQueueId;
  const lastIndex = tasks.length === 0 ? null : tasks[tasks.length - 1]!.index;
  const liveIndex = tasks.length > 0 && tasks[tasks.length - 1]!.status === "running"
    ? tasks[tasks.length - 1]!.index
    : null;

  // Initial select + auto-switch when on previous LIVE
  useEffect(() => {
    if (selectedIndex === null && selectedQueueId === null && lastIndex !== null) {
      setSelectedIndex(lastIndex);
      setSelectedQueueId(null);
      atBottomRef.current = true;
      setScrollOffset(0);
    } else if (lastIndex !== null && lastIndex !== prevLastIndexRef.current) {
      // A new task was added. Follow if user was on the previously-LIVE task.
      if (selectedIndex === prevLiveIndexRef.current) {
        setSelectedIndex(lastIndex);
        setSelectedQueueId(null);
        atBottomRef.current = true;
        setScrollOffset(0);
      }
    }
    prevLastIndexRef.current = lastIndex;
    // Only remember non-null liveIndex so prevLive points at the LAST task to ever be LIVE.
    if (liveIndex !== null) prevLiveIndexRef.current = liveIndex;
  }, [lastIndex, liveIndex, selectedIndex, selectedQueueId]);

  const selectedTask = useMemo(
    () => (selectedIndex === null ? null : tasks.find((t) => t.index === selectedIndex) ?? null),
    [tasks, selectedIndex],
  );
  const selectedEntries = selectedTask?.entries ?? [];
  const isLive = selectedTask !== null && selectedTask.index === liveIndex;

  const queuedPrompt = useMemo(
    () => (selectedQueueId === null ? null : queued.find((q) => q.id === selectedQueueId)?.prompt ?? null),
    [queued, selectedQueueId],
  );

  // Auto-scroll: when new entries arrive on the LIVE task and user is pinned, reset offset.
  useEffect(() => {
    if (isLive && atBottomRef.current) {
      setScrollOffset(0);
    }
  }, [isLive, selectedEntries.length]);

  useImperativeHandle(ref, () => ({
    scrollToBottom() {
      atBottomRef.current = true;
      setScrollOffset(0);
    },
  }), []);

  // Generous max — we don't know exact rendered height. Cap at entries.length * 5.
  const maxScroll = Math.max(0, selectedEntries.length * 5 - paneHeight);

  useMouseWheel({
    onWheelUp: () => {
      if (!isFocusedRef.current) return;
      atBottomRef.current = false;
      setScrollOffset((p) => Math.min(maxScroll, p + 3));
    },
    onWheelDown: () => {
      if (!isFocusedRef.current) return;
      setScrollOffset((p) => {
        const n = Math.max(0, p - 3);
        if (n === 0) atBottomRef.current = true;
        return n;
      });
    },
  });

  useInput((char, key) => {
    if (!isFocusedRef.current) return;

    const curTasks = tasksRef.current;
    const curQueued = queuedRef.current;
    const curSelectedIndex = selectedIndexRef.current;
    const curSelectedQueueId = selectedQueueIdRef.current;

    // Combined sequence: [task1, task2, ..., q1, q2, ...]
    type Slot = { kind: "task"; index: number } | { kind: "queue"; id: string };
    const slots: Slot[] = [
      ...curTasks.map((t): Slot => ({ kind: "task", index: t.index })),
      ...curQueued.map((q): Slot => ({ kind: "queue", id: q.id })),
    ];

    function findCurrentPos(): number {
      if (curSelectedQueueId !== null) {
        const i = slots.findIndex((s) => s.kind === "queue" && s.id === curSelectedQueueId);
        if (i >= 0) return i;
      }
      if (curSelectedIndex !== null) {
        const i = slots.findIndex((s) => s.kind === "task" && s.index === curSelectedIndex);
        if (i >= 0) return i;
      }
      return -1;
    }

    function applySlot(slot: Slot): void {
      atBottomRef.current = true;
      setScrollOffset(0);
      if (slot.kind === "task") {
        setSelectedIndex(slot.index);
        setSelectedQueueId(null);
      } else {
        setSelectedIndex(null);
        setSelectedQueueId(slot.id);
      }
    }

    if (char === "j" && slots.length > 0) {
      const pos = findCurrentPos();
      const next = slots[((pos < 0 ? -1 : pos) + 1 + slots.length) % slots.length]!;
      applySlot(next);
      return;
    }
    if (char === "k" && slots.length > 0) {
      const pos = findCurrentPos();
      const prev = slots[((pos < 0 ? slots.length : pos) - 1 + slots.length) % slots.length]!;
      applySlot(prev);
      return;
    }
    if ((char === "d" || key.delete) && curSelectedQueueId !== null) {
      const removedIdx = slots.findIndex((s) => s.kind === "queue" && s.id === curSelectedQueueId);
      store.removeQueued(curSelectedQueueId);
      const nextSlots = slots.filter((_s, i) => i !== removedIdx);
      if (nextSlots.length === 0) {
        setSelectedIndex(null);
        setSelectedQueueId(null);
      } else {
        const target = nextSlots[Math.min(removedIdx, nextSlots.length - 1)]!;
        applySlot(target);
      }
      return;
    }

    // Content scroll
    if (key.upArrow) {
      atBottomRef.current = false;
      setScrollOffset((p) => Math.min(maxScroll, p + 1));
    }
    if (key.downArrow) {
      setScrollOffset((p) => {
        const n = Math.max(0, p - 1);
        if (n === 0) atBottomRef.current = true;
        return n;
      });
    }
    if (key.pageUp) {
      atBottomRef.current = false;
      setScrollOffset((p) => Math.min(maxScroll, p + paneHeight));
    }
    if (key.pageDown) {
      setScrollOffset((p) => {
        const n = Math.max(0, p - paneHeight);
        if (n === 0) atBottomRef.current = true;
        return n;
      });
    }
    if (key.home) {
      atBottomRef.current = false;
      setScrollOffset(maxScroll);
    }
    if (key.end) {
      atBottomRef.current = true;
      setScrollOffset(0);
    }
  });

  const sidebarTasks = tasks.map((t) => ({
    index: t.index,
    prompt: t.prompt,
    status: t.status,
  }));

  return (
    <Box flexDirection="row" height={paneHeight} width="100%">
      <TaskSidebar
        tasks={sidebarTasks}
        queued={queued}
        selectedIndex={selectedIndex}
        selectedQueueId={selectedQueueId}
        width={SIDEBAR_WIDTH}
        isFocused={isFocused}
      />
      <TaskContent
        entries={selectedEntries}
        scrollOffset={scrollOffset}
        paneHeight={paneHeight}
        isLive={isLive}
        taskIndex={selectedIndex}
        queuedPrompt={queuedPrompt}
        queuedId={selectedQueueId}
      />
    </Box>
  );
});
