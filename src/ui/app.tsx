import { Box, useWindowSize } from "ink";
import { useState, useEffect, useCallback, useRef } from "react";
import { store } from "@/ui/store.ts";
import type { LogEntry, Status } from "@/ui/store.ts";
import { LogPanel } from "@/ui/log-panel.tsx";
import type { LogPanelRef } from "@/ui/log-panel.tsx";
import { InputBar } from "@/ui/input-bar.tsx";
import { StatusLine } from "@/ui/status-line.tsx";
import { TimerBar } from "@/ui/timer-bar.tsx";

interface AppProps {
  onSubmit: (text: string) => void;
  onInterrupt: () => void;
}

export function App({ onSubmit, onInterrupt }: AppProps) {
  const { rows } = useWindowSize();

  const [logs, setLogs] = useState<LogEntry[]>([...store.logs]);
  const [status, setStatus] = useState<Status>({ ...store.status });
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(store.collapsedGroups));
  const logPanelRef = useRef<LogPanelRef>(null);

  useEffect(() => {
    const onLog = () => { setLogs([...store.logs]); setCollapsedGroups(new Set(store.collapsedGroups)); };
    const onStatus = () => setStatus({ ...store.status });
    store.on("log", onLog);
    store.on("status", onStatus);
    return () => { store.off("log", onLog); store.off("status", onStatus); };
  }, []);

  const paneHeight = Math.max(1, rows - 6);

  const handleKey = useCallback(() => {
    logPanelRef.current?.scrollToBottom();
  }, []);

  const handleToggleLastGroup = useCallback(() => {
    const seen = new Set<string>();
    let lastGroup: string | undefined;
    for (const e of store.logs) {
      if (e.groupId && !seen.has(e.groupId)) { seen.add(e.groupId); lastGroup = e.groupId; }
    }
    if (lastGroup) store.toggleGroup(lastGroup);
  }, []);

  return (
    <Box flexDirection="column" width="100%" height={rows}>
      <LogPanel ref={logPanelRef} logs={logs} paneHeight={paneHeight}
                collapsedGroups={collapsedGroups} onToggleGroup={(id: string) => store.toggleGroup(id)} />
      <TimerBar status={status} />
      <InputBar onSubmit={onSubmit} onInterrupt={onInterrupt} onKey={handleKey} onToggleGroup={handleToggleLastGroup} />
      <StatusLine status={status} />
    </Box>
  );
}
