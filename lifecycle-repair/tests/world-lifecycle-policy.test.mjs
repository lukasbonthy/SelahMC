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
    begin: context.SD_worldLifecycleBegin,
    clock,
    commit: context.SD_worldLifecycleCommit,
    diagnostics: context.window.SelahWorldLifecycle,
    logs,
    ready: context.SD_worldLifecycleReady,
    reset: context.SD_worldLifecycleReset,
  };
}

test("blocks world-only work when no world exists", async () => {
  const { diagnostics, ready } = await loadPolicy();
  const minecraft = { O: null, t: null, hl: null };

  assert.equal(ready(minecraft, "test.noWorld"), 0);
  assert.equal(diagnostics.phase, "NO_WORLD");
  assert.equal(diagnostics.blockedCalls, 0);
});

test("classifies a begun world without a player as joining", async () => {
  const { begin, diagnostics, ready } = await loadPolicy();
  const minecraft = { O: {}, t: null, hl: null };

  begin(minecraft, minecraft.O);
  assert.equal(ready(minecraft, "test.worldOnly"), 0);
  assert.equal(diagnostics.phase, "JOINING");
  assert.equal(diagnostics.blockedCalls, 1);
  assert.equal(diagnostics.lastGate, "test.worldOnly");
  assert.equal(diagnostics.joiningSince, 1_000);
});

test("does not infer readiness before the current generation commits", async () => {
  const { begin, commit, diagnostics, ready } = await loadPolicy();
  const player = { id: "player" };
  const camera = { id: "camera" };
  const minecraft = { O: {}, t: player, hl: camera };

  assert.equal(begin(minecraft, minecraft.O), 1);
  assert.equal(ready(minecraft, "test.uncommitted"), 0);
  assert.equal(diagnostics.phase, "JOINING");
  assert.equal(commit(minecraft), 1);
  assert.equal(ready(minecraft, "test.committed"), 1);
  assert.equal(diagnostics.phase, "READY");
  assert.equal(diagnostics.generation, 1);
  assert.equal(diagnostics.committedGeneration, 1);
});

test("never repairs a missing camera from the available player", async () => {
  const { begin, commit, diagnostics, ready } = await loadPolicy();
  const player = { id: "player" };
  const minecraft = { O: {}, t: player, hl: null };

  begin(minecraft, minecraft.O);
  assert.equal(commit(minecraft), 0);
  assert.equal(ready(minecraft, "test.cameraMissing"), 0);
  assert.equal(minecraft.hl, null);
  assert.equal(diagnostics.phase, "JOINING");
  assert.equal(diagnostics.blockedBy, "camera");
});

test("preserves an existing custom render camera", async () => {
  const { begin, commit, ready } = await loadPolicy();
  const player = { id: "player" };
  const camera = { id: "spectator-camera" };
  const minecraft = { O: {}, t: player, hl: camera };

  begin(minecraft, minecraft.O);
  assert.equal(commit(minecraft), 1);
  assert.equal(ready(minecraft, "test.customCamera"), 1);
  assert.equal(minecraft.hl, camera);
});

test("does not accept a camera when the player is missing", async () => {
  const { begin, commit, diagnostics, ready } = await loadPolicy();
  const camera = { id: "stale-camera" };
  const minecraft = { O: {}, t: null, hl: camera };

  begin(minecraft, minecraft.O);
  assert.equal(commit(minecraft), 0);
  assert.equal(ready(minecraft, "test.playerMissing"), 0);
  assert.equal(minecraft.hl, camera);
  assert.equal(diagnostics.phase, "JOINING");
  assert.equal(diagnostics.blockedBy, "player");
});

test("reset invalidates a committed generation without mutating Minecraft fields", async () => {
  const { begin, commit, diagnostics, ready, reset } = await loadPolicy();
  const player = { id: "player" };
  const camera = { id: "camera" };
  const minecraft = { O: {}, t: player, hl: camera };

  begin(minecraft, minecraft.O);
  assert.equal(commit(minecraft), 1);
  reset(minecraft);

  assert.equal(ready(minecraft, "test.afterReset"), 0);
  assert.equal(diagnostics.phase, "NO_WORLD");
  assert.equal(diagnostics.committedGeneration, 0);
  assert.equal(minecraft.t, player);
  assert.equal(minecraft.hl, camera);
});

test("throttles joining warnings and logs one recovery transition", async () => {
  const { begin, clock, commit, diagnostics, logs, ready } = await loadPolicy();
  const minecraft = { O: {}, t: null, hl: null };

  begin(minecraft, minecraft.O);
  assert.equal(ready(minecraft, "test.first"), 0);
  clock.now = 2_000;
  assert.equal(ready(minecraft, "test.second"), 0);
  clock.now = 6_000;
  assert.equal(ready(minecraft, "test.third"), 0);

  assert.equal(logs.warn.length, 2);
  assert.equal(diagnostics.blockedCalls, 3);
  assert.equal(diagnostics.lastGate, "test.third");

  minecraft.t = { id: "player" };
  minecraft.hl = { id: "camera" };
  assert.equal(commit(minecraft), 1);
  clock.now = 6_100;
  assert.equal(ready(minecraft, "test.recovered"), 1);
  assert.equal(ready(minecraft, "test.stillReady"), 1);
  assert.equal(logs.info.length, 1);
  assert.equal(diagnostics.phase, "READY");
});

test("readiness observations do not cancel a join before world publication", async () => {
  const { begin, commit, diagnostics, ready } = await loadPolicy();
  const world = {};
  const minecraft = { O: null, t: null, hl: null };
  const generation = begin(minecraft, world);
  assert.equal(ready(minecraft, "test.beforePublication"), 0);
  assert.equal(diagnostics.phase, "JOINING");
  minecraft.O = world;
  minecraft.t = {};
  minecraft.hl = minecraft.t;
  assert.equal(commit(minecraft, generation), 1);
  assert.equal(ready(minecraft), 1);
});

test("temporary missing fields block work without revoking an existing commit", async () => {
  const { begin, commit, ready } = await loadPolicy();
  const player = {};
  const minecraft = { O: {}, t: player, hl: player };
  begin(minecraft, minecraft.O);
  commit(minecraft);
  for (const field of ["O", "t", "hl"]) {
    const value = minecraft[field];
    minecraft[field] = null;
    assert.equal(ready(minecraft), 0);
    minecraft[field] = value;
    assert.equal(ready(minecraft), 1, `${field} restoration must recover`);
  }
});

test("a stale load cannot commit a newer join, even for the same world object", async () => {
  const { begin, commit, ready, reset } = await loadPolicy();
  const minecraft = { O: {}, t: {}, hl: {} };
  const stale = begin(minecraft, minecraft.O);
  const current = begin(minecraft, minecraft.O);
  assert.equal(commit(minecraft, stale), 0);
  assert.equal(ready(minecraft), 0);
  assert.equal(commit(minecraft, current), 1);
  reset(minecraft);
  assert.equal(commit(minecraft, current), 0);
  assert.equal(ready(minecraft), 0);
});

test("a null target cannot be committed with retained player fields", async () => {
  const { begin, commit } = await loadPolicy();
  const minecraft = { O: null, t: {}, hl: {} };
  const generation = begin(minecraft, null);
  assert.equal(commit(minecraft, generation), 0);
});
