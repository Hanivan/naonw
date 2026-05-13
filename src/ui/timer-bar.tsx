// src/ui/timer-bar.tsx
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { useState, useEffect } from "react";
import type { Status } from "@/ui/store.ts";

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

interface TimerBarProps {
  status: Status;
}

export function TimerBar({ status }: TimerBarProps) {
  const [now, setNow] = useState(Date.now);

  const running = status.agentStatus === "thinking" || status.agentStatus === "tool";
  const done    = status.agentStatus === "done";

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!running && !done) {
    return <Box paddingX={1}><Text> </Text></Box>;
  }

  const elapsed = formatElapsed(now - status.agentStartTime);
  const label   = running ? `Running for ${elapsed}` : `Worked for ${elapsed}`;
  const color   = running ? "yellow" : "green";

  return (
    <Box paddingX={1} marginTop={1}>
      {running
        ? <Text color={color}><Spinner type="dots" /> {label}</Text>
        : <Text color={color}>⁂ {label}</Text>
      }
      <Text dimColor>  · iter {status.iteration}/{status.maxIterations}</Text>
    </Box>
  );
}
