import { useEffect, useRef } from "react";
import { useStdin } from "ink";

type Options = {
  onWheelUp: () => void;
  onWheelDown: () => void;
};

export function useMouseWheel({ onWheelUp, onWheelDown }: Options) {
  const { stdin } = useStdin();
  const upRef = useRef(onWheelUp);
  const downRef = useRef(onWheelDown);
  upRef.current = onWheelUp;
  downRef.current = onWheelDown;

  useEffect(() => {
    process.stdout.write("\x1b[?1006h");
    process.stdout.write("\x1b[?1015h");

    // Intercept stdin.emit so mouse sequences never reach Ink's input pipeline
    // (prevents escape chars from being typed into TextInput).
    const origEmit = stdin.emit.bind(stdin);
    (stdin as unknown as { emit: typeof origEmit }).emit = function (event: string, ...args: unknown[]) {
      if (event === "data") {
        const str = (args[0] as Buffer).toString();
        if (str.includes("[<64;") || str.includes("[<65;")) {
          if (str.includes("[<64;")) upRef.current();
          if (str.includes("[<65;")) downRef.current();
          return false;
        }
      }
      return origEmit(event, ...args);
    };

    return () => {
      (stdin as unknown as { emit: typeof origEmit }).emit = origEmit;
      process.stdout.write("\x1b[?1006l");
      process.stdout.write("\x1b[?1015l");
    };
  }, [stdin]);
}
