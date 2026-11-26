import type { Locator } from "@playwright/test";

export function pasteText(editor: Locator, value: string) {
  return editor.evaluate((input, text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
    });
    // Browser engines differ on the constructor's clipboardData option for synthetic events.
    Object.defineProperty(event, "clipboardData", { value: clipboardData });
    return input.dispatchEvent(event);
  }, value);
}
