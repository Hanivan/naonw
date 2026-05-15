import { Box, useWindowSize } from "ink";
import { useState, useEffect, useCallback, useRef } from "react";
import { store } from "@/ui/store.ts";
import type { LogEntry, Status, ProviderData } from "@/ui/store.ts";
import { LogPanel } from "@/ui/log-panel.tsx";
import type { LogPanelRef } from "@/ui/log-panel.tsx";
import { InputBar } from "@/ui/input-bar.tsx";
import { HeaderBar } from "@/ui/header-bar.tsx";

// Header: 2 content rows + 1 bottom border = 3
// Input:  1 top border + 1 prompt + 1 hint = 3
const HEADER_H = 3;
const INPUT_H  = 3;

interface AppProps {
  onSubmit: (text: string) => void;
  onInterrupt: () => void;
}

export function App({ onSubmit, onInterrupt }: AppProps) {
  const { rows } = useWindowSize();

  const [logs, setLogs] = useState<LogEntry[]>([...store.logs]);
  const [status, setStatus] = useState<Status>({ ...store.status });
  const [providers, setProviders] = useState<ProviderData[]>([...store.providers]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(store.collapsedGroups));
  const logPanelRef = useRef<LogPanelRef>(null);

  useEffect(() => {
    const onLog = () => { setLogs([...store.logs]); setCollapsedGroups(new Set(store.collapsedGroups)); };
    const onStatus = () => setStatus({ ...store.status });
    const onProviders = () => setProviders([...store.providers]);
    store.on("log", onLog);
    store.on("status", onStatus);
    store.on("providers", onProviders);
    return () => {
      store.off("log", onLog);
      store.off("status", onStatus);
      store.off("providers", onProviders);
    };
  }, []);

  const mainHeight = Math.max(1, rows - HEADER_H - INPUT_H);

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
    <Box flexDirection="column" width="100%" height={rows} overflow="hidden">
      <HeaderBar status={status} providers={providers} />
      <LogPanel ref={logPanelRef} logs={logs} paneHeight={mainHeight}
                collapsedGroups={collapsedGroups} onToggleGroup={(id: string) => store.toggleGroup(id)} />
      <InputBar onSubmit={onSubmit} onInterrupt={onInterrupt} onKey={handleKey} onToggleGroup={handleToggleLastGroup} />
    </Box>
  );
}
