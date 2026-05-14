import { useEffect, useRef } from "react";
import { useStdin } from "ink";

type Options = {
  onWheelUp: () => void;
  onWheelDown: () => void;
  onLeftClick?: () => void;
};

export function useMouseWheel({ onWheelUp, onWheelDown, onLeftClick }: Options) {
  const { stdin } = useStdin();
  const upRef = useRef(onWheelUp);
  const downRef = useRef(onWheelDown);
  const clickRef = useRef(onLeftClick);
  upRef.current = onWheelUp;
  downRef.current = onWheelDown;
  clickRef.current = onLeftClick;

  useEffect(() => {
    process.stdout.write("\x1b[?1006h");
    process.stdout.write("\x1b[?1015h");

    const origEmit = stdin.emit.bind(stdin);
    (stdin as unknown as { emit: typeof origEmit }).emit = function (event: string, ...args: unknown[]) {
      if (event === "data") {
        const str = (args[0] as Buffer).toString();
        // Match any SGR mouse event (press M or release m)
        if (/\[<\d+;\d+;\d+[Mm]/.test(str)) {
          if (str.includes("[<64;")) upRef.current();
          if (str.includes("[<65;")) downRef.current();
          if (/\[<0;\d+;\d+M/.test(str)) clickRef.current?.();
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
