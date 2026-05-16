export interface ToolResult {
  /** Sent to the AI as the tool result. Should be complete and unabridged. */
  text: string;
  /** Optional shorter version shown in the log panel. Falls back to `text` if absent. */
  displayText?: string;
  imageBase64?: string;
  lang?: string;
  closeAction?: "page" | "browser";
}
