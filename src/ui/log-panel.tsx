import { Box, Text, useInput, useFocus } from "ink";
import { useRef, useEffect, forwardRef, useImperativeHandle, useState, useMemo } from "react";
import { LogPane } from "@/ui/log-pane.tsx";
import { useMouseWheel } from "@/utils/use-mouse-wheel.ts";
import type { LogEntry } from "@/ui/store.ts";
import type { ScrollViewRef } from "ink-scroll-view";

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
  const scrollRef = useRef<ScrollViewRef>(null);
  const atBottomRef = useRef(true);
  const { isFocused } = useFocus({ id: "log" });
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const allGroupIds = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const e of logs) {
      if (e.groupId && !seen.has(e.groupId)) { seen.add(e.groupId); result.push(e.groupId); }
    }
    return result;
  }, [logs]);

  const collapsedGroupIds = useMemo(
    () => allGroupIds.filter((id) => collapsedGroups.has(id)),
    [allGroupIds, collapsedGroups],
  );

  // Auto-select last collapsed group; preserve selection if still collapsed
  useEffect(() => {
    setSelectedGroupId((prev) => {
      if (prev && collapsedGroups.has(prev)) return prev;
      return collapsedGroupIds[collapsedGroupIds.length - 1] ?? null;
    });
  }, [collapsedGroupIds, collapsedGroups]);

  useImperativeHandle(ref, () => ({
    scrollToBottom() {
      atBottomRef.current = true;
      scrollRef.current?.scrollToBottom();
    },
  }), []);

  useEffect(() => {
    if (atBottomRef.current) scrollRef.current?.scrollToBottom();
  });

  useMouseWheel({
    onWheelUp: () => {
      if (!isFocusedRef.current) return;
      atBottomRef.current = false;
      scrollRef.current?.scrollBy(-3);
    },
    onWheelDown: () => {
      if (!isFocusedRef.current) return;
      atBottomRef.current = true;
      scrollRef.current?.scrollBy(3);
    },
    onLeftClick: () => {
      if (selectedGroupId) onToggleGroup(selectedGroupId);
    },
  });

  // Always-registered handler — check isFocusedRef manually to avoid
  // the effect re-registration timing gap that { isActive: isFocused } causes.
  useInput((char, key) => {
    if (key.home) { atBottomRef.current = false; scrollRef.current?.scrollToTop(); }
    if (key.end) { atBottomRef.current = true; scrollRef.current?.scrollToBottom(); }
    if (key.upArrow || key.pageUp) {
      atBottomRef.current = false;
      scrollRef.current?.scrollBy(key.upArrow ? -3 : -paneHeight);
    }
    if (key.downArrow || key.pageDown) {
      atBottomRef.current = true;
      scrollRef.current?.scrollBy(key.downArrow ? 3 : paneHeight);
    }

    if (!isFocusedRef.current) return;

    if (char === "j" && collapsedGroupIds.length > 0) {
      const idx = selectedGroupId !== null ? collapsedGroupIds.indexOf(selectedGroupId) : -1;
      const next = collapsedGroupIds[(idx + 1) % collapsedGroupIds.length];
      if (next !== undefined) setSelectedGroupId(next);
    }
    if (char === "k" && collapsedGroupIds.length > 0) {
      const idx = selectedGroupId !== null ? collapsedGroupIds.indexOf(selectedGroupId) : collapsedGroupIds.length;
      const prev = collapsedGroupIds[(idx - 1 + collapsedGroupIds.length) % collapsedGroupIds.length];
      if (prev !== undefined) setSelectedGroupId(prev);
    }
    if (key.return && selectedGroupId) {
      onToggleGroup(selectedGroupId);
    }
  });

  const hintHeight = isFocused && collapsedGroupIds.length > 0 ? 1 : 0;

  return (
    <Box flexDirection="column" height={paneHeight}>
      <LogPane logs={logs} paneHeight={paneHeight - hintHeight} scrollRef={scrollRef}
               collapsedGroups={collapsedGroups} selectedGroupId={selectedGroupId} />
      {isFocused && collapsedGroupIds.length > 0 && (
        <Box paddingX={1}>
          <Text dimColor color="gray">j/k: select group  ·  enter: toggle</Text>
        </Box>
      )}
    </Box>
  );
});
