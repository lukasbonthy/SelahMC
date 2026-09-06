import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const loaderPath = new URL(
  "../dist/portable-cache/assets/selah-loader-v8.3.3.js",
  import.meta.url,
);

async function runLoader() {
  const source = await readFile(loaderPath, "utf8");
  const calls = [];
  const console = Object.fromEntries(
    ["log", "info", "warn", "error", "debug"].map((method) => [
      method,
      (...args) => calls.push(args.map(String).join(" ")),
    ]),
  );
  const window = {
    console,
    setTimeout() {},
    document: {
      readyState: "loading",
      addEventListener() {},
    },
    SelahDeferredRenderer: {
      setBootReady(value) {
        calls.push(["deferred", value]);
      },
    },
    SelahOptiFine: {
      setDeferredReady(value) {
        calls.push(["optifine", value]);
      },
    },
  };
  vm.runInNewContext(source, { window });
  return {
    calls,
    window,
    log(...args) {
      for (const method of ["info"]) {
        window.console[method](...args);
      }
    },
  };
}

test("deferred renderer remains closed until the client reports Finished loading", async () => {
  const { calls, window, log } = await runLoader();

  log("[PlatformRuntime] Loaded 14280 resources from EPKs");
  assert.equal(window.__selahDeferredBootReady, false);
  assert.deepEqual(calls, [
    "[PlatformRuntime] Loaded 14280 resources from EPKs",
  ]);

  log("[Selah]: Finalizing");
  assert.equal(window.__selahDeferredBootReady, false);

  log("[Selah]: Finished loading");
  assert.equal(window.__selahDeferredBootReady, true);
  assert.deepEqual(calls.slice(-3), [
    ["deferred", true],
    ["optifine", true],
    "[Selah]: Finished loading",
  ]);
});
