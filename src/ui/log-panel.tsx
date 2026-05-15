import { Box, Text, useInput, useFocus } from "ink";
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

  let lastGroupId: string | null = null;
  for (const e of logs) if (e.groupId) lastGroupId = e.groupId;

  const hintHeight = isFocused && allGroupIds.length > 0 ? 1 : 0;
  const effectivePaneHeight = Math.max(1, paneHeight - hintHeight);
  const maxScroll = Math.max(0, items.length - effectivePaneHeight);

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
      setScrollTop(Math.max(0, items.length - effectivePaneHeight));
    }
  }, [items.length, effectivePaneHeight]);

  // Scroll to keep selected group in view after j/k navigation
  useEffect(() => {
    if (!selectedGroupId) return;
    const idx = items.findIndex(
      (it) => (it.type === "collapsed" || it.type === "group-footer") && it.groupId === selectedGroupId,
    );
    if (idx < 0) return;
    setScrollTop((prev) => {
      if (idx < prev) return idx;
      if (idx >= prev + effectivePaneHeight) return idx - effectivePaneHeight + 1;
      return prev;
    });
  }, [selectedGroupId, items, effectivePaneHeight]);

  useImperativeHandle(ref, () => ({
    scrollToBottom() {
      atBottomRef.current = true;
      setScrollTop(Math.max(0, items.length - effectivePaneHeight));
    },
  }), [items.length, effectivePaneHeight]);

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
      setScrollTop((p) => Math.max(0, p - (key.upArrow ? 1 : effectivePaneHeight)));
    }
    if (key.downArrow || key.pageDown) {
      setScrollTop((p) => {
        const n = Math.min(maxScroll, p + (key.downArrow ? 1 : effectivePaneHeight));
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

  const selectedIsCollapsed = selectedGroupId !== null && collapsedGroups.has(selectedGroupId);

  return (
    <Box flexDirection="column" height={paneHeight}>
      <LogPane
        items={items}
        scrollTop={scrollTop}
        paneHeight={effectivePaneHeight}
        selectedGroupId={selectedGroupId}
        lastGroupId={lastGroupId}
      />
      {isFocused && allGroupIds.length > 0 && (
        <Box paddingX={1}>
          <Text dimColor color="gray">
            {`j/k: select group  ·  enter: ${selectedIsCollapsed ? "expand" : "collapse"}`}
          </Text>
        </Box>
      )}
    </Box>
  );
});
