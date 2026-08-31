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

console.log("multiplayer world ticks wait for the local player lifecycle");
