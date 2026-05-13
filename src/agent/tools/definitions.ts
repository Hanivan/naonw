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
      required: ["selector"],
      properties: {
        selector: { type: "string", description: "CSS selector of the element to click" },
      },
    },
  },
  {
    name: "type",
    description: "Type text into an input field",
    parameters: {
      type: "object",
      required: ["selector", "text"],
      properties: {
        selector: { type: "string", description: "CSS selector of the input" },
        text: { type: "string", description: "Text to type" },
        clear: { type: "boolean", description: "Clear existing text first" },
      },
    },
  },
  {
    name: "typeAndSelect",
    description: "Type into an autocomplete/address input and select a suggestion from the dropdown list. Use for inputs with aria-autocomplete='list' or suggestion dropdowns (role='listbox'). Provide 'pick' to match and click a suggestion by text.",
    parameters: {
      type: "object",
      required: ["selector", "text"],
      properties: {
        selector: { type: "string", description: "CSS selector of the autocomplete input" },
        text: { type: "string", description: "Text to type (triggers suggestions)" },
        pick: { type: "string", description: "Partial text to match and click from suggestions list" },
      },
    },
  },
  {
    name: "select",
    description: "Select an option in a dropdown",
    parameters: {
      type: "object",
      required: ["selector", "value"],
      properties: {
        selector: { type: "string", description: "CSS selector of the select element" },
        value: { type: "string", description: "Value of the option to select" },
      },
    },
  },
  {
    name: "scroll",
    description: "Scroll the page up or down",
    parameters: {
      type: "object",
      required: ["direction"],
      properties: {
        direction: { type: "string", description: "Direction to scroll (up or down)" },
        amount: { type: "number", description: "Pixels to scroll (default 500)" },
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
    parameters: {
      type: "object",
      required: [],
      properties: {},
    },
  },
  {
    name: "solveCaptcha",
    description: "Take a screenshot of the reCAPTCHA challenge and extract the challenge description. Use this when a CAPTCHA is visible. Returns a screenshot and the challenge text so you can identify which tiles to select.",
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
      required: ["summary"],
      properties: {
        summary: { type: "string", description: "Summary of what was accomplished" },
      },
    },
  },
];
