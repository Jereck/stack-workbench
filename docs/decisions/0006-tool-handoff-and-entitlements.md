# ADR 0006 · Keep tool handoffs in the tab and resolve access at the app boundary

**Status** · Accepted

## Context

Engineers need to compare two decoded payloads or complete parsed sessions without exposing them during route navigation. Integration Compare also needs a Free production default while billing and authentication are separate work.

## Decision

The web app accepts typed handoff commands from Log Inspector and stages one copy per input slot and workflow in the current browser document. Users can stage both sides before opening the destination. Integration Compare consumes the inbox once. Source clearing drops pending copies and refresh resets both staged and imported data. Only a current successful parse can supply a complete session. The original log text and chosen format move together.

Central capability identifiers and entitlement snapshots live in the shared package. The server route resolves entitlement snapshots through a single source that currently returns Free. A future verified provider can supply the snapshot there. The development build offers an in-memory simulator that survives client navigation and resets on refresh. Production has no simulation controls or client entitlement override source.

Integration Compare uses the capability snapshot to choose available controls and worker operations. The worker restricts detected and selected input formats and strips gated comparison settings before running the engine. Treat client capability checks as commercial UX and assume users can tamper with browser execution.

## Consequences

Both tools keep their own UI and processing modules. Navigation can carry explicit local inputs without adding URLs, storage records, or upload routes. True subscription verification and billing can be added at the server entitlement source.
