# Test fixtures

[`log-inspector.ts`](log-inspector.ts) contains synthetic application events, fictitious secrets, and inert security test strings. Its network canaries use the reserved `example.invalid` domain. The browser benchmark generates synthetic events in memory.

[`integration-compare.ts`](integration-compare.ts) contains synthetic HTTP and SOAP examples and an inert DTD canary. [`comparison-worker.html`](comparison-worker.html) provides a loopback-only browser harness for the real comparison worker. The benchmark generates larger synthetic pairs in memory.

Use synthetic fixtures by default. Keep each fixture small and document what case it covers. Public fixtures require a compatible license and a record of source, license, and attribution alongside the fixture. Never copy customer data, real credentials, or captured production traffic into tests. Inline small synthetic examples when a separate file adds no value.

[`comparison-session.ts`](comparison-session.ts) creates synthetic request and response fragments with environment-specific identifiers, optional missing responses, and recorded durations.
