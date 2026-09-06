#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const clientPath = path.resolve(
  process.argv[2] ?? ".selah-test/selahmc-client-v8.3.3.js",
);
const client = fs.readFileSync(clientPath, "utf8");

function extractFunction(name) {
  const start = client.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} is present in the client`);
  const bodyStart = client.indexOf("{", start);
  let quote = "";
  let escaped = false;
  let depth = 0;
  for (let index = bodyStart; index < client.length; ++index) {
    const character = client[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "{") {
      ++depth;
    } else if (character === "}" && --depth === 0) {
      return client.slice(start, index + 1);
    }
  }
  assert.fail(`${name} has a complete function body`);
}

const minecraftRunTickSource = extractFunction("CYD");
const worldClientTickSource = extractFunction("Fd1");
const minecraft = {
  O: { kind: "multiplayer-world" },
  t: null,
  cn: false,
  e7: { kind: "entity-renderer" },
  bGu: 0,
};

const resumeOrder = [
  "$p", "w", "v", "u", "t", "s", "r", "q", "p", "o", "n", "m",
  "l", "k", "j", "i", "h", "g", "f", "e", "d", "c", "b", "a",
];
const resumedLocals = { $p: 27, a: minecraft };
let resumeIndex = 0;
let rendererUpdates = 0;
let finalTicks = 0;
const rendererBoundary = new Error("renderer-update-boundary");
const resumeStack = {
  l() {
    const name = resumeOrder[resumeIndex++];
    return Object.hasOwn(resumedLocals, name) ? resumedLocals[name] : null;
  },
  s() {
    throw new Error("the pre-player join gate must complete without suspending");
  },
};

const context = {
  B() {
    return false;
  },
  DI() {
    return resumeStack;
  },
  Dmj(renderer) {
    ++rendererUpdates;
    assert.equal(renderer, minecraft.e7);
    throw rendererBoundary;
  },
  FFy() {
    ++finalTicks;
    return 1234;
  },
  GOh(value) {
    assert.equal(value, minecraft);
  },
  Gs() {
    throw new Error("invalid TeaVM state");
  },
  Gt() {
    return true;
  },
};

vm.createContext(context);
vm.runInContext(minecraftRunTickSource, context);

assert.doesNotThrow(
  () => context.CYD(minecraft),
  "a multiplayer world does not tick until its local player is published",
);
assert.equal(rendererUpdates, 0, "the renderer is skipped during the join gap");
assert.equal(finalTicks, 1, "the frame still reaches the normal runTick epilogue");
assert.equal(minecraft.bGu, 1234, "the runTick epilogue publishes its timing state");

resumeIndex = 0;
minecraft.t = { kind: "local-player" };
assert.throws(
  () => context.CYD(minecraft),
  (error) => error === rendererBoundary,
  "once the local player exists, runTick resumes the original renderer path",
);
assert.equal(rendererUpdates, 1, "the ready world reaches EntityRenderer.updateRenderer");

function assertMinecraftResumeWaitsForPlayer({
  state,
  locals = {},
  expectedWorldTicks = 0,
  expectedCoordinateProjections = 0,
  message,
}) {
  const resumedMinecraft = {
    O: { kind: "multiplayer-world" },
    t: null,
    cn: false,
    bGu: 0,
  };
  const resumeLocals = {
    $p: state,
    a: resumedMinecraft,
    b: resumedMinecraft.O,
    ...locals,
  };
  let index = 0;
  let worldTicks = 0;
  let coordinateProjections = 0;
  let epilogueTicks = 0;
  const stack = {
    l() {
      const name = resumeOrder[index++];
      return Object.hasOwn(resumeLocals, name) ? resumeLocals[name] : null;
    },
    s() {
      throw new Error("the missing-player runTick path must not suspend");
    },
  };
  const resumeContext = {
    B() {
      return false;
    },
    DI() {
      return stack;
    },
    Fd1(world) {
      assert.equal(world, resumedMinecraft.O);
      ++worldTicks;
    },
    FFy() {
      ++epilogueTicks;
      return 5678;
    },
    G0W(value) {
      ++coordinateProjections;
      return Math.floor(value);
    },
    Gs() {
      throw new Error("invalid TeaVM state");
    },
    Gt() {
      return true;
    },
  };

  vm.createContext(resumeContext);
  vm.runInContext(minecraftRunTickSource, resumeContext);

  assert.doesNotThrow(() => resumeContext.CYD(resumedMinecraft), message);
  assert.equal(worldTicks, expectedWorldTicks, `${message}: expected world ticks`);
  assert.equal(
    coordinateProjections,
    expectedCoordinateProjections,
    `${message}: expected coordinate projections`,
  );
  assert.equal(epilogueTicks, 1, `${message}: reaches the normal epilogue`);
  assert.equal(
    resumedMinecraft.bGu,
    5678,
    `${message}: publishes the normal timing state`,
  );
}

assertMinecraftResumeWaitsForPlayer({
  state: 57,
  expectedWorldTicks: 1,
  message: "runTick waits if the player disappears while WorldClient.tick resumes",
});
assertMinecraftResumeWaitsForPlayer({
  state: 48,
  locals: { i: 12.75 },
  expectedCoordinateProjections: 1,
  message: "runTick waits if the player disappears after projecting player X",
});
assertMinecraftResumeWaitsForPlayer({
  state: 49,
  locals: { i: 64.25 },
  expectedCoordinateProjections: 1,
  message: "runTick waits if the player disappears after projecting player Y",
});

const worldClient = {
  a8U: { kind: "visible-chunks" },
  Bi: {
    t: null,
    w: { r3: 8 },
  },
};
const worldTickResumeOrder = [
  "$p", "r", "q", "p", "o", "n", "m", "l", "k", "j", "i", "h",
  "g", "f", "e", "d", "c", "b", "a",
];
const worldTickResumedLocals = {
  $p: 5,
  a: worldClient,
  b: worldClient.a8U,
};
let worldTickResumeIndex = 0;
let visibleChunkClears = 0;
const worldTickResumeStack = {
  l() {
    const name = worldTickResumeOrder[worldTickResumeIndex++];
    return Object.hasOwn(worldTickResumedLocals, name)
      ? worldTickResumedLocals[name]
      : null;
  },
  s() {
    throw new Error("the missing-player world tick must not suspend");
  },
};
const worldTickContext = {
  B() {
    return false;
  },
  DI() {
    return worldTickResumeStack;
  },
  Gs() {
    throw new Error("invalid TeaVM state");
  },
  Gt() {
    return true;
  },
  Hn(chunks) {
    assert.equal(chunks, worldClient.a8U);
    ++visibleChunkClears;
  },
};

vm.createContext(worldTickContext);
vm.runInContext(worldClientTickSource, worldTickContext);

assert.doesNotThrow(
  () => worldTickContext.Fd1(worldClient),
  "WorldClient.tick waits when its Minecraft instance has not published a player",
);
assert.equal(
  visibleChunkClears,
  1,
  "the world tick reaches the visible-chunk refresh boundary before waiting",
);

const coordinateWorldClient = {
  Bi: { t: null },
};
const coordinateResumeOrder = [
  "$p", "r", "q", "p", "o", "n", "m", "l", "k", "j", "i", "h",
  "g", "f", "e", "d", "c", "b", "a",
];
const coordinateResumedLocals = {
  $p: 6,
  a: coordinateWorldClient,
  f: 0,
};
let coordinateResumeIndex = 0;
let coordinateProjections = 0;
const coordinateResumeStack = {
  l() {
    const name = coordinateResumeOrder[coordinateResumeIndex++];
    return Object.hasOwn(coordinateResumedLocals, name)
      ? coordinateResumedLocals[name]
      : null;
  },
  s() {
    throw new Error("the disappearing-player coordinate refresh must not suspend");
  },
};
const coordinateWorldTickContext = {
  B() {
    return false;
  },
  DI() {
    return coordinateResumeStack;
  },
  G0W(value) {
    ++coordinateProjections;
    return Math.floor(value);
  },
  Gs() {
    throw new Error("invalid TeaVM state");
  },
  Gt() {
    return true;
  },
};

vm.createContext(coordinateWorldTickContext);
vm.runInContext(worldClientTickSource, coordinateWorldTickContext);

assert.doesNotThrow(
  () => coordinateWorldTickContext.Fd1(coordinateWorldClient),
  "WorldClient.tick waits if the player disappears between chunk-coordinate projections",
);
assert.equal(
  coordinateProjections,
  1,
  "the test reaches the TeaVM resume point between the X and Z player coordinates",
);

const activeChunk = { kind: "active-chunk" };
const previousActiveChunks = { kind: "previous-active-chunks" };
const lateWorldClient = {
  Bi: { t: null },
  V7: previousActiveChunks,
  Y: { kind: "random" },
};
const lateWorldTickResumeOrder = [
  "$p", "r", "q", "p", "o", "n", "m", "l", "k", "j", "i", "h",
  "g", "f", "e", "d", "c", "b", "a",
];
const lateWorldTickResumedLocals = {
  $p: 30,
  a: lateWorldClient,
  c: { kind: "sky-light" },
  d: 0,
  l: activeChunk,
  m: { kind: "block-pos" },
};
let lateWorldTickResumeIndex = 0;
let playerDistanceLookups = 0;
const nextChunkBoundary = new Error("next-chunk-boundary");
const unexpectedDistanceLookup = new Error("missing-player-distance-lookup");
const lateWorldTickResumeStack = {
  l() {
    const name = lateWorldTickResumeOrder[lateWorldTickResumeIndex++];
    return Object.hasOwn(lateWorldTickResumedLocals, name)
      ? lateWorldTickResumedLocals[name]
      : null;
  },
  s() {
    throw new Error("the disappearing-player world tick must not suspend");
  },
};
const lateWorldTickContext = {
  B() {
    return false;
  },
  DI() {
    return lateWorldTickResumeStack;
  },
  EjC() {
    ++playerDistanceLookups;
    throw unexpectedDistanceLookup;
  },
  FY0() {
    return 0;
  },
  GGA(chunks, chunk) {
    assert.equal(chunks, previousActiveChunks);
    assert.equal(chunk, activeChunk);
    throw nextChunkBoundary;
  },
  Gs() {
    throw new Error("invalid TeaVM state");
  },
  Gt() {
    return true;
  },
};

vm.createContext(lateWorldTickContext);
vm.runInContext(worldClientTickSource, lateWorldTickContext);

assert.throws(
  () => lateWorldTickContext.Fd1(lateWorldClient),
  (error) => error === nextChunkBoundary,
  "WorldClient.tick skips ambient distance work if the player disappears mid-tick",
);
assert.equal(
  playerDistanceLookups,
  0,
  "a missing player is never passed to the ambient distance calculation",
);

console.log("multiplayer world ticks wait for the local player lifecycle");
