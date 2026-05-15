import { Box, useInput, useFocus } from "ink";
import { useRef, useEffect, forwardRef, useImperativeHandle, useState, useMemo } from "react";
import { LogPane, buildRenderItems } from "@/ui/log-pane.tsx";
import { useMouseWheel } from "@/utils/use-mouse-wheel.ts";
import type { LogEntry } from "@/ui/store.ts";

export interface LogPanelRef {
  scrollToBottom: () => void;
}

interface LogPanelProps {
  logs: LogEntry[];
  paneHeight: number;
  collapsedGroups: Set<string>;
  onToggleGroup: (id: string) => void;
}

export const LogPanel = forwardRef<LogPanelRef, LogPanelProps>(function LogPanel(
  { logs, paneHeight, collapsedGroups, onToggleGroup },
  ref,
) {
  const { isFocused } = useFocus({ id: "log" });
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;

  const [scrollTop, setScrollTop] = useState(0);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const atBottomRef = useRef(true);

  const items = useMemo(
    () => buildRenderItems(logs, collapsedGroups),
    [logs, collapsedGroups],
  );

  const allGroupIds = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const e of logs) {
      if (e.groupId && !seen.has(e.groupId)) { seen.add(e.groupId); result.push(e.groupId); }
    }
    return result;
  }, [logs]);

  type TaskInfo = {
    groupId: string;
    index: number;
    prompt: string;
    status: "running" | "done" | "failed";
    entries: LogEntry[];
  };

  const _tasks = useMemo<TaskInfo[]>(() => {
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
  }, [logs]);

  let lastGroupId: string | null = null;
  for (const e of logs) if (e.groupId) lastGroupId = e.groupId;

  const maxScroll = Math.max(0, items.length - paneHeight);

  // Auto-select last group (any state); preserve selection if group still exists
  useEffect(() => {
    setSelectedGroupId((prev) => {
      if (prev && allGroupIds.includes(prev)) return prev;
      return allGroupIds[allGroupIds.length - 1] ?? null;
    });
  }, [allGroupIds]);

  // Auto-scroll to bottom when new items arrive and user is pinned to bottom
  useEffect(() => {
    if (atBottomRef.current) {
      setScrollTop(Math.max(0, items.length - paneHeight));
    }
  }, [items.length, paneHeight]);

  // Scroll to keep selected group in view after j/k navigation
  useEffect(() => {
    if (!selectedGroupId) return;
    const idx = items.findIndex(
      (it) => (it.type === "collapsed" || it.type === "group-footer") && it.groupId === selectedGroupId,
    );
    if (idx < 0) return;
    setScrollTop((prev) => {
      if (idx < prev) return idx;
      if (idx >= prev + paneHeight) return idx - paneHeight + 1;
      return prev;
    });
  }, [selectedGroupId, items, paneHeight]);

  useImperativeHandle(ref, () => ({
    scrollToBottom() {
      atBottomRef.current = true;
      setScrollTop(Math.max(0, items.length - paneHeight));
    },
  }), [items.length, paneHeight]);

  useMouseWheel({
    onWheelUp: () => {
      if (!isFocusedRef.current) return;
      atBottomRef.current = false;
      setScrollTop((p) => Math.max(0, p - 3));
    },
    onWheelDown: () => {
      if (!isFocusedRef.current) return;
      setScrollTop((p) => {
        const n = Math.min(maxScroll, p + 3);
        if (n >= maxScroll) atBottomRef.current = true;
        return n;
      });
    },
  });

  // Always-registered — no { isActive } to avoid effect re-registration timing gap.
  // Scroll keys fire unconditionally; group nav gates on isFocusedRef.
  useInput((char, key) => {
    if (key.home) { atBottomRef.current = false; setScrollTop(0); }
    if (key.end)  { atBottomRef.current = true;  setScrollTop(maxScroll); }
    if (key.upArrow || key.pageUp) {
      atBottomRef.current = false;
      setScrollTop((p) => Math.max(0, p - (key.upArrow ? 1 : paneHeight)));
    }
    if (key.downArrow || key.pageDown) {
      setScrollTop((p) => {
        const n = Math.min(maxScroll, p + (key.downArrow ? 1 : paneHeight));
        if (n >= maxScroll) atBottomRef.current = true;
        return n;
      });
    }

    if (!isFocusedRef.current) return;

    if (char === "j" && allGroupIds.length > 0) {
      const idx = selectedGroupId !== null ? allGroupIds.indexOf(selectedGroupId) : -1;
      const next = allGroupIds[(idx + 1) % allGroupIds.length];
      if (next !== undefined) setSelectedGroupId(next);
    }
    if (char === "k" && allGroupIds.length > 0) {
      const idx = selectedGroupId !== null ? allGroupIds.indexOf(selectedGroupId) : allGroupIds.length;
      const prev = allGroupIds[(idx - 1 + allGroupIds.length) % allGroupIds.length];
      if (prev !== undefined) setSelectedGroupId(prev);
    }
    if (key.return && selectedGroupId) {
      onToggleGroup(selectedGroupId);
    }
  });

  return (
    <Box flexDirection="column" height={paneHeight} overflow="hidden">
      <LogPane
        items={items}
        scrollTop={scrollTop}
        paneHeight={paneHeight}
        selectedGroupId={selectedGroupId}
        lastGroupId={lastGroupId}
      />
    </Box>
  );
});
