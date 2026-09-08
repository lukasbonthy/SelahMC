#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
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

function makeRuntime(extra = {}) {
  return {
    B() {
      return false;
    },
    DI() {
      throw new Error("the tested paths must not suspend");
    },
    Gs() {
      throw new Error("invalid TeaVM state");
    },
    Gt() {
      return false;
    },
    ...extra,
  };
}

test("deferred loadRenderers preserves canonical Tuff setup order", () => {
  const calls = [];
  const context = makeRuntime({
    SD_getEnabled() {
      return true;
    },
    SD_TUFF_DvM(renderGlobal) {
      calls.push("tuff");
      renderGlobal.canonicalWorldReady = true;
    },
    SD_Di4(renderGlobal) {
      assert.equal(
        renderGlobal.canonicalWorldReady,
        true,
        "the deferred sidecar is built only after canonical Tuff world state",
      );
      calls.push("deferred");
      renderGlobal.deferredWorldReady = true;
    },
  });
  vm.createContext(context);
  vm.runInContext(extractFunction("DvM"), context);

  const renderGlobal = {};
  context.DvM(renderGlobal);
  assert.deepEqual(
    calls,
    ["tuff", "deferred"],
    "deferred loadRenderers preserves Tuff setup before adding its sidecar",
  );
  assert.equal(renderGlobal.deferredWorldReady, true);
});

test("fresh RenderGlobal builds a deferred ViewFrustum sidecar", () => {
  const context = makeRuntime({
    ACx: function RenderChunkArray() {},
    Bd() {},
    D: function TeaVMObject() {},
    G(_type, length) {
      return { data: Array(Math.max(0, length)).fill(null) };
    },
    Hn() {},
    BM() {},
    SD_Dck() {},
    SD_IW() {},
    SD_LQe: null,
    LWD: {},
    LWE: {},
    V(left, right) {
      return Math.imul(left, right);
    },
  });
  vm.createContext(context);
  for (const name of ["AG2", "B04", "GGU", "SD_Di4"]) {
    vm.runInContext(extractFunction(name), context);
  }

  const renderGlobal = new context.AG2();
  renderGlobal.eb = { kind: "world" };
  renderGlobal.er = {
    hl: null,
    w: {
      K2: false,
      brb: false,
      nv: false,
      r3: -1,
    },
  };

  assert.doesNotThrow(
    () => context.SD_Di4(renderGlobal),
    "a fresh deferred RenderGlobal must not treat an absent Tuff field as an Alpha ViewFrustum",
  );
  assert.ok(renderGlobal.r4, "the deferred ViewFrustum sidecar is created");
  assert.equal(renderGlobal.r4.chE, renderGlobal);
  assert.equal(renderGlobal.r4.ceR, renderGlobal.eb);
  assert.equal(
    renderGlobal.bp8,
    2,
    "the deferred chunk refresh state is initialized after rebuilding the sidecar",
  );
});
