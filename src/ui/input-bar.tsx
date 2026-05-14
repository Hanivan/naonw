import { Box, Text, useInput, useApp, useFocus } from "ink";
import { TextInput } from "@/ui/text-input.tsx";
import { useState } from "react";

interface InputBarProps {
  onSubmit: (text: string) => void;
  onInterrupt: () => void;
  onKey: () => void;
}

export function InputBar({ onSubmit, onInterrupt, onKey }: InputBarProps) {
  const [input, setInput] = useState("");
  const { exit } = useApp();
  const { isFocused } = useFocus({ id: "input", autoFocus: true });

  useInput((char, key) => {
    if (key.ctrl && char === "c") { exit(); return; }
    if (key.escape) { onInterrupt(); return; }
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
            onSubmit={(val) => { setInput(""); onSubmit(val.trim()); }}
            showCursor
            focus={isFocused}
          />
        )
        : <Text color="gray" dimColor>scroll mode  ·  Tab to type</Text>
      }
    </Box>
  );
}
