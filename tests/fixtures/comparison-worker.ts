import { startComparison } from "../../tools/integration-compare/src/worker-client";

declare global {
  interface Window {
    startComparison: typeof startComparison;
  }
}

window.startComparison = startComparison;
