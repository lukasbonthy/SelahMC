import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const policyUrl = new URL("../src/world-lifecycle-barrier.js", import.meta.url);

async function loadPolicy(initialNow = 1_000) {
  const source = await readFile(policyUrl, "utf8");
  const clock = { now: initialNow };
  const logs = { info: [], warn: [] };
  const context = {
    Date: { now: () => clock.now },
    console: {
      info: (...args) => logs.info.push(args),
      warn: (...args) => logs.warn.push(args),
    },
    window: {},
  };

  vm.runInNewContext(source, context, {
    filename: "world-lifecycle-barrier.js",
  });

  return {
    clock,
    diagnostics: context.window.SelahWorldLifecycle,
    logs,
    ready: context.SD_worldLifecycleReady,
  };
}

test("blocks world-only work when no world exists", async () => {
  const { diagnostics, ready } = await loadPolicy();
  const minecraft = { O: null, t: null, hl: null };

  assert.equal(ready(minecraft, "test.noWorld"), 0);
  assert.equal(diagnostics.phase, "NO_WORLD");
  assert.equal(diagnostics.blockedCalls, 0);
});

test("classifies a published world without a player as joining", async () => {
  const { diagnostics, ready } = await loadPolicy();
  const minecraft = { O: {}, t: null, hl: null };

  assert.equal(ready(minecraft, "test.worldOnly"), 0);
  assert.equal(diagnostics.phase, "JOINING");
  assert.equal(diagnostics.blockedCalls, 1);
  assert.equal(diagnostics.lastGate, "test.worldOnly");
  assert.equal(diagnostics.joiningSince, 1_000);
});

test("repairs a missing camera from the available player", async () => {
  const { diagnostics, ready } = await loadPolicy();
  const player = { id: "player" };
  const minecraft = { O: {}, t: player, hl: null };

  assert.equal(ready(minecraft, "test.cameraRepair"), 1);
  assert.equal(minecraft.hl, player);
  assert.equal(diagnostics.phase, "READY");
});

test("preserves an existing custom render camera", async () => {
  const { ready } = await loadPolicy();
  const player = { id: "player" };
  const camera = { id: "spectator-camera" };
  const minecraft = { O: {}, t: player, hl: camera };

  assert.equal(ready(minecraft, "test.customCamera"), 1);
  assert.equal(minecraft.hl, camera);
});

test("does not accept a camera when the player is missing", async () => {
  const { diagnostics, ready } = await loadPolicy();
  const camera = { id: "stale-camera" };
  const minecraft = { O: {}, t: null, hl: camera };

  assert.equal(ready(minecraft, "test.playerMissing"), 0);
  assert.equal(minecraft.hl, camera);
  assert.equal(diagnostics.phase, "JOINING");
});

test("throttles joining warnings and logs one recovery transition", async () => {
  const { clock, diagnostics, logs, ready } = await loadPolicy();
  const minecraft = { O: {}, t: null, hl: null };

  assert.equal(ready(minecraft, "test.first"), 0);
  clock.now = 2_000;
  assert.equal(ready(minecraft, "test.second"), 0);
  clock.now = 6_000;
  assert.equal(ready(minecraft, "test.third"), 0);

  assert.equal(logs.warn.length, 2);
  assert.equal(diagnostics.blockedCalls, 3);
  assert.equal(diagnostics.lastGate, "test.third");

  minecraft.t = { id: "player" };
  clock.now = 6_100;
  assert.equal(ready(minecraft, "test.recovered"), 1);
  assert.equal(ready(minecraft, "test.stillReady"), 1);
  assert.equal(logs.info.length, 1);
  assert.equal(diagnostics.phase, "READY");
});
