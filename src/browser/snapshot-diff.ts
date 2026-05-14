// src/browser/snapshot-diff.ts
import type { SnapshotNode } from "./snapshot.ts";

export interface SnapshotDiff {
  added: SnapshotNode[];
  changed: SnapshotNode[];
  removed: string[];
  compact: string;
}

function nodeChanged(a: SnapshotNode, b: SnapshotNode): boolean {
  return a.name !== b.name || a.value !== b.value || a.disabled !== b.disabled || a.focused !== b.focused;
}

export function diffSnapshots(
  prev: SnapshotNode[],
  next: SnapshotNode[],
  url?: string,
  title?: string,
): SnapshotDiff {
  const prevMap = new Map(prev.map((n) => [n.ref, n]));
  const nextMap = new Map(next.map((n) => [n.ref, n]));

  const added: SnapshotNode[] = [];
  const changed: SnapshotNode[] = [];
  const removed: string[] = [];

  for (const n of next) {
    const p = prevMap.get(n.ref);
    if (!p) added.push(n);
    else if (nodeChanged(p, n)) changed.push(n);
  }

  for (const p of prev) {
    if (!nextMap.has(p.ref)) removed.push(p.ref);
  }

  const lines: string[] = [];
  if (url) {
    const total = next.length;
    lines.push(`# ${title ?? ""} | ${url} | ${total} nodes | +${added.length} ~${changed.length} -${removed.length}`);
  }

  for (const n of added) {
    let line = `${n.ref}:${n.role}`;
    if (n.name) line += ` "${n.name}"`;
    if (n.value !== undefined) line += ` val="${n.value}"`;
    if (n.placeholder) line += ` placeholder="${n.placeholder}"`;
    line += " [+]";
    lines.push(line);
  }

  for (const n of changed) {
    let line = `${n.ref}:${n.role}`;
    if (n.name) line += ` "${n.name}"`;
    if (n.value !== undefined) line += ` val="${n.value}"`;
    line += " [~]";
    lines.push(line);
  }

  if (removed.length) lines.push(`# removed: ${removed.join(" ")}`);

  return { added, changed, removed, compact: lines.join("\n") };
}
