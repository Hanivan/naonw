// src/ui/input-bar.tsx
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState } from "react";

interface InputBarProps {
  onSubmit: (text: string) => void;
  onInterrupt: () => void;
  onKey: () => void;
}

export function InputBar({ onSubmit, onInterrupt, onKey }: InputBarProps) {
  const [input, setInput] = useState("");

  useInput((char, key) => {
    onKey();
    if (key.ctrl && char === "c") process.exit(0);
    if (key.escape) { onInterrupt(); return; }
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
      <Text color="cyan" bold>❯ </Text>
      <TextInput
        value={input}
        onChange={setInput}
        onSubmit={(val) => { setInput(""); onSubmit(val.trim()); }}
        showCursor
      />
    </Box>
  );
}
