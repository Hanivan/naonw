// src/agent/tools/interaction.ts
import type { Page } from "puppeteer-core";
import type { ToolResult } from "./types.ts";
import type { RefCache } from "@/browser/snapshot.ts";
import { log } from "@/utils/logger.ts";

export class UnknownRefError extends Error {
  constructor(ref: string) {
    super(`Stale or unknown ref: ${ref}. Use refs from the latest snapshot.`);
    this.name = "UnknownRefError";
  }
}

function getBackendNodeId(ref: string, refCache: RefCache): number {
  const id = refCache.get(ref);
  if (!id) throw new UnknownRefError(ref);
  return id;
}

export async function click(page: Page, args: Record<string, unknown>, refCache: RefCache): Promise<ToolResult> {
  const ref = args.ref as string;
  const backendNodeId = await getBackendNodeId(ref, refCache);
  const client = await page.createCDPSession();
  try {
    const { model } = await (client as any).send("DOM.getBoxModel", { backendNodeId });
    const content = model.content as number[];
    const x = ((content[0] ?? 0) + (content[4] ?? 0)) / 2;
    const y = ((content[1] ?? 0) + (content[5] ?? 0)) / 2;
    await (client as any).send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await (client as any).send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    log.element(`click ${ref}`, "");
    await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
    return { text: `Clicked ${ref}` };
  } finally {
    await (client as any).detach().catch(() => {});
  }
}

export async function typeText(page: Page, args: Record<string, unknown>, refCache: RefCache): Promise<ToolResult> {
  const ref = args.ref as string;
  const text = args.text as string;
  const clear = args.clear as boolean | undefined;
  const backendNodeId = await getBackendNodeId(ref, refCache);
  const client = await page.createCDPSession();
  try {
    await (client as any).send("DOM.focus", { backendNodeId });
    if (clear) {
      const { object } = await (client as any).send("DOM.resolveNode", { backendNodeId });
      if (object?.objectId) {
        await (client as any).send("Runtime.callFunctionOn", {
          objectId: object.objectId,
          functionDeclaration: `function() {
            const nativeSetter =
              Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set ||
              Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
            if (nativeSetter) nativeSetter.call(this, '');
            else this.value = '';
            this.dispatchEvent(new Event('input', { bubbles: true }));
          }`,
        });
        await (client as any).send("Runtime.releaseObject", { objectId: object.objectId }).catch(() => {});
      }
    }
    await page.keyboard.type(text, { delay: 50 });
    return { text: `Typed "${text}" into ${ref}` };
  } finally {
    await (client as any).detach().catch(() => {});
  }
}

export async function selectOption(page: Page, args: Record<string, unknown>, refCache: RefCache): Promise<ToolResult> {
  const ref = args.ref as string;
  const value = args.value as string;
  const backendNodeId = await getBackendNodeId(ref, refCache);
  const client = await page.createCDPSession();
  try {
    const { object } = await (client as any).send("DOM.resolveNode", { backendNodeId });
    if (!object?.objectId) throw new Error(`Could not resolve DOM node for ${ref}`);
    const { result } = await (client as any).send("Runtime.callFunctionOn", {
      objectId: object.objectId,
      functionDeclaration: `function(val) {
        const opt = Array.from(this.options).find(o => o.value === val || o.text.trim() === val);
        if (!opt) return false;
        opt.selected = true;
        this.dispatchEvent(new Event('input', { bubbles: true }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }`,
      arguments: [{ value }],
      returnByValue: true,
    });
    await (client as any).send("Runtime.releaseObject", { objectId: object.objectId }).catch(() => {});
    if (!result?.value) throw new Error(`Option "${value}" not found in ${ref}`);
    return { text: `Selected "${value}" in ${ref}` };
  } finally {
    await (client as any).detach().catch(() => {});
  }
}

const AUTOCOMPLETE_SKIP = ["loadingindicator", "masukkan sendiri", "enter address manually", "cannot find"];
const AUTOCOMPLETE_SEL = '[role="option"], [data-autocomplete-item]';

export async function typeAndSelect(page: Page, args: Record<string, unknown>, refCache: RefCache): Promise<ToolResult> {
  const ref = args.ref as string;
  const text = args.text as string;
  const pick = args.pick as string | undefined;
  const backendNodeId = await getBackendNodeId(ref, refCache);
  const client = await page.createCDPSession();
  try {
    await (client as any).send("DOM.focus", { backendNodeId });
    await page.keyboard.type(text, { delay: 60 });

    await page.waitForFunction(
      (sel: string, skip: string[]) => {
        const items = Array.from(document.querySelectorAll(sel));
        return items.some((el) => {
          const t = (el.textContent ?? "").toLowerCase().trim();
          return t.length > 0 && !skip.some((s) => t.includes(s));
        });
      },
      { timeout: 8000, polling: 300 },
      AUTOCOMPLETE_SEL,
      AUTOCOMPLETE_SKIP,
    ).catch(() => {});
    await Bun.sleep(400);

    const suggestions: string[] = await page.evaluate(
      (sel: string, skip: string[]) =>
        Array.from(document.querySelectorAll(sel))
          .map((el) => {
            const label = el.getAttribute("aria-label") ?? "";
            const txt = (el.textContent ?? "").replace(/\s+/g, " ").trim();
            return label || txt;
          })
          .filter((t) => {
            const lc = t.toLowerCase();
            return t.length > 0 && !skip.some((s: string) => lc.includes(s));
          }),
      AUTOCOMPLETE_SEL,
      AUTOCOMPLETE_SKIP,
    );

    if (!pick) {
      const hint = suggestions.length ? `Suggestions: ${suggestions.slice(0, 5).join(" | ")}` : "No suggestions appeared";
      return { text: `Typed "${text}" into ${ref}. ${hint}` };
    }

    const picked: string | null = await page.evaluate(
      (sel: string, pickText: string, skip: string[]) => {
        const tokens = (s: string) =>
          s.toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, " ").trim().split(/\s+/).filter(Boolean);
        const pickTokens = tokens(pickText);
        const score = (c: string) => pickTokens.filter((t) => tokens(c).includes(t)).length;
        const scored = Array.from(document.querySelectorAll(sel))
          .map((el) => {
            const label = el.getAttribute("aria-label") ?? "";
            const txt = (el.textContent ?? "").replace(/\s+/g, " ").trim();
            const best = label || txt;
            if (skip.some((s) => best.toLowerCase().includes(s))) return null;
            return { el, text: best, score: score(best) };
          })
          .filter((x): x is { el: Element; text: string; score: number } => x !== null && x.score > 0)
          .sort((a, b) => b.score - a.score);
        if (!scored.length) return null;
        (scored[0]!.el as HTMLElement).click();
        return scored[0]!.text.slice(0, 100);
      },
      AUTOCOMPLETE_SEL,
      pick,
      AUTOCOMPLETE_SKIP,
    );

    if (!picked) {
      const available = suggestions.slice(0, 5).join(" | ");
      throw new Error(`Suggestion matching "${pick}" not found. Available: ${available || "none"}`);
    }
    return { text: `Typed "${text}" and selected "${picked}"` };
  } finally {
    await (client as any).detach().catch(() => {});
  }
}
