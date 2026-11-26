export type CompareSide = "baseline" | "target";

/** Commands carry text only inside the current browser document. */
export type CompareTransfer = { side: CompareSide; text: string } & (
  | { kind: "payload"; format: "json" | "xml" | "soap" }
  | { kind: "session"; logFormat: string }
);

export type CompareSlot = Pick<CompareTransfer, "kind" | "side">;

export interface CompareHandoff {
  stage: (transfer: CompareTransfer) => boolean;
  staged: readonly CompareSlot[];
  clear: () => void;
  open: () => void;
  canStageSession: boolean;
}
