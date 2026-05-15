// naonw — Naonw browser CLI
// Usage: bun src/naonw.ts <command> [args] [flags]
import puppeteer from "puppeteer-core";
import type { Page, KeyInput } from "puppeteer-core";
import { parseArgs } from "node:util";
import { writeFileSync } from "node:fs";

const CDP_URL = process.env.NAONW_CDP_URL ?? "http://127.0.0.1:9222";
const VIEWPORT = { width: 1024, height: 768 };

// ── Flags ────────────────────────────────────────────────────────────────────

function parseFlags(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      timeout:  { type: "string",  default: "30000" },
      tab:      { type: "string" },
      json:     { type: "boolean", default: false },
      right:    { type: "boolean", default: false },
      double:   { type: "boolean", default: false },
      help:     { type: "boolean", short: "h", default: false },
      width:    { type: "string" },
      height:   { type: "string" },
      fps:      { type: "string" },
      scale:    { type: "string" },
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

type Flags = ReturnType<typeof parseFlags>["flags"];

// ── Connect ──────────────────────────────────────────────────────────────────

function targetId(t: any): string {
  return t._targetId ?? t.url();
}

async function connect(tabId?: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const browser = await puppeteer.connect({ browserURL: CDP_URL, defaultViewport: VIEWPORT });
  const pages = browser.targets().filter(t => t.type() === "page");
  const target = (tabId ? pages.find(t => targetId(t) === tabId) : pages[0]);
  if (!target) throw new Error("No page found. Is Chrome running with --remote-debugging-port=9222?");
  const page = await target.page();
  if (!page) throw new Error("Could not attach to page");
  return { page, close: () => browser.disconnect() as unknown as Promise<void> };
}

// ── Commands ─────────────────────────────────────────────────────────────────

async function cmdGo(args: string[], flags: Flags) {
  let url = args[0];
  if (!url) throw new Error("Usage: naonw go <url>");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const { page, close } = await connect(flags.tab);
  await page.goto(url, { waitUntil: "networkidle0", timeout: flags.timeout });
  console.log(page.url());
  await close();
}

async function cmdUrl(_args: string[], flags: Flags) {
  const { page, close } = await connect(flags.tab);
  console.log(page.url());
  await close();
}

async function cmdBack(_args: string[], flags: Flags) {
  const { page, close } = await connect(flags.tab);
  await page.goBack({ waitUntil: "networkidle0", timeout: flags.timeout });
  console.log(page.url());
  await close();
}

async function cmdForward(_args: string[], flags: Flags) {
  const { page, close } = await connect(flags.tab);
  await page.goForward({ waitUntil: "networkidle0", timeout: flags.timeout });
  console.log(page.url());
  await close();
}

async function cmdShot(args: string[], flags: Flags) {
  const file = args[0] ?? "./shot.png";
  const { page, close } = await connect(flags.tab);
  if (flags.width || flags.height) {
    const vp = page.viewport() ?? VIEWPORT;
    await page.setViewport({ width: flags.width ?? vp.width, height: flags.height ?? vp.height });
  }
  await page.screenshot({ path: file, fullPage: false });
  console.log(file);
  await close();
}

async function cmdText(args: string[], flags: Flags) {
  const selector = args[0] ?? "body";
  const { page, close } = await connect(flags.tab);
  const content = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    return el?.innerText?.trim() ?? null;
  }, selector);
  await close();
  if (content === null) throw new Error(`Selector not found: ${selector}`);
  console.log(content);
}

// Accessibility snap — same logic as mini-browser
const INTERACTIVE_ROLES = new Set([
  "link", "button", "textbox", "combobox", "searchbox",
  "checkbox", "radio", "switch", "slider", "spinbutton",
  "tab", "menuitem", "menuitemcheckbox", "menuitemradio",
  "option", "treeitem", "select",
]);
const STATE_PROPS = new Set(["haspopup", "expanded", "checked", "selected", "disabled", "pressed"]);

