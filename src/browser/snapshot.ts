import type { Page } from "puppeteer-core";

export interface SnapshotNode {
  ref: string;
  role: string;
  name: string;
  value?: string;
  depth: number;
  backendNodeId: number;
  focused?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  placeholder?: string;
  testid?: string;
}

export interface SnapshotResult {
  nodes: SnapshotNode[];
  compact: string;
  url: string;
  title: string;
  refCache: RefCache;
}

export type RefCache = Map<string, number>;

export const SKIP_ROLES = new Set([
  "none", "generic", "InlineTextBox",
  // Structural wrappers; their children carry the info.
  "tablist", "tabpanel", "tooltip", "presentation", "LineBreak", "paragraph",
]);

// Landmark / container roles to skip ONLY when they have no accessible name.
// (Named ones — e.g. <nav aria-label="Main"> — still carry useful semantics.)
export const SKIP_IF_UNNAMED = new Set([
  "list", "listitem", "navigation", "search", "banner",
  "complementary", "contentinfo", "region", "group", "form",
]);
export const INTERACTIVE_ROLES = new Set([
  "button", "link", "textbox", "combobox", "listbox", "option",
  "checkbox", "radio", "menuitem", "tab", "searchbox", "spinbutton",
  "slider", "switch", "treeitem", "gridcell",
]);

export function formatCompact(nodes: SnapshotNode[], url?: string, title?: string): string {
  const lines = nodes.filter((n) => !n.hidden).map((n) => {
    let line = `${n.ref}:${n.role}`;
    if (n.name) line += ` "${n.name}"`;
    if (n.value !== undefined) line += ` val="${n.value}"`;
    if (n.placeholder) line += ` placeholder="${n.placeholder}"`;
    if (n.testid) line += ` testid="${n.testid}"`;
    if (n.focused) line += " *";
    if (n.disabled) line += " -";
    return line;
  });
  if (url) {
    const header = `# ${title ?? ""} | ${url} | ${nodes.length} nodes`;
    return [header, ...lines].join("\n");
  }
  return lines.join("\n");
}

interface RawAXNode {
  nodeId: string;
  ignored?: boolean;
  role?: { type: string; value: string };
  name?: { type: string; value: string };
  value?: { type: string; value: string | number | boolean };
  properties?: Array<{ name: string; value: { type: string; value: unknown } }>;
  childIds?: string[];
  backendDOMNodeId?: number;
}

function isContextDestroyed(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /context was destroyed|Target closed|frame got detached|Session closed/i.test(msg);
}

export async function takeSnapshot(page: Page): Promise<SnapshotResult> {
  try {
    return await snapshotOnce(page);
  } catch (e) {
    if (!isContextDestroyed(e)) throw e;
    // Mid-navigation — let it settle, then retry once.
    await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 200));
    return await snapshotOnce(page);
  }
}

async function snapshotOnce(page: Page): Promise<SnapshotResult> {
  const client = await page.createCDPSession();
  try {
    const { nodes: raw } = await (client as any).send("Accessibility.getFullAXTree", { pierce: true });
    const rawNodes = raw as RawAXNode[];

    const nodeMap = new Map<string, RawAXNode>();
    for (const n of rawNodes) nodeMap.set(n.nodeId, n);

    const childIdSet = new Set(rawNodes.flatMap((n) => n.childIds ?? []));
    const roots = rawNodes.filter((n) => !childIdSet.has(n.nodeId));

    const nodes: SnapshotNode[] = [];
    const refCache: RefCache = new Map();
    let refId = 0;

    function walk(ax: RawAXNode, depth: number, parentLabels: string[] = []): void {
      if (ax.ignored) {
        for (const id of ax.childIds ?? []) {
          const child = nodeMap.get(id);
          if (child) walk(child, depth, parentLabels);
        }
        return;
      }

      const role = ax.role?.value ?? "";
      const axName = ax.name?.value ?? "";

      // Drop StaticText whose text duplicates an ancestor's name OR value,
      // or that is a pure separator/punctuation noise (e.g. " - ", " • ", "|").
      if (role === "StaticText" && axName) {
        const t = axName.trim();
        if (parentLabels.some((l) => l === t)) return;
        // ≤3 chars and contains no letter/digit → separator noise
        if (t.length <= 3 && !/[\p{L}\p{N}]/u.test(t)) return;
      }

      // Decorative images (no alt text) carry no info for the agent.
      if (role === "image" && !axName) return;

      // Skip landmark wrappers when they have no name — their children carry the info.
      if (SKIP_IF_UNNAMED.has(role) && !axName) {
        for (const id of ax.childIds ?? []) {
          const child = nodeMap.get(id);
          if (child) walk(child, depth, parentLabels);
        }
        return;
      }

      if (SKIP_ROLES.has(role)) {
        for (const id of ax.childIds ?? []) {
          const child = nodeMap.get(id);
          if (child) walk(child, depth, parentLabels);
        }
        return;
      }

      const props = ax.properties ?? [];
      const getProp = (name: string) => props.find((p) => p.name === name)?.value?.value;
      if (getProp("hidden") === true) return;

      const ref = `e${refId++}`;
      const backendNodeId = ax.backendDOMNodeId ?? 0;
      const rawValue = ax.value?.value;

      const node: SnapshotNode = {
        ref,
        role,
        name: ax.name?.value ?? "",
        depth,
        backendNodeId,
        value: rawValue !== undefined ? String(rawValue) : undefined,
        focused: getProp("focused") === true ? true : undefined,
        disabled: getProp("disabled") === true ? true : undefined,
      };

      if (backendNodeId > 0) refCache.set(ref, backendNodeId);
      nodes.push(node);

      const childLabels: string[] = [];
      if (axName) childLabels.push(axName.trim());
      if (rawValue !== undefined) childLabels.push(String(rawValue).trim());
      const nextLabels = childLabels.length ? childLabels : parentLabels;
      for (const id of ax.childIds ?? []) {
        const child = nodeMap.get(id);
        if (child) walk(child, depth + 1, nextLabels);
      }
    }

    for (const root of roots) walk(root, 0);

    await enrichInteractive(client, nodes);

    const url = page.url();
    const title = await page.title();
    const compact = formatCompact(nodes, url, title);

    return { nodes, compact, url, title, refCache };
  } finally {
    await (client as any).detach().catch(() => {});
  }
}

async function enrichInteractive(client: any, nodes: SnapshotNode[]): Promise<void> {
  const targets = nodes.filter((n) => n.backendNodeId > 0 && INTERACTIVE_ROLES.has(n.role));

  await Promise.all(
    targets.map(async (node) => {
      try {
        const { object } = await client.send("DOM.resolveNode", { backendNodeId: node.backendNodeId });
        if (!object?.objectId) return;

        const { result } = await client.send("Runtime.callFunctionOn", {
          objectId: object.objectId,
          functionDeclaration: `function() {
            return {
              placeholder: this.getAttribute('placeholder') || this.placeholder || '',
              testid: this.getAttribute('data-testid') || this.getAttribute('data-test-id') ||
                      this.getAttribute('data-test') || this.getAttribute('data-qa') ||
                      this.getAttribute('testid') || '',
            };
          }`,
          returnByValue: true,
        });

        if (result?.value) {
          if (result.value.placeholder) node.placeholder = result.value.placeholder;
          if (result.value.testid) node.testid = result.value.testid;
        }

        await client.send("Runtime.releaseObject", { objectId: object.objectId }).catch(() => {});
      } catch {
        // node may have been removed from DOM — skip silently
      }
    }),
  );
}
