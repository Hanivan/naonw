import { Box, Text, useInput, useFocus, useFocusManager } from "ink";
import { TextInput } from "@/ui/text-input.tsx";
import { useEffect, useState } from "react";
import { store } from "@/ui/store.ts";

interface InputBarProps {
  onSubmit: (text: string) => void;
  onInterrupt: () => void;
  onKey: () => void;
}

export function InputBar({ onSubmit, onInterrupt, onKey }: InputBarProps) {
  const [input, setInput] = useState("");
  const [lastInput, setLastInput] = useState("");
  const [captchaPending, setCaptchaPending] = useState(store.captchaPending);
  useEffect(() => {
    const onCaptcha = () => setCaptchaPending(store.captchaPending);
    store.on("captcha", onCaptcha);
    return () => { store.off("captcha", onCaptcha); };
  }, []);
  const { isFocused } = useFocus({ id: "input", autoFocus: true });
  const { focus } = useFocusManager();

  useInput((char, key) => {
    if (key.ctrl && char === "c") { process.exit(130); return; }
    if (key.escape) { setInput(lastInput); focus("input"); onInterrupt(); return; }
    if (!isFocused) return;
    if (!key.upArrow && !key.downArrow && !key.pageUp && !key.pageDown && !key.home && !key.end) onKey();
  });

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        paddingX={1}
      >
        <Text color={isFocused ? "cyan" : "gray"} bold>❯ </Text>
        {isFocused
          ? (
            <TextInput
              value={input}
              onChange={(val) => { if (!/\[<\d/.test(val)) setInput(val); }}
              onSubmit={(val) => { const t = val.trim(); setLastInput(t); setInput(""); onSubmit(t); }}
              showCursor
              focus={isFocused}
            />
          )
          : <Text color="gray" dimColor>scroll mode</Text>
        }
      </Box>
      <Box paddingX={2}>
        <Text dimColor color="gray">
          {captchaPending
            ? "Enter (empty): resolve captcha  ·  text+Enter: queue task  ·  Esc: abort"
            : isFocused
              ? "Tab: scroll mode  ·  Esc: interrupt"
              : "j/k: select task  ·  ↑↓ PgUp PgDn Home End: scroll  ·  d: delete queued  ·  Tab: type mode"}
        </Text>
      </Box>
    </Box>
  );
}
