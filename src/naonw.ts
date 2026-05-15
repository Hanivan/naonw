// naonw — Naonw browser CLI
// Usage: bun src/naonw.ts <command> [args] [flags]
import { loadConfig } from "./config/index.ts";
loadConfig();

import { parseFlags } from "./cli/flags.ts";
import { cmdGo, cmdUrl, cmdBack, cmdForward } from "./cli/commands/navigation.ts";
import { cmdText, cmdShot, cmdSnap } from "./cli/commands/observe.ts";
import { cmdClick, cmdType, cmdFill, cmdKey, cmdMove, cmdDrag, cmdScroll } from "./cli/commands/interact.ts";
import { cmdTab } from "./cli/commands/tab.ts";
import { cmdJs, cmdWait } from "./cli/commands/other.ts";
import type { Flags } from "./cli/flags.ts";

const HELP = `naonw — Naonw browser CLI

Usage: naonw <command> [args] [flags]
       NAONW_CDP_URL=http://localhost:9222 (default)

Navigation:
  go <url>                    Navigate (waits for networkidle)
  url                         Print current URL
  back / forward              History navigation

Observe:
  text [selector]             Visible text (default: body)
  shot [file]                 Screenshot (default: ./shot.png)
  snap                        Interactive elements via Accessibility Tree

Interact:
  click <x> <y>               Click at coordinates
  type [x y] <text>           Type text (with coords: triple-clicks first)
  fill <k=v...>               Fill form fields by label/name/placeholder
  key <key...>                Press keys — combos: Meta+a, Ctrl+Shift+T
  move <x> <y>                Hover
  drag <x1> <y1> <x2> <y2>   Drag between points
  scroll [dir] [px]           Scroll (default: down 500)

Tabs:
  tab list / new [url] / close [id]

Other:
  js <code>                   Eval JS in page
  wait <ms|selector|networkidle|url:pattern>

Flags:
  --timeout <ms>   (default: 30000)
  --tab <id>       target tab by Chrome id
  --json           structured output (snap, tab list)
  --right          right-click
  --double         double-click
  --width <px>     screenshot viewport width
  --height <px>    screenshot viewport height`;

const commands: Record<string, (args: string[], flags: Flags) => Promise<void>> = {
  go: cmdGo, url: cmdUrl, back: cmdBack, forward: cmdForward,
  shot: cmdShot, text: cmdText, snap: cmdSnap,
  click: cmdClick, type: cmdType, fill: cmdFill,
  key: cmdKey, move: cmdMove, drag: cmdDrag, scroll: cmdScroll,
  js: cmdJs, wait: cmdWait, tab: cmdTab,
};

async function main() {
  const { args, flags } = parseFlags(process.argv.slice(2));
  const [cmd, ...rest] = args;

  if (!cmd || flags.help) { console.log(HELP); process.exit(0); }

  const handler = commands[cmd];
  if (!handler) throw new Error(`Unknown command: ${cmd}\nRun 'naonw --help' for usage`);

  await handler(rest, flags);
}

main().catch(e => {
  console.error(`Error: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
