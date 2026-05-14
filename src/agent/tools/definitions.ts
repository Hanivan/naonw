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
