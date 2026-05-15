import { connect } from "../connect.ts";
import type { Flags } from "../flags.ts";

export async function cmdGo(args: string[], flags: Flags) {
  let url = args[0];
  if (!url) throw new Error("Usage: naonw go <url>");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  const { page, close } = await connect(flags.tab);
  await page.goto(url, { waitUntil: "networkidle0", timeout: flags.timeout });
  console.log(page.url());
  await close();
}

export async function cmdUrl(_args: string[], flags: Flags) {
  const { page, close } = await connect(flags.tab);
  console.log(page.url());
  await close();
}

export async function cmdBack(_args: string[], flags: Flags) {
  const { page, close } = await connect(flags.tab);
  await page.goBack({ waitUntil: "networkidle0", timeout: flags.timeout });
  console.log(page.url());
  await close();
}

export async function cmdForward(_args: string[], flags: Flags) {
  const { page, close } = await connect(flags.tab);
  await page.goForward({ waitUntil: "networkidle0", timeout: flags.timeout });
  console.log(page.url());
  await close();
}
