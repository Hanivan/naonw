import { Text, useInput } from "ink";
import chalk from "chalk";
import { useState, useEffect } from "react";

function prevWordStart(str: string, pos: number): number {
  let i = pos;
  while (i > 0 && /\s/.test(str.charAt(i - 1))) i--;
  while (i > 0 && /\S/.test(str.charAt(i - 1))) i--;
  return i;
}

function nextWordEnd(str: string, pos: number): number {
  let i = pos;
  while (i < str.length && /\s/.test(str.charAt(i))) i++;
  while (i < str.length && /\S/.test(str.charAt(i))) i++;
  return i;
}

interface Props {
  value: string;
  placeholder?: string;
  focus?: boolean;
  showCursor?: boolean;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
}

export function TextInput({
  value: originalValue,
  placeholder = "",
  focus = true,
  showCursor = true,
  onChange,
  onSubmit,
}: Props) {
  const [state, setState] = useState({
    cursorOffset: originalValue.length,
  });
  const { cursorOffset } = state;

  useEffect(() => {
    setState((prev) => {
      if (!focus || !showCursor) return prev;
      const len = originalValue.length;
      return prev.cursorOffset > len ? { cursorOffset: len } : prev;
    });
  }, [originalValue, focus, showCursor]);

  let renderedValue: string;
  let renderedPlaceholder: string | undefined;

  if (showCursor && focus) {
    renderedPlaceholder =
      placeholder.length > 0
        ? chalk.inverse(placeholder[0]) + chalk.grey(placeholder.slice(1))
        : chalk.inverse(" ");

    renderedValue = originalValue.length > 0 ? "" : chalk.inverse(" ");
    let i = 0;
    for (const char of originalValue) {
      renderedValue += i === cursorOffset ? chalk.inverse(char) : char;
      i++;
    }
    if (originalValue.length > 0 && cursorOffset === originalValue.length) {
      renderedValue += chalk.inverse(" ");
    }
  } else {
    renderedValue = originalValue;
    renderedPlaceholder = placeholder ? chalk.grey(placeholder) : undefined;
  }

  useInput(
    (input, key) => {
      if (
        key.upArrow ||
        key.downArrow ||
        key.tab ||
        key.escape ||
        (key.shift && key.tab) ||
        (key.ctrl && input === "c")
      ) {
        return;
      }

      if (key.return) {
        onSubmit?.(originalValue);
        return;
      }

      let nextCursor = cursorOffset;
      let nextValue = originalValue;

      if (key.home || key.pageUp) {
        nextCursor = 0;
      } else if (key.end || key.pageDown) {
        nextCursor = originalValue.length;
      } else if (key.ctrl && key.leftArrow) {
        nextCursor = prevWordStart(originalValue, cursorOffset);
      } else if (key.ctrl && key.rightArrow) {
        nextCursor = nextWordEnd(originalValue, cursorOffset);
      } else if (key.ctrl && key.backspace) {
        const ws = prevWordStart(originalValue, cursorOffset);
        nextValue = originalValue.slice(0, ws) + originalValue.slice(cursorOffset);
        nextCursor = ws;
      } else if (key.ctrl && key.delete) {
        const we = nextWordEnd(originalValue, cursorOffset);
        nextValue = originalValue.slice(0, cursorOffset) + originalValue.slice(we);
      } else if (key.leftArrow) {
        if (showCursor) nextCursor--;
      } else if (key.rightArrow) {
        if (showCursor) nextCursor++;
      } else if (key.backspace) {
        if (cursorOffset > 0) {
          nextValue =
            originalValue.slice(0, cursorOffset - 1) +
            originalValue.slice(cursorOffset);
          nextCursor--;
        }
      } else if (key.delete) {
        if (cursorOffset < originalValue.length) {
          nextValue =
            originalValue.slice(0, cursorOffset) +
            originalValue.slice(cursorOffset + 1);
        }
      } else {
        nextValue =
          originalValue.slice(0, cursorOffset) +
          input +
          originalValue.slice(cursorOffset);
        nextCursor += input.length;
      }

      nextCursor = Math.max(0, Math.min(nextCursor, nextValue.length));
      setState({ cursorOffset: nextCursor });
      if (nextValue !== originalValue) onChange(nextValue);
    },
    { isActive: focus },
  );

  return (
    <Text>
      {placeholder
        ? originalValue.length > 0
          ? renderedValue
          : renderedPlaceholder
        : renderedValue}
    </Text>
  );
}
