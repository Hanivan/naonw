import { connect } from "../connect.ts";
import type { Flags } from "../flags.ts";
import { snapPage } from "../../browser/actions.ts";

export async function cmdText(args: string[], flags: Flags) {
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

export async function cmdShot(args: string[], flags: Flags) {
  const file = args[0] ?? "./shot.png";
  const { page, close } = await connect(flags.tab);
  if (flags.width || flags.height) {
    const vp = page.viewport() ?? { width: 1024, height: 768 };
    await page.setViewport({ width: flags.width ?? vp.width, height: flags.height ?? vp.height });
  }
  await page.screenshot({ path: file, fullPage: false });
  console.log(file);
  await close();
}

export async function cmdSnap(_args: string[], flags: Flags) {
  const { page, close } = await connect(flags.tab);
  const elements = await snapPage(page);
  await close();
  if (flags.json) { console.log(JSON.stringify(elements, null, 2)); return; }
  for (const el of elements) {
    const stateStr = Object.entries(el.state).map(([k, v]) => `[${k}=${v}]`).join(" ");
    console.log(`[${el.index}] ${el.role} "${el.name}" (${el.x}, ${el.y})${stateStr ? " " + stateStr : ""}`);
  }
}
