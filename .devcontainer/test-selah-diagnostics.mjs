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
  const beacons = [];
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
    navigator: {
      sendBeacon: (url, body) => {
        beacons.push({ url, body: String(body) });
        return true;
      },
      userAgent: "Test iPad"
    },
    setTimeout: (callback) => {
      callback();
      return 1;
    }
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = (name, listener) => listeners.set(name, listener);

  vm.runInNewContext(source, sandbox, { filename: "selah-diagnostics.js" });
  sandbox.console.error("atlas exploded", new Error("texture failure"));
  sandbox.__selahMipmapCrash({
    BL: { toString: () => "minecraft:blocks/bad_sprite" },
    ja: { data: [{ c: 1 }, { c: 1 }, { c: 1 }] },
    mK: 16,
    nP: 16,
    pf: { c: 1 }
  }, 4, new Error("mipmap exploded"));
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
  assert.equal(beacons.length, 1);
  assert.equal(beacons[0].url, "/__selah_diag");
  assert.match(beacons[0].body, /mipmap\.crash/);
  assert.match(beacons[0].body, /minecraft:blocks\/bad_sprite/);
  assert.match(beacons[0].body, /mipmap exploded/);
  assert.match(beacons[0].body, /\"mipmapLevel\":4/);
  assert.match(beacons[0].body, /\"pbrFrameCounts\":\[1,1,1\]/);
});
