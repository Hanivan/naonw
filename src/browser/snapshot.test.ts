import { test, expect } from "bun:test";
import { formatCompact } from "./snapshot.ts";
import type { SnapshotNode } from "./snapshot.ts";

function node(ref: string, role: string, name: string, extras: Partial<SnapshotNode> = {}): SnapshotNode {
  return { ref, role, name, depth: 0, backendNodeId: 1, ...extras };
}

test("formats basic node", () => {
  expect(formatCompact([node("e0", "button", "Submit")])).toBe('e0:button "Submit"');
});

test("omits name when empty", () => {
  expect(formatCompact([node("e0", "separator", "")])).toBe("e0:separator");
});

test("includes value", () => {
  const result = formatCompact([node("e1", "textbox", "Email", { value: "foo@bar.com" })]);
  expect(result).toBe('e1:textbox "Email" val="foo@bar.com"');
});

test("includes placeholder", () => {
  const result = formatCompact([node("e2", "textbox", "", { placeholder: "Enter email" })]);
  expect(result).toBe('e2:textbox placeholder="Enter email"');
});

test("includes testid", () => {
  const result = formatCompact([node("e3", "button", "Go", { testid: "submit-btn" })]);
  expect(result).toBe('e3:button "Go" testid="submit-btn"');
});

test("focused flag appended as *", () => {
  const result = formatCompact([node("e4", "button", "Go", { focused: true })]);
  expect(result).toBe('e4:button "Go" *');
});

test("disabled flag appended as -", () => {
  const result = formatCompact([node("e5", "button", "Go", { disabled: true })]);
  expect(result).toBe('e5:button "Go" -');
});

test("multiple nodes separated by newline", () => {
  const result = formatCompact([node("e0", "button", "A"), node("e1", "textbox", "B")]);
  expect(result).toBe('e0:button "A"\ne1:textbox "B"');
});

test("header included when url provided", () => {
  const result = formatCompact([node("e0", "button", "OK")], "https://example.com", "Test Page");
  expect(result).toStartWith("# Test Page | https://example.com | 1 nodes\n");
  expect(result).toContain('e0:button "OK"');
});

test("header with no title uses empty string", () => {
  const result = formatCompact([node("e0", "button", "OK")], "https://x.com");
  expect(result).toStartWith("#  | https://x.com | 1 nodes\n");
});

test("empty nodes list returns empty string", () => {
  expect(formatCompact([])).toBe("");
});
