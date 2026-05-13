import { Box, useInput, useWindowSize } from "ink";
import { useState, useEffect, useCallback, useRef } from "react";
import { store } from "@/ui/store.ts";
import type { LogEntry, Status } from "@/ui/store.ts";
import { LogPane } from "@/ui/log-pane.tsx";
import { InputBar } from "@/ui/input-bar.tsx";
import { StatusLine } from "@/ui/status-line.tsx";
import { TimerBar } from "@/ui/timer-bar.tsx";
import type { ScrollViewRef } from "ink-scroll-view";

interface AppProps {
  onSubmit: (text: string) => void;
  onInterrupt: () => void;
}

export function App({ onSubmit, onInterrupt }: AppProps) {
  const { columns: cols, rows } = useWindowSize();

  const [logs, setLogs] = useState<LogEntry[]>([...store.logs]);
  const [status, setStatus] = useState<Status>({ ...store.status });
  const scrollRef = useRef<ScrollViewRef>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    const onLog = () => setLogs([...store.logs]);
    const onStatus = () => setStatus({ ...store.status });
    store.on("log", onLog);
    store.on("status", onStatus);
    return () => { store.off("log", onLog); store.off("status", onStatus); };
  }, []);

  useEffect(() => {
    if (atBottomRef.current) scrollRef.current?.scrollToBottom();
  });

  const paneHeight = Math.max(1, rows - 6);

  useInput((_char, key) => {
    if (key.upArrow || key.pageUp) {
      atBottomRef.current = false;
      scrollRef.current?.scrollBy(key.upArrow ? -3 : -paneHeight);
    }
    if (key.downArrow || key.pageDown) {
      atBottomRef.current = true;
      scrollRef.current?.scrollBy(key.downArrow ? 3 : paneHeight);
    }
  });

  const handleKey = useCallback(() => {
    atBottomRef.current = true;
    scrollRef.current?.scrollToBottom();
  }, []);

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      <LogPane logs={logs} paneHeight={paneHeight} scrollRef={scrollRef} />
      <TimerBar status={status} />
      <InputBar onSubmit={onSubmit} onInterrupt={onInterrupt} onKey={handleKey} />
      <StatusLine status={status} />
    </Box>
  );
}
