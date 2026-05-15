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

export async function scroll(page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  const dir = (args.direction as string | undefined) ?? "down";
  const px = (args.px as number | undefined) ?? 500;
  const deltas: Record<string, { x: number; y: number }> = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };
  const delta = deltas[dir];
  if (!delta) throw new Error(`Invalid direction "${dir}". Use: up, down, left, right`);
  await page.mouse.wheel({ deltaX: delta.x * px, deltaY: delta.y * px });
  return { text: `Scrolled ${dir} ${px}px` };
}

export async function pressKey(page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  const keys = args.keys as string;
  for (const k of keys.split(" ").filter(Boolean)) {
    if (!k.includes("+")) {
      await page.keyboard.press(k as any);
      continue;
    }
    const parts = k.split("+");
    const modifiers = parts.slice(0, -1);
    const finalKey = parts.at(-1)!;
    for (const m of modifiers) await page.keyboard.down(m as any);
    await page.keyboard.press(finalKey as any);
    for (const m of [...modifiers].reverse()) await page.keyboard.up(m as any);
  }
  return { text: `Pressed key(s): ${keys}` };
}

export async function hover(page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  const x = args.x as number;
  const y = args.y as number;
  await page.mouse.move(x, y);
  return { text: `Hovered at (${x}, ${y})` };
}

export async function drag(page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  const x1 = args.x1 as number, y1 = args.y1 as number;
  const x2 = args.x2 as number, y2 = args.y2 as number;
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 10 });
  await page.mouse.up();
  return { text: `Dragged (${x1},${y1}) → (${x2},${y2})` };
}

export async function evaluate(page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  const code = args.code as string;
  const result = await page.evaluate(code);
  const out = result === undefined || result === null ? "" : (typeof result === "string" ? result : JSON.stringify(result));
  return { text: out || "null" };
}

export async function fill(page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  const fields = args.fields as Record<string, string>;
  const results: { filled: string[]; failed: string[] } = await page.evaluate((fields) => {
    const filled: string[] = [];
    const failed: string[] = [];
    const esc = (v: string) => typeof CSS !== "undefined" ? CSS.escape(v) : v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const find = (key: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null => {
      if (key.startsWith("#") || key.startsWith(".") || key.startsWith("[")) {
        try { return document.querySelector(key); } catch { return null; }
      }
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
              return label.querySelector("input,textarea,select") as HTMLInputElement | null;
            }
          }
          return null;
        })()
      );
    };
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
  if (results.failed.length) throw new Error(`Fields not found: ${results.failed.join(", ")}`);
  return { text: `Filled: ${results.filled.join(", ")}` };
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
