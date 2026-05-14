import { Box, Text } from "ink";
import type { Status } from "@/ui/store.ts";

interface StatusLineProps {
  status: Status;
}

export function StatusLine({ status }: StatusLineProps) {
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
      overflow="hidden"
    >
      <Box gap={3}>
        <Text color="gray">MDL <Text color="cyan">{providerLabel}</Text></Text>
        <Text color="gray">URL <Text color="yellow">{urlDisplay}</Text></Text>
        <Text color="gray">ITER <Text color="magenta">{status.iteration}</Text><Text color="gray">/{status.maxIterations}</Text></Text>
        <Text color="gray">TKN <Text color="blue">↑{status.tokensIn}</Text><Text color="gray"> </Text><Text color="green">↓{status.tokensOut}</Text><Text color="gray"> Σ{totalTokens}</Text></Text>
        <Text color="gray">BROWSER <Text color={status.browserOpen ? "green" : "gray"}>{status.browserOpen ? "● open" : "○ closed"}</Text></Text>
      </Box>
    </Box>
  );
}
