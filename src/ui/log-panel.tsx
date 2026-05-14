import { Box, useInput, useFocus } from "ink";
import { useRef, useEffect, forwardRef, useImperativeHandle } from "react";
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
}

export const LogPanel = forwardRef<LogPanelRef, LogPanelProps>(function LogPanel(
  { logs, paneHeight },
  ref,
) {
  const scrollRef = useRef<ScrollViewRef>(null);
  const atBottomRef = useRef(true);
  const { isFocused } = useFocus({ id: "log" });

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
      if (!isFocused) return;
      atBottomRef.current = false;
      scrollRef.current?.scrollBy(-3);
    },
    onWheelDown: () => {
      if (!isFocused) return;
      atBottomRef.current = true;
      scrollRef.current?.scrollBy(3);
    },
  });

  useInput((_char, key) => {
    if (key.home) {
      atBottomRef.current = false;
      scrollRef.current?.scrollToTop();
    }
    if (key.end) {
      atBottomRef.current = true;
      scrollRef.current?.scrollToBottom();
    }
    if (key.upArrow || key.pageUp) {
      atBottomRef.current = false;
      scrollRef.current?.scrollBy(key.upArrow ? -3 : -paneHeight);
    }
    if (key.downArrow || key.pageDown) {
      atBottomRef.current = true;
      scrollRef.current?.scrollBy(key.downArrow ? 3 : paneHeight);
    }
  }, { isActive: isFocused });

  return (
    <Box flexDirection="column" height={paneHeight}>
      <LogPane logs={logs} paneHeight={paneHeight} scrollRef={scrollRef} />
    </Box>
  );
});
