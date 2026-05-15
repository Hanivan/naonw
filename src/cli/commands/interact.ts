import { connect } from "../connect.ts";
import type { Flags } from "../flags.ts";
import { fillFields, scrollPage, pressKeys, moveMouse, dragMouse } from "../../browser/actions.ts";

function ellipsize(s: string, max = 60): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

export async function cmdClick(args: string[], flags: Flags) {
  const [xs, ys] = args;
  if (!xs || !ys) throw new Error("Usage: naonw click <x> <y>");
  const { page, close } = await connect(flags.tab);
  const btn = flags.right ? "right" : "left";
  const count = flags.double ? 2 : 1;
  await page.mouse.click(Number(xs), Number(ys), { button: btn as any, clickCount: count });
  await close();
  const mods = [flags.right && "right", flags.double && "double"].filter(Boolean).join(" ");
  console.log(`[OK] click (${xs}, ${ys})${mods ? ` ${mods}` : ""}`);
}

export async function cmdType(args: string[], flags: Flags) {
  if (args.length === 0) throw new Error("Usage: naonw type [x y] <text>");
  let text: string;
  let x: number | undefined;
  let y: number | undefined;
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
  const where = x !== undefined ? ` at (${x}, ${y})` : "";
  console.log(`[OK] type "${ellipsize(text)}"${where}`);
}

export async function cmdFill(args: string[], flags: Flags) {
  if (args.length === 0) throw new Error('Usage: naonw fill "Label=value" ...');
  const fields: Record<string, string> = {};
  for (const arg of args) {
    const eq = arg.indexOf("=");
    if (eq === -1) throw new Error(`Invalid field "${arg}". Use key=value format`);
    fields[arg.slice(0, eq)] = arg.slice(eq + 1);
  }
  const { page, close } = await connect(flags.tab);
  const { filled, failed } = await fillFields(page, fields);
  await close();
  if (filled.length) console.log(`[OK] fill ${filled.join(", ")}`);
  if (failed.length) throw new Error(`Not found: ${failed.join(", ")}`);
}

export async function cmdKey(args: string[], _flags: Flags) {
  if (args.length === 0) throw new Error("Usage: naonw key <key...>");
  const { page, close } = await connect(_flags.tab);
  await pressKeys(page, args.join(" "));
  await close();
  console.log(`[OK] key ${args.join(" ")}`);
}

export async function cmdMove(args: string[], flags: Flags) {
  const [xs, ys] = args;
  if (!xs || !ys) throw new Error("Usage: naonw move <x> <y>");
  const { page, close } = await connect(flags.tab);
  await moveMouse(page, Number(xs), Number(ys));
  await close();
  console.log(`[OK] move (${xs}, ${ys})`);
}

export async function cmdDrag(args: string[], flags: Flags) {
  if (args.length < 4) throw new Error("Usage: naonw drag <x1> <y1> <x2> <y2>");
  const [x1, y1, x2, y2] = args.map(Number);
  const { page, close } = await connect(flags.tab);
  await dragMouse(page, x1!, y1!, x2!, y2!);
  await close();
  console.log(`[OK] drag (${x1}, ${y1}) → (${x2}, ${y2})`);
}

export async function cmdScroll(args: string[], flags: Flags) {
  const dir = args[0] ?? "down";
  const px = Number(args[1] ?? 500);
  const { page, close } = await connect(flags.tab);
  await scrollPage(page, dir, px);
  await close();
  console.log(`[OK] scroll ${dir} ${px}px`);
}
