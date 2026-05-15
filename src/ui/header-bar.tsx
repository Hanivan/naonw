import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { useState, useEffect } from "react";
import type { Status, ProviderData } from "@/ui/store.ts";

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function abbrevModel(model: string): string {
  // strip provider-prefix (e.g. "openrouter/owl-alpha" → "owl-alpha")
  const slash = model.lastIndexOf("/");
  const base = slash >= 0 ? model.slice(slash + 1) : model;
  return base.length > 16 ? base.slice(0, 15) + "…" : base;
}

function ProviderChip({ p, active }: { p: ProviderData; active: boolean }) {
  const nameColor = active ? "cyan" : "gray";
  return (
    <Box flexDirection="row">
      <Text color={nameColor} bold={active}>{p.name}</Text>
      <Text color="gray" dimColor>/{abbrevModel(p.model)}</Text>
      {p.cloud && <Text color="yellow" dimColor> ☁</Text>}
    </Box>
  );
}

interface HeaderBarProps {
  status: Status;
  providers: ProviderData[];
}

export function HeaderBar({ status, providers }: HeaderBarProps) {
  const [now, setNow] = useState(Date.now);

  const running = status.agentStatus === "thinking" || status.agentStatus === "tool";

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const urlDisplay = status.currentUrl
    ? status.currentUrl.replace(/^https?:\/\//, "").slice(0, 35)
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
      {/* Row 1: identity + providers + url + browser */}
      <Box paddingX={1} gap={2}>
        <Text color="blueBright" bold>◆ Naonw</Text>
        <Text color="gray" dimColor>│</Text>
        {providers.length === 0 ? (
          <Text color="gray" dimColor>no providers</Text>
        ) : (
          <Box gap={2}>
            {providers.map((p, i) => (
              <ProviderChip key={i} p={p} active={p.name === status.provider} />
            ))}
          </Box>
        )}
        <Text color="gray" dimColor>│</Text>
        <Text color="gray" dimColor>URL <Text color="yellow">{urlDisplay}</Text></Text>
        <Text color="gray" dimColor>│</Text>
        <Text color={status.browserOpen ? "green" : "gray"} dimColor={!status.browserOpen}>
          {status.browserOpen ? `● browser ${status.browserMode === "cdp" ? "(cdp)" : "(launched)"}` : "○ browser"}
        </Text>
      </Box>
      {/* Row 2: live agent state */}
      <Box paddingX={1} gap={2}>
        {running ? (
          <Text color={statusColor}>
            <Spinner type="dots" />{" "}{elapsed}
            {statusLabel && <Text dimColor>  {statusLabel}</Text>}
          </Text>
        ) : done ? (
          <Text color={statusColor}>⁂ {elapsed}</Text>
        ) : interrupted ? (
          <Text color="red">✗ interrupted</Text>
        ) : (
          <Text color="gray" dimColor>· idle</Text>
        )}
        <Text color="gray" dimColor>iter <Text color="magenta">{status.iteration}</Text>/{status.maxIterations}</Text>
        <Box gap={1}>
          <Text color="blue">↑{status.tokensIn}</Text>
          <Text color="green">↓{status.tokensOut}</Text>
          <Text color="gray">Σ{totalTokens}</Text>
        </Box>
      </Box>
    </Box>
  );
}
