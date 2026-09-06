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
  const timers = [];
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
    setTimeout: (callback, delay) => {
      timers.push({ callback, delay });
      return timers.length;
    }
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = (name, listener) => listeners.set(name, listener);

  vm.runInNewContext(source, sandbox, { filename: "selah-diagnostics.js" });
  assert.equal(typeof sandbox.__selahAtlasCrash, "function");
  assert.equal(typeof sandbox.__selahReportLoadStage, "function");
  assert.equal(typeof sandbox.__selahAnimationFrameError, "function");
  sandbox.__selahReportLoadStage(65, "Planting the cherry grove");
  sandbox.__selahReportLoadStage(65, "Planting the cherry grove");
  sandbox.__selahReportLoadStage(80, "Painting every block");
  assert.equal(timers.every(({ delay }) => delay === 20_000), true);
  for (const { callback } of timers) callback();
  sandbox.console.error("atlas exploded", new Error("texture failure"));
  const animationFrameState = {
    pendingTokenConflict: true,
    runtimeReady: true,
    timeoutId: 17,
    vsyncEnabled: true,
    waiterPresent: true
  };
  sandbox.__selahAnimationFrameError(
    "Already waiting for vsync!",
    animationFrameState
  );
  sandbox.__selahAnimationFrameError(
    "Already waiting for vsync!",
    animationFrameState
  );
  sandbox.__selahAtlasCrash("Unable to fit: bad_sprite - size: 32x4096", {
    atlasPath: "textures",
    mipmapLevels: 4
  });
  sandbox.__selahAtlasCrash("duplicate atlas report", {});
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
  const stageReports = requests.filter((request) =>
    String(request.options.body).includes("loader.stage")
  );
  const stallReports = requests.filter((request) =>
    String(request.options.body).includes("loader.stall")
  );
  assert.equal(stageReports.length, 3);
  assert.match(stageReports[0].options.body, /"progress":4/);
  assert.match(stageReports[1].options.body, /"progress":65/);
  assert.match(stageReports[2].options.body, /"progress":80/);
  assert.equal(stallReports.length, 1);
  assert.match(stallReports[0].options.body, /"progress":80/);
  assert.match(payload, /console\.error.*atlas exploded/);
  assert.match(payload, /window\.error.*uncaught atlas error/);
  assert.match(payload, /unhandledrejection.*rejected texture load/);
  assert.equal(nativeMessages.some(([method]) => method === "error"), true);
  assert.equal(requests.every((request) => request.url === "/__selah_diag"), true);
  assert.equal(beacons.length, 3);
  assert.equal(beacons[0].url, "/__selah_diag");
  assert.match(beacons[0].body, /animation-frame\.error/);
  assert.match(beacons[0].body, /Already waiting for vsync!/);
  assert.match(beacons[0].body, /\"pendingTokenConflict\":true/);
  assert.match(beacons[0].body, /\"timeoutId\":17/);
  assert.equal(beacons[1].url, "/__selah_diag");
  assert.match(beacons[1].body, /atlas\.crash/);
  assert.match(beacons[1].body, /Unable to fit: bad_sprite/);
  assert.match(beacons[1].body, /\"atlasPath\":\"textures\"/);
  assert.match(beacons[1].body, /\"mipmapLevels\":4/);
  assert.equal(beacons[2].url, "/__selah_diag");
  assert.match(beacons[2].body, /mipmap\.crash/);
  assert.match(beacons[2].body, /minecraft:blocks\/bad_sprite/);
  assert.match(beacons[2].body, /mipmap exploded/);
  assert.match(beacons[2].body, /\"mipmapLevel\":4/);
  assert.match(beacons[2].body, /\"pbrFrameCounts\":\[1,1,1\]/);
});
