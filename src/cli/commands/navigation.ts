import { connect } from "../connect.ts";
import type { Flags } from "../flags.ts";

async function summary(page: Awaited<ReturnType<typeof connect>>["page"]): Promise<string> {
  const url = page.url();
  let title = "";
  try { title = (await page.title()).trim(); } catch {}
  return title ? `${url} — ${title}` : url;
}

export async function cmdGo(args: string[], flags: Flags) {
  let url = args[0];
  if (!url) throw new Error("Usage: naonw go <url>");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const { page, close } = await connect(flags.tab);
  await page.goto(url, { waitUntil: "networkidle0", timeout: flags.timeout });
  const s = await summary(page);
  await close();
  console.log(`[GO] ${s}`);
}

export async function cmdUrl(_args: string[], flags: Flags) {
  const { page, close } = await connect(flags.tab);
  const s = await summary(page);
  await close();
  console.log(`[URL] ${s}`);
}

export async function cmdBack(_args: string[], flags: Flags) {
  const { page, close } = await connect(flags.tab);
  await page.goBack({ waitUntil: "networkidle0", timeout: flags.timeout });
  const s = await summary(page);
  await close();
  console.log(`[BACK] ${s}`);
}

export async function cmdForward(_args: string[], flags: Flags) {
  const { page, close } = await connect(flags.tab);
  await page.goForward({ waitUntil: "networkidle0", timeout: flags.timeout });
  const s = await summary(page);
  await close();
  console.log(`[FORWARD] ${s}`);
}
