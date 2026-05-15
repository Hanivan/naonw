import { parseArgs } from "node:util";

export function parseFlags(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      timeout: { type: "string",  default: "30000" },
      tab:     { type: "string" },
      json:    { type: "boolean", default: false },
      right:   { type: "boolean", default: false },
      double:  { type: "boolean", default: false },
      help:    { type: "boolean", short: "h", default: false },
      width:   { type: "string" },
      height:  { type: "string" },
      fps:     { type: "string" },
      scale:   { type: "string" },
    },
  });
  return {
    args: positionals,
    flags: {
      timeout: Number(values.timeout),
      tab:     values.tab,
      json:    values.json!,
      right:   values.right!,
      double:  values.double!,
      help:    values.help!,
      width:   values.width ? Number(values.width) : undefined,
      height:  values.height ? Number(values.height) : undefined,
      fps:     values.fps ? Number(values.fps) : undefined,
      scale:   values.scale ? Number(values.scale) : undefined,
    },
  };
}

export type Flags = ReturnType<typeof parseFlags>["flags"];
