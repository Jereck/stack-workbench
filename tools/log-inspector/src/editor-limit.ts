import { MAX_INPUT_BYTES } from "@stack-workbench/log-parser";
import type { editor } from "monaco-editor/editor/editor.api.js";

const encoder = new TextEncoder();
const carriageReturns = /\r\n?/g;
// In Unicode mode a valid surrogate pair is a single code point outside this range.
const loneSurrogate = /[\uD800-\uDFFF]/u;

export function limitEditorEdits(
  model: editor.ITextModel,
  onLimit: () => void,
) {
  // Use the model entry point so paste, typing, and composition share one guard.
  const pushEdits = model.pushEditOperations.bind(model);
  // Monaco can otherwise append its own whitespace edits after input validation.
  model.updateOptions({ trimAutoWhitespace: false });
  let countedVersion = 0;
  let totalBytes = 0;
  let hasLoneSurrogate = false;

  model.pushEditOperations = (...args) => {
    const [selections, operations] = args;
    const edits = [];
    let nextCodeUnits = model.getValueLength(undefined, true);
    let insertedCodeUnits = 0;
    for (const operation of operations) {
      const range = model.validateRange(operation.range);
      const inserted = operation.text ?? "";
      // Even CRLF normalization cannot cut the input by more than half.
      if (inserted.length > MAX_INPUT_BYTES * 2) {
        onLimit();
        return selections;
      }
      const text = inserted.replace(carriageReturns, "\n");
      insertedCodeUnits += text.length;
      if (insertedCodeUnits > MAX_INPUT_BYTES) {
        onLimit();
        return selections;
      }
      nextCodeUnits += text.length - model.getValueLengthInRange(range);
      edits.push({ range, text });
    }
    if (nextCodeUnits > MAX_INPUT_BYTES) {
      onLimit();
      return selections;
    }

    // Recount after a file load, reset, or history operation. Ordinary typing
    // only reads and counts the pieces affected by the edit.
    if (countedVersion !== model.getVersionId()) {
      const text = model.getValue(undefined, true);
      totalBytes = encoder.encode(text).byteLength;
      hasLoneSurrogate = loneSurrogate.test(text);
      countedVersion = model.getVersionId();
    }
    let nextBytes = totalBytes;
    let nextHasLoneSurrogate = false;
    if (
      hasLoneSurrogate ||
      edits.some(({ text }) => loneSurrogate.test(text))
    ) {
      // An edit can join two unpaired surrogates. Count the combined text in this case.
      const current = model.getValue(undefined, true);
      const bomLength = current.length - model.getValueLength();
      const spans = edits
        .map(({ range, text }) => ({
          start: bomLength + model.getOffsetAt(range.getStartPosition()),
          end: bomLength + model.getOffsetAt(range.getEndPosition()),
          text,
        }))
        .sort((a, b) => a.end - b.end || a.start - b.start);
      const pieces: string[] = [];
      let offset = 0;
      for (const { start, end, text } of spans) {
        pieces.push(current.slice(offset, start), text);
        offset = end;
      }
      pieces.push(current.slice(offset));
      const candidate = pieces.join("");
      nextBytes = encoder.encode(candidate).byteLength;
      nextHasLoneSurrogate = loneSurrogate.test(candidate);
    } else {
      for (const { range, text } of edits) {
        nextBytes +=
          encoder.encode(text).byteLength -
          encoder.encode(model.getValueInRange(range)).byteLength;
      }
    }
    if (nextBytes > MAX_INPUT_BYTES) {
      onLimit();
      return selections;
    }

    const version = model.getVersionId();
    const result = pushEdits(...args);
    if (model.getVersionId() !== version) {
      totalBytes = nextBytes;
      hasLoneSurrogate = nextHasLoneSurrogate;
      countedVersion = model.getVersionId();
    }
    return result;
  };
}
