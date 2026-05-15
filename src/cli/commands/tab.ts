import { connectBrowser, targetId } from "../connect.ts";
import type { Flags } from "../flags.ts";

export async function cmdTab(args: string[], flags: Flags) {
  const [sub, ...rest] = args;
  if (!sub || !["list", "new", "close"].includes(sub)) {
    throw new Error("Usage: naonw tab <list|new [url]|close [id]>");
  }
  const browser = await connectBrowser();
  const pages = browser.targets().filter(t => t.type() === "page");

  if (sub === "list") {
    const entries = await Promise.all(pages.map(async t => {
      const page = await t.page();
      return { id: targetId(t), url: t.url(), title: page ? await page.title() : "" };
    }));
    await browser.disconnect();
    if (flags.json) { console.log(JSON.stringify(entries, null, 2)); return; }
    console.log(`[TAB LIST] ${entries.length} tab${entries.length !== 1 ? "s" : ""}`);
    for (const { id, url, title } of entries) console.log(`  ${id}\t${url}\t${title}`);
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
    const finalUrl = page.url();
    let title = "";
    try { title = (await page.title()).trim(); } catch {}
    await browser.disconnect();
    console.log(`[TAB NEW] ${id} ${finalUrl}${title ? ` — ${title}` : ""}`);
    return;
  }

  if (sub === "close") {
    if (pages.length <= 1) { await browser.disconnect(); throw new Error("Cannot close the last tab"); }
    const id = rest[0];
    const target = id ? pages.find(t => targetId(t) === id) : pages[pages.length - 1];
    if (!target) { await browser.disconnect(); throw new Error(`No tab: ${id}`); }
    const closedId = targetId(target);
    const closedUrl = target.url();
    const page = await target.page();
    await page!.close();
    await browser.disconnect();
    console.log(`[TAB CLOSE] ${closedId} ${closedUrl}`);
  }
}
