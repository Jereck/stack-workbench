import { startComparison } from "../../tools/integration-compare/src/worker-client";
import type { ComparisonRequest } from "../../tools/integration-compare/src/worker-client";
import { proEntitlements } from "../../packages/shared/src/entitlements";

const compareFixture = (request: ComparisonRequest) =>
  startComparison(request, proEntitlements);

declare global {
  interface Window {
    startComparison: typeof compareFixture;
  }
}

window.startComparison = compareFixture;
