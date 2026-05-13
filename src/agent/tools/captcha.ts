import type { Page } from "puppeteer";
import type { ToolResult } from "./types.ts";

export async function solveCaptcha(page: Page): Promise<ToolResult> {
  const frames = page.frames();
  const challengeFrame = frames.find((f) => f.url().includes("recaptcha") && f.url().includes("bframe"));
  const challengeText = challengeFrame
    ? await challengeFrame.evaluate(() => {
        const el = document.querySelector(".rc-imageselect-desc-no-canonical, .rc-imageselect-desc");
        return el?.textContent?.trim() ?? "";
      }).catch(() => "")
    : "";
  const imageBase64 = await page.screenshot({ encoding: "base64" });
  return {
    text: `CAPTCHA challenge: "${challengeText}". Grid is 4×4 (IDs 0–15, left-to-right top-to-bottom). Call clickCaptchaTile with IDs of matching tiles, then verify=true when done.`,
    imageBase64,
  };
}

export async function clickCaptchaTile(page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  const ids = args.ids as number[];
  const frames = page.frames();
  const challengeFrame = frames.find((f) => f.url().includes("recaptcha") && f.url().includes("bframe"));
  if (!challengeFrame) throw new Error("reCAPTCHA challenge frame not found");
  for (const id of ids) {
    await challengeFrame.click(`#${id}`).catch(() => {});
    await Bun.sleep(150);
  }
  if (args.verify) {
    await Bun.sleep(400);
    await challengeFrame.click("#recaptcha-verify-button").catch(() => {});
  }
  return { text: `Clicked CAPTCHA tiles [${ids.join(", ")}]${args.verify ? " and submitted" : ""}` };
}
