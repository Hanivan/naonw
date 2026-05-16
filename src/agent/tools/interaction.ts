// src/agent/tools/interaction.ts
import type { Page } from "puppeteer-core";
import type { ToolResult } from "./types.ts";
import type { RefCache } from "@/browser/snapshot.ts";
import { fillFields, scrollPage, pressKeys, moveMouse, dragMouse, evaluateJs } from "@/browser/actions.ts";
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

function ellipsizeText(s: string, max = 60): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

/**
 * Resolve a node by backendNodeId, scroll into view, return its viewport-clamped center.
 * If still off-viewport after scroll, returns null → caller should use synthetic DOM action.
 */
async function resolveCenter(
  client: any,
  page: Page,
  backendNodeId: number,
): Promise<{ x: number; y: number } | null> {
  await client.send("DOM.scrollIntoViewIfNeeded", { backendNodeId }).catch(() => {});
  const { model } = await client.send("DOM.getBoxModel", { backendNodeId });
  const c = model.content as number[];
  const x = ((c[0] ?? 0) + (c[4] ?? 0)) / 2;
  const y = ((c[1] ?? 0) + (c[5] ?? 0)) / 2;
  const vp = page.viewport() ?? { width: 1280, height: 720 };
  if (x < 0 || y < 0 || x > vp.width || y > vp.height) return null;
  return { x, y };
}

export async function click(page: Page, args: Record<string, unknown>, refCache: RefCache): Promise<ToolResult> {
  const ref = args.ref as string;
  const backendNodeId = getBackendNodeId(ref, refCache);
  const client = await page.createCDPSession();
  try {
    // Bring element into the viewport — without this, off-screen elements
    // resolve to coords outside the viewport and the click lands on whatever
    // is actually visible at that screen position (often nothing).
    await (client as any).send("DOM.scrollIntoViewIfNeeded", { backendNodeId }).catch(() => {});

    const { model } = await (client as any).send("DOM.getBoxModel", { backendNodeId });
    const content = model.content as number[];
    let x = ((content[0] ?? 0) + (content[4] ?? 0)) / 2;
    let y = ((content[1] ?? 0) + (content[5] ?? 0)) / 2;

    const vp = page.viewport() ?? { width: 1280, height: 720 };
    if (x < 0 || y < 0 || x > vp.width || y > vp.height) {
      // Fallback: dispatch a synthetic click via DOM if still outside viewport
      const { object } = await (client as any).send("DOM.resolveNode", { backendNodeId });
      if (object?.objectId) {
        await (client as any).send("Runtime.callFunctionOn", {
          objectId: object.objectId,
          functionDeclaration: `function() { this.click?.(); this.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }`,
          returnByValue: true,
        });
        await (client as any).send("Runtime.releaseObject", { objectId: object.objectId }).catch(() => {});
        log.element(`click ${ref} (synthetic — off-viewport ${Math.round(x)},${Math.round(y)})`, "");
        await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
        return { text: `Clicked ${ref} (synthetic, was off-viewport)` };
      }
      // Clamp as last resort
      x = Math.max(1, Math.min(vp.width - 1, x));
      y = Math.max(1, Math.min(vp.height - 1, y));
    }

    await (client as any).send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await (client as any).send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    log.element(`click ${ref} @${Math.round(x)},${Math.round(y)}`, "");
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
  const backendNodeId = getBackendNodeId(ref, refCache);
  const client = await page.createCDPSession();
  try {
    await (client as any).send("DOM.scrollIntoViewIfNeeded", { backendNodeId }).catch(() => {});
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
    return {
      text: `Typed "${text}" into ${ref}`,
      displayText: `Typed "${ellipsizeText(text, 60)}" into ${ref}`,
    };
  } finally {
    await (client as any).detach().catch(() => {});
  }
}

export async function selectOption(page: Page, args: Record<string, unknown>, refCache: RefCache): Promise<ToolResult> {
  const ref = args.ref as string;
  const value = args.value as string;
  const backendNodeId = getBackendNodeId(ref, refCache);
  const client = await page.createCDPSession();
  try {
    await (client as any).send("DOM.scrollIntoViewIfNeeded", { backendNodeId }).catch(() => {});
    const { object } = await (client as any).send("DOM.resolveNode", { backendNodeId });
    if (!object?.objectId) throw new Error(`Could not resolve DOM node for ${ref}`);
    const { result } = await (client as any).send("Runtime.callFunctionOn", {
      objectId: object.objectId,
      functionDeclaration: `function(val) {
        const valLc = String(val).toLowerCase().trim();
        const opts = Array.from(this.options ?? []);
        const opt = opts.find(o => o.value === val)
          ?? opts.find(o => o.text.trim() === val)
          ?? opts.find(o => o.text.trim().toLowerCase() === valLc);
        if (!opt) {
          return { ok: false, available: opts.map(o => o.text.trim()).filter(Boolean).slice(0, 30) };
        }
        opt.selected = true;
        this.focus?.();
        this.dispatchEvent(new Event('input', { bubbles: true }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
        this.blur?.();
        return { ok: true, picked: opt.text.trim() || opt.value };
      }`,
      arguments: [{ value }],
      returnByValue: true,
    });
    await (client as any).send("Runtime.releaseObject", { objectId: object.objectId }).catch(() => {});
    const r = result?.value;
    if (!r?.ok) {
      const list = (r?.available ?? []).join(" | ");
      throw new Error(`Option "${value}" not found in ${ref}. Available: ${list || "(none)"}`);
    }
    return { text: `Selected "${r.picked}" in ${ref}` };
  } finally {
    await (client as any).detach().catch(() => {});
  }
}

export async function scroll(page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  const dir = (args.direction as string | undefined) ?? "down";
  const px = (args.px as number | undefined) ?? 500;
  await scrollPage(page, dir, px);
  return { text: `Scrolled ${dir} ${px}px` };
}

export async function pressKey(page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  const keys = args.keys as string;
  try {
    await pressKeys(page, keys);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/context was destroyed|Target closed|frame got detached|Session closed/i.test(msg)) throw e;
    // Key press triggered navigation — wait for it to settle, treat as success.
    await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {});
  }
  return { text: `Pressed key(s): ${keys}` };
}

