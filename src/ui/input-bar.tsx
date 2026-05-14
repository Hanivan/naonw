import { Box, Text, useInput, useFocus, useFocusManager } from "ink";
import { TextInput } from "@/ui/text-input.tsx";
import { useState } from "react";

interface InputBarProps {
  onSubmit: (text: string) => void;
  onInterrupt: () => void;
  onKey: () => void;
}

export function InputBar({ onSubmit, onInterrupt, onKey }: InputBarProps) {
  const [input, setInput] = useState("");
  const [lastInput, setLastInput] = useState("");
  const { isFocused } = useFocus({ id: "input", autoFocus: true });
  const { focus } = useFocusManager();

  useInput((char, key) => {
    if (key.ctrl && char === "c") { process.exit(130); return; }
    if (key.escape) { setInput(lastInput); focus("input"); onInterrupt(); return; }
    if (!isFocused) return;
    if (!key.upArrow && !key.downArrow && !key.pageUp && !key.pageDown && !key.home && !key.end) onKey();
  });

  return (
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
            onChange={setInput}
            onSubmit={(val) => { const t = val.trim(); setLastInput(t); setInput(""); onSubmit(t); }}
            showCursor
            focus={isFocused}
          />
        )
        : <Text color="gray" dimColor>scroll mode  ·  Tab to type</Text>
      }
    </Box>
  );
}