async function cmdSnap(_args: string[], flags: Flags) {
  const { page, close } = await connect(flags.tab);
  const client = await page.createCDPSession();

  const vp = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const { nodes } = await (client as any).send("Accessibility.getFullAXTree") as { nodes: any[] };

  const interesting = nodes.filter(n => !n.ignored && n.backendDOMNodeId && INTERACTIVE_ROLES.has(n.role?.value));

  const elements = (await Promise.all(interesting.map(async (n, i): Promise<any> => {
    try {
      const { model } = await (client as any).send("DOM.getBoxModel", { backendNodeId: n.backendDOMNodeId });
      if (!model || model.width === 0 || model.height === 0) return null;
      const [x1, y1, x2, , , y3] = model.border;
      const x = Math.round((x1 + x2) / 2);
      const y = Math.round((y1 + y3) / 2);
      if (x < 0 || x > vp.width || y < 0 || y > vp.height + 5) return null;
      const state = (n.properties ?? []).reduce((acc: any, p: any) => {
        if (STATE_PROPS.has(p.name)) acc[p.name] = p.value?.value;
        return acc;
      }, {});
      const name = n.name?.value || (n.role?.value === "link"
        ? (() => { try { return new URL((n.properties ?? []).find((p: any) => p.name === "url")?.value?.value ?? "").pathname; } catch { return ""; } })()
        : "");
      return { index: i, role: n.role?.value, name, x, y, state };
    } catch { return null; }
  }))).filter(Boolean).sort((a: any, b: any) => a.y - b.y || a.x - b.x);

  await (client as any).detach();
  await close();

  if (flags.json) { console.log(JSON.stringify(elements, null, 2)); return; }
  for (const el of elements as any[]) {
    const stateStr = Object.entries(el.state).map(([k, v]) => `[${k}=${v}]`).join(" ");
    console.log(`[${el.index}] ${el.role} "${el.name}" (${el.x}, ${el.y})${stateStr ? " " + stateStr : ""}`);
  }
}

async function cmdClick(args: string[], flags: Flags) {
  const [xs, ys] = args;
  if (!xs || !ys) throw new Error("Usage: naonw click <x> <y>");
  const x = Number(xs); const y = Number(ys);
  const { page, close } = await connect(flags.tab);
  const btn = flags.right ? "right" : "left";
  const count = flags.double ? 2 : 1;
  await page.mouse.click(x, y, { button: btn as any, clickCount: count });
  await close();
}

async function cmdType(args: string[], flags: Flags) {
  if (args.length === 0) throw new Error("Usage: naonw type [x y] <text>");
  let text: string;
  let x: number | undefined; let y: number | undefined;
  if (args.length >= 3 && !isNaN(Number(args[0])) && !isNaN(Number(args[1]))) {
    x = Number(args[0]); y = Number(args[1]); text = args.slice(2).join(" ");
  } else {
    text = args.join(" ");
  }
  const { page, close } = await connect(flags.tab);
  if (x !== undefined && y !== undefined) {
    await page.mouse.click(x, y, { clickCount: 3 });
  }
  await page.keyboard.type(text);
  await close();
}

