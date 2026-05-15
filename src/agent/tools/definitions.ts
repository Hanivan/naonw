// src/agent/tools/definitions.ts
import type { ToolDefinition } from "@/ai/client.ts";

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "navigate",
    description: "Navigate to a URL",
    parameters: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string", description: "The URL to navigate to" },
      },
    },
  },
  {
    name: "click",
    description: "Click an element on the page",
    parameters: {
      type: "object",
      required: ["ref"],
      properties: {
        ref: { type: "string", description: "Element ref from the snapshot (e.g. e5)" },
      },
    },
  },
  {
    name: "type",
    description: "Type text into an input field",
    parameters: {
      type: "object",
      required: ["ref", "text"],
      properties: {
        ref: { type: "string", description: "Element ref from the snapshot" },
        text: { type: "string", description: "Text to type" },
        clear: { type: "boolean", description: "Clear existing text first" },
      },
    },
  },
  {
    name: "typeAndSelect",
    description: "Type into an autocomplete input and optionally select a suggestion. Step 1: omit pick to see suggestions. Step 2: include exact pick text from step 1.",
    parameters: {
      type: "object",
      required: ["ref", "text"],
      properties: {
        ref: { type: "string", description: "Element ref from the snapshot" },
        text: { type: "string", description: "Text to type (triggers suggestions)" },
        pick: { type: "string", description: "Exact suggestion text to click" },
      },
    },
  },
  {
    name: "select",
    description: "Select an option in a <select> dropdown",
    parameters: {
      type: "object",
      required: ["ref", "value"],
      properties: {
        ref: { type: "string", description: "Element ref from the snapshot" },
        value: { type: "string", description: "Option value or visible text to select" },
      },
    },
  },
  {
    name: "wait",
    description: "Wait for a specified duration",
    parameters: {
      type: "object",
      required: ["ms"],
      properties: {
        ms: { type: "number", description: "Milliseconds to wait" },
      },
    },
  },
  {
    name: "screenshot",
    description: "Take a screenshot of the current page and send it to the AI",
    parameters: { type: "object", required: [], properties: {} },
  },
  {
    name: "solveCaptcha",
    description: "Take a screenshot of the reCAPTCHA challenge and extract the challenge description.",
    parameters: { type: "object", required: [], properties: {} },
  },
  {
    name: "clickCaptchaTile",
    description: "Click one or more tiles in a reCAPTCHA image challenge by their numeric IDs (0-based, left-to-right top-to-bottom). Set verify=true to click the Verify/Next button after selecting.",
    parameters: {
      type: "object",
      required: ["ids"],
      properties: {
        ids: { type: "array", items: { type: "number" }, description: "Tile IDs to click (0–15 for 4×4 grid)" },
        verify: { type: "boolean", description: "Click the Verify/Next button after selecting tiles" },
      },
    },
  },
  {
    name: "scroll",
    description: "Scroll the page",
    parameters: {
      type: "object",
      required: [],
      properties: {
        direction: { type: "string", enum: ["up", "down", "left", "right"], description: "Scroll direction (default: down)" },
        px: { type: "number", description: "Pixels to scroll (default: 500)" },
      },
    },
  },
  {
    name: "key",
    description: "Press one or more keys. Supports combos like Meta+a, Ctrl+Shift+T. Multiple keys space-separated.",
    parameters: {
      type: "object",
      required: ["keys"],
      properties: {
        keys: { type: "string", description: "Keys to press, space-separated (e.g. 'Enter' or 'Ctrl+a Ctrl+c')" },
      },
    },
  },
  {
    name: "hover",
    description: "Hover (move mouse) over an element. Prefer ref over coords.",
    parameters: {
      type: "object",
      required: [],
      properties: {
        ref: { type: "string", description: "Element ref from snapshot (preferred)" },
        x: { type: "number", description: "X coord (only if no ref)" },
        y: { type: "number", description: "Y coord (only if no ref)" },
      },
    },
  },
  {
    name: "drag",
    description: "Drag between two elements or coordinates. Prefer fromRef/toRef over coords.",
    parameters: {
      type: "object",
      required: [],
      properties: {
        fromRef: { type: "string", description: "Source element ref (preferred)" },
        toRef: { type: "string", description: "Target element ref (preferred)" },
        x1: { type: "number" }, y1: { type: "number" },
        x2: { type: "number" }, y2: { type: "number" },
      },
    },
  },
  {
    name: "evaluate",
    description: "Evaluate JavaScript in the page context and return the result",
    parameters: {
      type: "object",
      required: ["code"],
      properties: {
        code: { type: "string", description: "JS expression or function body to evaluate" },
      },
    },
  },
  {
    name: "fill",
    description: "Fill multiple form fields at once by label, placeholder, name, aria-label, or CSS selector",
    parameters: {
      type: "object",
      required: ["fields"],
      properties: {
        fields: {
          type: "object",
          description: "Key-value pairs: field label/name/selector → value",
          // additionalProperties not in schema type — validated at runtime
        },
      },
    },
  },
  {
    name: "back",
    description: "Navigate back in browser history",
    parameters: { type: "object", required: [], properties: {} },
  },
  {
    name: "forward",
    description: "Navigate forward in browser history",
    parameters: { type: "object", required: [], properties: {} },
  },
  {
    name: "closePage",
    description: "Close the current browser tab/page",
    parameters: { type: "object", required: [], properties: {} },
  },
  {
    name: "closeBrowser",
    description: "Close the entire browser instance",
    parameters: { type: "object", required: [], properties: {} },
  },
  {
    name: "warn",
    description: "Surface a warning to the user without ending the task. Use for: headless browser blocking media playback, paywall encountered, region restriction detected, partial result, anything the user should know but does not stop progress.",
    parameters: {
      type: "object",
      required: ["message"],
      properties: {
        message: { type: "string", description: "Short user-facing warning (one sentence)" },
      },
    },
  },
  {
    name: "done",
    description: "Signal that the task is complete",
    parameters: {
      type: "object",
      required: ["summary", "lang"],
      properties: {
        summary: { type: "string", description: "Summary of what was accomplished" },
        lang: { type: "string", enum: ["en", "id"], description: "Language of the summary" },
      },
    },
  },
];
