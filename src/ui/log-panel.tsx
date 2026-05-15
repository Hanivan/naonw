import { Box } from "ink";
import { useRef, forwardRef, useImperativeHandle, useState, useMemo, useEffect, useCallback } from "react";
import { TaskSidebar } from "@/ui/task-sidebar.tsx";
import { TaskContent, totalLineCount } from "@/ui/task-content.tsx";
import type { LogEntry, QueuedMessage } from "@/ui/store.ts";

const SIDEBAR_WIDTH = 22;

export interface LogPanelRef {
  scrollToBottom: () => void;
}

interface LogPanelProps {
  logs: LogEntry[];
  paneHeight: number;
  paneWidth: number;
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
  { logs, paneHeight, paneWidth, queued },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const atBottomRef = useRef(true);
  const prevLastIndexRef = useRef<number | null>(null);
  const prevLiveIndexRef = useRef<number | null>(null);

  const tasks = useMemo<TaskInfo[]>(() => deriveTasks(logs), [logs]);

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
      if (selectedIndex === prevLiveIndexRef.current) {
        setSelectedIndex(lastIndex);
        setSelectedQueueId(null);
        atBottomRef.current = true;
        setScrollOffset(0);
      }
    }
    prevLastIndexRef.current = lastIndex;
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

  // Auto-pin to bottom when new entries arrive on the LIVE task and user is pinned.
  useEffect(() => {
    if (isLive && atBottomRef.current) setScrollOffset(0);
  }, [isLive, selectedEntries.length]);

  useImperativeHandle(ref, () => ({
    scrollToBottom() {
      atBottomRef.current = true;
      setScrollOffset(0);
    },
  }), []);

  // Line-unit max: total content lines minus the visible window (header is 1 row).
  const contentWidth = Math.max(20, paneWidth - SIDEBAR_WIDTH);
  const totalLines = useMemo(
    () => totalLineCount(selectedEntries, contentWidth),
    [selectedEntries, contentWidth],
  );
  const visibleRows = Math.max(1, paneHeight - 1);
  const maxScroll = Math.max(0, totalLines - visibleRows);

  const scrollDelta = useCallback((delta: number) => {
    setScrollOffset((p) => {
      const n = Math.max(0, Math.min(maxScroll, p + delta));
      atBottomRef.current = n === 0;
      return n;
    });
  }, [maxScroll]);

  const scrollToTop = useCallback(() => {
    atBottomRef.current = false;
    setScrollOffset(maxScroll);
  }, [maxScroll]);

  const scrollToBottom = useCallback(() => {
    atBottomRef.current = true;
    setScrollOffset(0);
  }, []);

  const onSelectTask = useCallback((index: number) => {
    setSelectedIndex((prev) => {
      if (prev === index) return prev; // no-op, preserve scroll position
      atBottomRef.current = true;
      setScrollOffset(0);
      return index;
    });
    setSelectedQueueId(null);
  }, []);

  const onSelectQueue = useCallback((id: string) => {
    setSelectedQueueId((prev) => {
      if (prev === id) return prev;
      atBottomRef.current = true;
      setScrollOffset(0);
      return id;
    });
    setSelectedIndex(null);
  }, []);

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
        onSelectTask={onSelectTask}
        onSelectQueue={onSelectQueue}
      />
      <TaskContent
        entries={selectedEntries}
        scrollOffset={scrollOffset}
        paneHeight={paneHeight}
        paneWidth={Math.max(20, paneWidth - SIDEBAR_WIDTH)}
        isLive={isLive}
        taskIndex={selectedIndex}
        queuedPrompt={queuedPrompt}
        queuedId={selectedQueueId}
        onScrollDelta={scrollDelta}
        onScrollToTop={scrollToTop}
        onScrollToBottom={scrollToBottom}
      />
    </Box>
  );
});
