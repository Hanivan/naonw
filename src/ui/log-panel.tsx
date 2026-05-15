import { Box, useInput, useFocus } from "ink";
import { useRef, useEffect, forwardRef, useImperativeHandle, useState, useMemo } from "react";
import { TaskSidebar } from "@/ui/task-sidebar.tsx";
import { TaskContent } from "@/ui/task-content.tsx";
import { useMouseWheel } from "@/utils/use-mouse-wheel.ts";
import type { LogEntry } from "@/ui/store.ts";

const SIDEBAR_WIDTH = 22;

export interface LogPanelRef {
  scrollToBottom: () => void;
}

interface LogPanelProps {
  logs: LogEntry[];
  paneHeight: number;
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
  { logs, paneHeight },
  ref,
) {
  const { isFocused } = useFocus({ id: "log" });
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const atBottomRef = useRef(true);
  const prevLastIndexRef = useRef<number | null>(null);

  const tasks = useMemo<TaskInfo[]>(() => deriveTasks(logs), [logs]);
  const lastIndex = tasks.length === 0 ? null : tasks[tasks.length - 1]!.index;
  const liveIndex = tasks.length > 0 && tasks[tasks.length - 1]!.status === "running"
    ? tasks[tasks.length - 1]!.index
    : null;

  // Initial select + auto-switch when on previous LIVE
  useEffect(() => {
    if (selectedIndex === null && lastIndex !== null) {
      setSelectedIndex(lastIndex);
      atBottomRef.current = true;
      setScrollOffset(0);
      prevLastIndexRef.current = lastIndex;
      return;
    }
    if (lastIndex !== null && lastIndex !== prevLastIndexRef.current) {
      // A new task was added.
      if (selectedIndex === prevLastIndexRef.current) {
        // User was on the previously-LIVE task: follow.
        setSelectedIndex(lastIndex);
        atBottomRef.current = true;
        setScrollOffset(0);
      }
      prevLastIndexRef.current = lastIndex;
    }
  }, [lastIndex, selectedIndex]);

  const selectedTask = useMemo(
    () => (selectedIndex === null ? null : tasks.find((t) => t.index === selectedIndex) ?? null),
    [tasks, selectedIndex],
  );
  const selectedEntries = selectedTask?.entries ?? [];
  const isLive = selectedTask !== null && selectedTask.index === liveIndex;

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

    // Task navigation: j/k
    if (char === "j" && tasks.length > 0) {
      setSelectedIndex((cur) => {
        const curIdx = cur ?? tasks[0]!.index;
        const pos = tasks.findIndex((t) => t.index === curIdx);
        const next = tasks[(pos + 1) % tasks.length]!.index;
        atBottomRef.current = true;
        setScrollOffset(0);
        return next;
      });
      return;
    }
    if (char === "k" && tasks.length > 0) {
      setSelectedIndex((cur) => {
        const curIdx = cur ?? tasks[0]!.index;
        const pos = tasks.findIndex((t) => t.index === curIdx);
        const prev = tasks[(pos - 1 + tasks.length) % tasks.length]!.index;
        atBottomRef.current = true;
        setScrollOffset(0);
        return prev;
      });
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
        selectedIndex={selectedIndex}
        width={SIDEBAR_WIDTH}
      />
      <TaskContent
        entries={selectedEntries}
        scrollOffset={scrollOffset}
        paneHeight={paneHeight}
        isLive={isLive}
        taskIndex={selectedIndex}
      />
    </Box>
  );
});
