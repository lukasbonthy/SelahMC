import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const scriptUrl = new URL("./selah-diagnostics.js", import.meta.url);

test("browser diagnostics report console and uncaught failures", async () => {
  let source = "";
  try {
    source = await readFile(scriptUrl, "utf8");
  } catch {
    assert.fail("browser diagnostics are not implemented");
  }

  const requests = [];
  const listeners = new Map();
  const nativeMessages = [];
  const sandbox = {
    Date,
    Error,
    JSON,
    Promise,
    String,
    URL,
    console: {
      debug: (...args) => nativeMessages.push(["debug", args]),
      error: (...args) => nativeMessages.push(["error", args]),
      info: (...args) => nativeMessages.push(["info", args]),
      log: (...args) => nativeMessages.push(["log", args]),
      warn: (...args) => nativeMessages.push(["warn", args])
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true };
    },
    location: { href: "https://example.test/" },
    navigator: { userAgent: "Test iPad" },
    setTimeout: (callback) => {
      callback();
      return 1;
    }
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = (name, listener) => listeners.set(name, listener);

  vm.runInNewContext(source, sandbox, { filename: "selah-diagnostics.js" });
  sandbox.console.error("atlas exploded", new Error("texture failure"));
  listeners.get("error")({
    message: "uncaught atlas error",
    filename: "selahmc-client.js",
    lineno: 1,
    colno: 2,
    error: new Error("uncaught texture failure")
  });
  listeners.get("unhandledrejection")({ reason: new Error("rejected texture load") });
  await Promise.resolve();
  await Promise.resolve();

  const payload = requests.map((request) => String(request.options.body)).join("\n");
  assert.match(payload, /console\.error.*atlas exploded/);
  assert.match(payload, /window\.error.*uncaught atlas error/);
  assert.match(payload, /unhandledrejection.*rejected texture load/);
  assert.equal(nativeMessages.some(([method]) => method === "error"), true);
  assert.equal(requests.every((request) => request.url === "/__selah_diag"), true);
});
