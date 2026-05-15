// src/browser/actions.ts
// Shared low-level browser primitives used by both the agent tools and the naonw CLI.
import type { Page } from "puppeteer-core";

// ── Snap ─────────────────────────────────────────────────────────────────────

export interface SnapElement {
  index: number;
  role: string;
  name: string;
  x: number;
  y: number;
  state: Record<string, unknown>;
}

export const SNAP_ROLES = new Set([
  "link", "button", "textbox", "combobox", "searchbox",
  "checkbox", "radio", "switch", "slider", "spinbutton",
  "tab", "menuitem", "menuitemcheckbox", "menuitemradio",
  "option", "treeitem", "select", "listbox", "gridcell",
]);

const SNAP_STATE_PROPS = new Set(["haspopup", "expanded", "checked", "selected", "disabled", "pressed"]);

export async function snapPage(page: Page): Promise<SnapElement[]> {
  const client = await page.createCDPSession();
  try {
    const vp = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    const { nodes } = await (client as any).send("Accessibility.getFullAXTree") as { nodes: any[] };
    const interesting = nodes.filter(n => !n.ignored && n.backendDOMNodeId && SNAP_ROLES.has(n.role?.value));
    const elements = (await Promise.all(interesting.map(async (n, i): Promise<SnapElement | null> => {
      try {
        const { model } = await (client as any).send("DOM.getBoxModel", { backendNodeId: n.backendDOMNodeId });
        if (!model || model.width === 0 || model.height === 0) return null;
        const [x1, y1, x2, , , y3] = model.border as number[];
        const x = Math.round(((x1 ?? 0) + (x2 ?? 0)) / 2);
        const y = Math.round(((y1 ?? 0) + (y3 ?? 0)) / 2);
        if (x < 0 || x > vp.width || y < 0 || y > vp.height + 5) return null;
        const state = (n.properties ?? []).reduce((acc: Record<string, unknown>, p: any) => {
          if (SNAP_STATE_PROPS.has(p.name)) acc[p.name] = p.value?.value;
          return acc;
        }, {});
        const name: string = n.name?.value || (n.role?.value === "link"
          ? (() => { try { return new URL((n.properties ?? []).find((p: any) => p.name === "url")?.value?.value ?? "").pathname; } catch { return ""; } })()
          : "");
        return { index: i, role: n.role?.value as string, name, x, y, state };
      } catch { return null; }
    }))).filter((el): el is SnapElement => el !== null).sort((a, b) => a.y - b.y || a.x - b.x);
    return elements;
  } finally {
    await (client as any).detach().catch(() => {});
  }
}

// ── Form fill ─────────────────────────────────────────────────────────────────

export async function fillFields(
  page: Page,
  fields: Record<string, string>,
): Promise<{ filled: string[]; failed: string[] }> {
  return page.evaluate((fields) => {
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
}

// ── Scroll ───────────────────────────────────────────────────────────────────

export async function scrollPage(page: Page, direction: string, px: number): Promise<void> {
  const deltas: Record<string, { x: number; y: number }> = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
    left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };
  const delta = deltas[direction];
  if (!delta) throw new Error(`Invalid direction "${direction}". Use: up, down, left, right`);
  await page.mouse.wheel({ deltaX: delta.x * px, deltaY: delta.y * px });
}

// ── Keyboard ─────────────────────────────────────────────────────────────────

export async function pressKeys(page: Page, keys: string): Promise<void> {
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
}

// ── Mouse ─────────────────────────────────────────────────────────────────────

export async function moveMouse(page: Page, x: number, y: number): Promise<void> {
  await page.mouse.move(x, y);
}

export async function dragMouse(
  page: Page, x1: number, y1: number, x2: number, y2: number,
): Promise<void> {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 10 });
  await page.mouse.up();
}

// ── JS eval ──────────────────────────────────────────────────────────────────

export async function evaluateJs(page: Page, code: string): Promise<unknown> {
  return page.evaluate(code);
}
