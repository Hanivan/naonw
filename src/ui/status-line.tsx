import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { Status } from "@/ui/store.ts";

const STATUS_COLOR: Record<string, string> = {
  idle: "gray", thinking: "yellow", tool: "cyan",
  done: "green", interrupted: "red",
};

const STATUS_LABEL: Record<string, string> = {
  idle: "idle", thinking: "thinking…", tool: "running tool",
  done: "done", interrupted: "interrupted",
};

interface StatusLineProps {
  status: Status;
}

export function StatusLine({ status }: StatusLineProps) {
  const statusColor = STATUS_COLOR[status.agentStatus] ?? "white";
  const statusLabel = STATUS_LABEL[status.agentStatus] ?? status.agentStatus;

  const urlDisplay = status.currentUrl
    ? status.currentUrl.replace(/^https?:\/\//, "").slice(0, 30)
    : "—";

  const totalTokens = status.tokensIn + status.tokensOut;

  const providerLabel = status.provider
    ? `${status.provider}${status.model ? ` / ${status.model}` : ""}`
    : "—";

  return (
    <Box
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
      justifyContent="space-between"
      overflow="hidden"
    >
      <Box gap={3}>
        <Text dimColor>MDL <Text color="cyan">{providerLabel}</Text></Text>
        <Text dimColor>URL <Text color="yellow">{urlDisplay}</Text></Text>
        <Text dimColor>ITER <Text color="magenta">{status.iteration}<Text dimColor>/{status.maxIterations}</Text></Text></Text>
        <Text dimColor>TKN <Text color="blue">↑{status.tokensIn}</Text><Text dimColor> </Text><Text color="green">↓{status.tokensOut}</Text><Text dimColor> Σ{totalTokens}</Text></Text>
        <Text dimColor>BROWSER <Text color={status.browserOpen ? "green" : "gray"}>{status.browserOpen ? "● open" : "○ closed"}</Text></Text>
      </Box>
      <Text color={statusColor}>
        {status.agentStatus === "thinking" ? <Spinner type="dots" /> : " "} {statusLabel}
      </Text>
    </Box>
  );
}
