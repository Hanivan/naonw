import { test, expect } from "bun:test";
import { diffSnapshots } from "./snapshot-diff.ts";
import type { SnapshotNode } from "./snapshot.ts";

function node(ref: string, role: string, name: string, extras: Partial<SnapshotNode> = {}): SnapshotNode {
  return { ref, role, name, depth: 0, backendNodeId: 1, ...extras };
}

test("empty diff when snapshots identical", () => {
  const nodes = [node("e0", "button", "Submit")];
  const diff = diffSnapshots(nodes, nodes);
  expect(diff.added).toHaveLength(0);
  expect(diff.changed).toHaveLength(0);
  expect(diff.removed).toHaveLength(0);
  expect(diff.compact).toBe("");
});

test("detects added node", () => {
  const prev = [node("e0", "button", "Submit")];
  const next = [node("e0", "button", "Submit"), node("e1", "alert", "Error")];
  const diff = diffSnapshots(prev, next);
  expect(diff.added).toHaveLength(1);
  expect(diff.added[0]!.ref).toBe("e1");
  expect(diff.compact).toContain("[+]");
});

test("detects removed node", () => {
  const prev = [node("e0", "button", "Submit"), node("e1", "spinner", "")];
  const next = [node("e0", "button", "Submit")];
  const diff = diffSnapshots(prev, next);
  expect(diff.removed).toEqual(["e1"]);
  expect(diff.compact).toContain("# removed: e1");
});

test("detects changed value", () => {
  const prev = [node("e0", "textbox", "Email", { value: "" })];
  const next = [node("e0", "textbox", "Email", { value: "foo@bar.com" })];
  const diff = diffSnapshots(prev, next);
  expect(diff.changed).toHaveLength(1);
  expect(diff.compact).toContain('[~]');
  expect(diff.compact).toContain('val="foo@bar.com"');
});

test("detects focused change", () => {
  const prev = [node("e0", "button", "Go")];
  const next = [node("e0", "button", "Go", { focused: true })];
  const diff = diffSnapshots(prev, next);
  expect(diff.changed).toHaveLength(1);
});

test("header included when url provided", () => {
  const prev = [node("e0", "button", "A")];
  const next = [node("e0", "button", "A"), node("e1", "link", "B")];
  const diff = diffSnapshots(prev, next, "https://example.com", "Page");
  expect(diff.compact).toMatch(/^# Page \| https:\/\/example\.com \| 2 nodes \| \+1 ~0 -0/);
});

test("unchanged nodes not in compact output", () => {
  const nodes = [node("e0", "button", "A"), node("e1", "button", "B")];
  const next = [...nodes, node("e2", "link", "C")];
  const diff = diffSnapshots(nodes, next);
  expect(diff.compact).not.toContain("e0");
  expect(diff.compact).not.toContain("e1");
  expect(diff.compact).toContain("e2");
});
