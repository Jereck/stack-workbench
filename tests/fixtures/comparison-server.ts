import { createServer } from "node:http";
import { resolve } from "node:path";
import { build } from "vite";

const entry = "/tests/fixtures/comparison-worker.html";

export async function serveComparisonFixture() {
  const bundle = await build({
    configFile: false,
    logLevel: "error",
    build: {
      write: false,
      modulePreload: false,
      rolldownOptions: { input: resolve("." + entry) },
    },
  });
  const files = new Map<string, string | Uint8Array>();
  for (const item of Array.isArray(bundle) ? bundle : [bundle]) {
    if ("output" in item)
      for (const file of item.output)
        files.set(
          "/" + file.fileName,
          file.type === "asset" ? file.source : file.code,
        );
  }
  if (!files.has(entry))
    throw new Error("The comparison worker fixture did not build.");
  const server = createServer((request, response) => {
    const path = request.url ?? "";
    const file = files.get(path);
    if (request.method !== "GET" || file === undefined) {
      response.writeHead(404).end();
      return;
    }
    response
      .writeHead(200, {
        "Content-Type":
          path === entry
            ? "text/html; charset=utf-8"
            : "text/javascript; charset=utf-8",
      })
      .end(file);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("The comparison worker fixture server did not start.");
  return {
    url: "http://127.0.0.1:" + address.port + entry,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
