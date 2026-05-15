import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { useState, useEffect } from "react";
import type { Status } from "@/ui/store.ts";

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

interface HeaderBarProps {
  status: Status;
}

export function HeaderBar({ status }: HeaderBarProps) {
  const [now, setNow] = useState(Date.now);

  const running = status.agentStatus === "thinking" || status.agentStatus === "tool";

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const urlDisplay = status.currentUrl
    ? status.currentUrl.replace(/^https?:\/\//, "").slice(0, 40)
    : "—";

  const providerLabel = status.provider
    ? `${status.provider}${status.model ? `/${status.model}` : ""}`
    : "—";

  const totalTokens = status.tokensIn + status.tokensOut;
  const elapsed = formatElapsed(now - status.agentStartTime);

  const done = status.agentStatus === "done";
  const interrupted = status.agentStatus === "interrupted";
  const statusColor = running ? "yellow" : done ? "green" : "gray";

  const statusLabel = status.agentStatus === "thinking" ? "thinking…"
    : status.agentStatus === "tool" ? "tool…"
    : null;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderTop={false}
      borderLeft={false}
      borderRight={false}
      borderBottom
    >
      <Box paddingX={1} gap={2}>
        <Text color="blueBright" bold>◆ Naonw</Text>
        <Text color="gray" dimColor>│</Text>
        <Text color="gray">MDL <Text color="cyan">{providerLabel}</Text></Text>
        <Text color="gray" dimColor>│</Text>
        <Text color="gray">URL <Text color="yellow">{urlDisplay}</Text></Text>
        <Text color="gray" dimColor>│</Text>
        <Text color={status.browserOpen ? "green" : "gray"} dimColor={!status.browserOpen}>
          {status.browserOpen ? "● browser" : "○ browser"}
        </Text>
      </Box>
      <Box paddingX={1} gap={2}>
        {running ? (
          <Text color={statusColor}><Spinner type="dots" /> {elapsed}{statusLabel ? <Text dimColor>  {statusLabel}</Text> : null}</Text>
        ) : done ? (
          <Text color={statusColor}>⁂ {elapsed}</Text>
        ) : interrupted ? (
          <Text color="red">✗ interrupted</Text>
        ) : (
          <Text color="gray" dimColor>· idle</Text>
        )}
        <Text color="gray" dimColor>iter <Text color="magenta">{status.iteration}</Text>/{status.maxIterations}</Text>
        <Text color="gray" dimColor>
          <Text color="blue">↑{status.tokensIn}</Text>{" "}
          <Text color="green">↓{status.tokensOut}</Text>
          {" "}Σ{totalTokens}
        </Text>
      </Box>
    </Box>
  );
}