async function pointFromArgs(
  page: Page,
  client: any,
  refArg: unknown,
  xArg: unknown,
  yArg: unknown,
  refCache: RefCache,
): Promise<{ x: number; y: number; label: string }> {
  if (typeof refArg === "string" && refArg) {
    const id = getBackendNodeId(refArg, refCache);
    const c = await resolveCenter(client, page, id);
    if (!c) throw new Error(`Element ${refArg} is off-viewport even after scroll`);
    return { x: c.x, y: c.y, label: refArg };
  }
  const x = Number(xArg);
  const y = Number(yArg);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("hover/drag requires either ref or numeric x/y");
  return { x, y, label: `(${x},${y})` };
}

export async function hover(page: Page, args: Record<string, unknown>, refCache: RefCache): Promise<ToolResult> {
  const client = await page.createCDPSession();
  try {
    const p = await pointFromArgs(page, client, args.ref, args.x, args.y, refCache);
    await moveMouse(page, p.x, p.y);
    return { text: `Hovered at ${p.label}` };
  } finally {
    await (client as any).detach().catch(() => {});
  }
}

export async function drag(page: Page, args: Record<string, unknown>, refCache: RefCache): Promise<ToolResult> {
  const client = await page.createCDPSession();
  try {
    const from = await pointFromArgs(page, client, args.fromRef ?? args.ref1, args.x1, args.y1, refCache);
    const to = await pointFromArgs(page, client, args.toRef ?? args.ref2, args.x2, args.y2, refCache);
    await dragMouse(page, from.x, from.y, to.x, to.y);
    return { text: `Dragged ${from.label} → ${to.label}` };
  } finally {
    await (client as any).detach().catch(() => {});
  }
}

function safeStringify(v: unknown): string {
  try { return typeof v === "string" ? v : JSON.stringify(v); }
  catch { return String(v); }
}

function summarizeForLog(v: unknown, raw: string): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `array (${v.length} item${v.length !== 1 ? "s" : ""}, ${raw.length} chars)`;
  if (typeof v === "object") {
    const keys = Object.keys(v as Record<string, unknown>);
    return `object (${keys.length} key${keys.length !== 1 ? "s" : ""}, ${raw.length} chars)`;
  }
  if (typeof v === "string") {
    return v.length > 200 ? `string (${v.length} chars): ${v.slice(0, 200)}…` : v;
  }
  return String(v);
}

export async function evaluate(page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  const code = args.code as string;
  const result = await Promise.race([
    evaluateJs(page, code),
    new Promise((_, rej) => setTimeout(() => rej(new Error("evaluate() timed out after 5s")), 5000)),
  ]);
  if (result === undefined || result === null) return { text: "null", displayText: "null" };
  const out = safeStringify(result);
  const text = out.length > 4000 ? out.slice(0, 4000) + " …(truncated)" : out;
  return { text, displayText: summarizeForLog(result, out) };
}

export async function fill(page: Page, args: Record<string, unknown>): Promise<ToolResult> {
  const fields = args.fields as Record<string, string>;
  const results = await fillFields(page, fields);
  // Trigger change + blur on all filled fields so frameworks (React/Vue/RHF) commit values.
  await page.evaluate((labels: string[]) => {
    for (const label of labels) {
      const el = document.activeElement as HTMLElement | null;
      const candidates = [
        ...Array.from(document.querySelectorAll<HTMLElement>(`[name="${label}"], [placeholder="${label}"], [aria-label="${label}"]`)),
        ...(el ? [el] : []),
      ];
      for (const c of candidates) {
        c.dispatchEvent(new Event("change", { bubbles: true }));
        c.dispatchEvent(new Event("blur", { bubbles: true }));
      }
    }
  }, results.filled).catch(() => {});
  if (results.failed.length) throw new Error(`Fields not found: ${results.failed.join(", ")}`);
  return { text: `Filled: ${results.filled.join(", ")}` };
}

const AUTOCOMPLETE_SKIP = ["loadingindicator", "masukkan sendiri", "enter address manually", "cannot find"];
const AUTOCOMPLETE_SEL = '[role="option"], [data-autocomplete-item]';

export async function typeAndSelect(page: Page, args: Record<string, unknown>, refCache: RefCache): Promise<ToolResult> {
  const ref = args.ref as string;
  const text = args.text as string;
  const pick = args.pick as string | undefined;
  const backendNodeId = getBackendNodeId(ref, refCache);
  const client = await page.createCDPSession();
  try {
    await (client as any).send("DOM.scrollIntoViewIfNeeded", { backendNodeId }).catch(() => {});
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
      return {
        text: `Typed "${text}" into ${ref}. ${hint}`,
        displayText: `Typed "${ellipsizeText(text, 40)}" into ${ref} — ${suggestions.length} suggestion${suggestions.length !== 1 ? "s" : ""}`,
      };
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
    return {
      text: `Typed "${text}" and selected "${picked}"`,
      displayText: `Typed "${ellipsizeText(text, 40)}" + picked "${ellipsizeText(picked, 40)}"`,
    };
  } finally {
    await (client as any).detach().catch(() => {});
  }
}