async function cmdFill(args: string[], flags: Flags) {
  if (args.length === 0) throw new Error('Usage: naonw fill "Label=value" ...');
  const fields: Record<string, string> = {};
  for (const arg of args) {
    const eq = arg.indexOf("=");
    if (eq === -1) throw new Error(`Invalid field "${arg}". Use key=value format`);
    fields[arg.slice(0, eq)] = arg.slice(eq + 1);
  }
  const { page, close } = await connect(flags.tab);
  const { filled, failed } = await page.evaluate((fields) => {
    const esc = (v: string) => typeof CSS !== "undefined" ? CSS.escape(v) : v.replace(/["\\]/g, "\\$&");
    const find = (key: string): HTMLInputElement | null => {
      if (/^[#.[[]/.test(key)) { try { return document.querySelector(key); } catch { return null; } }
      const e = esc(key);
      return (
        document.querySelector<HTMLInputElement>(`[aria-label="${e}"]`) ??
        document.querySelector<HTMLInputElement>(`[placeholder="${e}"]`) ??
        document.querySelector<HTMLInputElement>(`[name="${e}"]`) ??
        document.getElementById(key) as HTMLInputElement | null ??
        (() => {
          for (const label of Array.from(document.querySelectorAll("label"))) {
            if (label.textContent?.trim().toLowerCase().includes(key.toLowerCase())) {
              const id = label.getAttribute("for");
              if (id) return document.getElementById(id) as HTMLInputElement | null;
              return label.querySelector<HTMLInputElement>("input,textarea,select");
            }
          }
          return null;
        })()
      );
    };
    const filled: string[] = []; const failed: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      const el = find(key);
      if (!el) { failed.push(key); continue; }
      (el as HTMLInputElement).value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      filled.push(key);
    }
    return { filled, failed };
  }, fields);
  await close();
  if (filled.length) console.log(`Filled: ${filled.join(", ")}`);
  if (failed.length) throw new Error(`Not found: ${failed.join(", ")}`);
}

async function cmdKey(args: string[], flags: Flags) {
  if (args.length === 0) throw new Error("Usage: naonw key <key...>");
  const { page, close } = await connect(flags.tab);
  for (const k of args) {
    if (!k.includes("+")) { await page.keyboard.press(k as KeyInput); continue; }
    const parts = k.split("+");
    const mods = parts.slice(0, -1);
    const final = parts.at(-1)!;
    for (const m of mods) await page.keyboard.down(m as KeyInput);
    await page.keyboard.press(final as KeyInput);
    for (const m of [...mods].reverse()) await page.keyboard.up(m as KeyInput);
  }
  await close();
}

async function cmdMove(args: string[], flags: Flags) {
  const [xs, ys] = args;
  if (!xs || !ys) throw new Error("Usage: naonw move <x> <y>");
  const { page, close } = await connect(flags.tab);
  await page.mouse.move(Number(xs), Number(ys));
  await close();
}

async function cmdDrag(args: string[], flags: Flags) {
  if (args.length < 4) throw new Error("Usage: naonw drag <x1> <y1> <x2> <y2>");
  const [x1, y1, x2, y2] = args.map(Number);
  const { page, close } = await connect(flags.tab);
  await page.mouse.move(x1!, y1!);
  await page.mouse.down();
  await page.mouse.move(x2!, y2!, { steps: 10 });
  await page.mouse.up();
  await close();
}

async function cmdScroll(args: string[], flags: Flags) {
  const dir = args[0] ?? "down";
  const px = Number(args[1] ?? 500);
  const deltas: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const d = deltas[dir];
  if (!d) throw new Error("Direction must be: up, down, left, right");
  const { page, close } = await connect(flags.tab);
  await page.mouse.wheel({ deltaX: d[0] * px, deltaY: d[1] * px });
  await close();
}

async function cmdJs(args: string[], flags: Flags) {
  const code = args.join(" ");
  if (!code.trim()) throw new Error("Usage: naonw js <code>");
  const { page, close } = await connect(flags.tab);
  const result = await page.evaluate(code);
  await close();
  if (result === undefined || result === null) return;
  console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
}

async function cmdWait(args: string[], flags: Flags) {
  const target = args[0];
  if (!target) throw new Error("Usage: naonw wait <ms | selector | networkidle | url:pattern>");
  const { page, close } = await connect(flags.tab);
  const ms = Number(target);
  if (!isNaN(ms) && String(ms) === target) {
    await new Promise(r => setTimeout(r, ms));
  } else if (target === "networkidle") {
    await page.waitForNetworkIdle({ timeout: flags.timeout });
  } else if (target.startsWith("url:")) {
    await page.waitForFunction((p) => location.href.includes(p as string), { timeout: flags.timeout }, target.slice(4));
  } else {
    await page.waitForSelector(target, { timeout: flags.timeout });
  }
  await close();
}

async function cmdTab(args: string[], flags: Flags) {
  const [sub, ...rest] = args;
  if (!sub || !["list", "new", "close"].includes(sub)) {
    throw new Error("Usage: naonw tab <list|new [url]|close [id]>");
  }
  const browser = await puppeteer.connect({ browserURL: CDP_URL, defaultViewport: VIEWPORT });
  const pages = browser.targets().filter(t => t.type() === "page");

  if (sub === "list") {
    const entries = await Promise.all(pages.map(async t => {
      const page = await t.page();
      return { id: targetId(t), url: t.url(), title: page ? await page.title() : "" };
    }));
    await browser.disconnect();
    if (flags.json) { console.log(JSON.stringify(entries, null, 2)); return; }
    for (const { id, url, title } of entries) console.log(`${id}\t${url}\t${title}`);
    return;
  }

  if (sub === "new") {
    const url = rest[0];
    const cdp = await browser.target().createCDPSession();
    const { targetId: id } = await (cdp as any).send("Target.createTarget", { url: "about:blank" });
    await (cdp as any).detach();
    const target = await browser.waitForTarget(t => targetId(t) === id);
    const page = await target.page();
    if (!page) { await browser.disconnect(); throw new Error("Failed to attach to new tab"); }
    if (url) await page.goto(url, { waitUntil: "networkidle0", timeout: flags.timeout });
    await browser.disconnect();
    console.log(id);
    return;
  }

  if (sub === "close") {
    if (pages.length <= 1) { await browser.disconnect(); throw new Error("Cannot close the last tab"); }
    const id = rest[0];
    const target = id ? pages.find(t => targetId(t) === id) : pages[pages.length - 1];
    if (!target) { await browser.disconnect(); throw new Error(`No tab: ${id}`); }
    const page = await target.page();
    await page!.close();
    console.log(`Closed ${targetId(target)}\t${target.url()}`);
    await browser.disconnect();
  }
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

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
