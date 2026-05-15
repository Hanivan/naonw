import { connect } from "../connect.ts";
import type { Flags } from "../flags.ts";
import { evaluateJs } from "../../browser/actions.ts";

export async function cmdJs(args: string[], flags: Flags) {
  const code = args.join(" ");
  if (!code.trim()) throw new Error("Usage: naonw js <code>");
  const { page, close } = await connect(flags.tab);
  const result = await evaluateJs(page, code);
  await close();
  if (result === undefined || result === null) return;
  console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
}

export async function cmdWait(args: string[], flags: Flags) {
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
