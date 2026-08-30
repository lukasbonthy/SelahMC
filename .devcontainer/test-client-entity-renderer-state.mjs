#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const clientPath = path.resolve(
  process.argv[2] ?? ".selah-test/selahmc-client-v8.3.3.js",
);
const client = fs.readFileSync(clientPath, "utf8");

function extractFunction(name, { optional = false } = {}) {
  const start = client.indexOf(`function ${name}(`);
  if (optional && start < 0) {
    return "";
  }
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

const sources = [
  extractFunction("AI$"),
  extractFunction("SD_TUFF_Cbx"),
  extractFunction("SD_B4P"),
  extractFunction("SD_aliasEntityRendererField", { optional: true }),
  extractFunction("SD_initDeferredEntityRendererState", { optional: true }),
  extractFunction("Cbx"),
  extractFunction("A1E"),
  extractFunction("Dmj"),
].filter(Boolean);

const updateBoundary = new Error("entity-renderer-update-boundary");
const textureManager = { kind: "texture-manager" };
const itemRenderer = { kind: "item-renderer" };

class MouseFilter {
  constructor() {
    this.da3 = 11;
    this.dfF = 12;
    this.dq7 = 13;
  }
}

class DynamicTexture {
  constructor() {
    this.cS2 = null;
  }
}

function makeFloatArray(length) {
  return { data: Array(length).fill(0) };
}

const context = {
  ABy() {},
  AJd() {},
  B() {
    return false;
  },
  BA: 0,
  Bi: makeFloatArray,
  Bn4: MouseFilter,
  BoL: class MapItemRenderer {},
  BUV: class GameOverlayFramebuffer {},
  By6: DynamicTexture,
  C(index) {
    return index === 7808 ? "lightMap" : `string-${index}`;
  },
  CE(x, y, z) {
    return { x, y, z };
  },
  CF1: Math.sqrt,
  Cej: class MatrixLike {},
  Cs() {
    return { kind: "list" };
  },
  D: function TeaVMObject() {},
  D7A() {
    return { kind: "matrix-source" };
  },
  D9X() {},
  Di() {
    return { kind: "tuff-render-view-state" };
  },
  DII() {
    throw updateBoundary;
  },
  DI() {
    throw new Error("the constructor and update paths must not suspend");
  },
  Dm() {
    return 0.5;
  },
  Ed: makeFloatArray,
  EQ2(manager, name, texture) {
    assert.equal(manager, textureManager);
    assert.equal(name, "lightMap");
    assert.ok(texture instanceof DynamicTexture);
    return { kind: "lightmap-location" };
  },
  EQl(length) {
    return { kind: "float-buffer", length };
  },
  Fbf() {},
  FFy() {
    return 1234;
  },
  FO: class Random {},
  FrJ() {},
  Gs() {
    throw new Error("invalid TeaVM state");
  },
  Gsr(texture) {
    texture.cS2 = makeFloatArray(256);
    return { kind: "dynamic-texture-handle" };
  },
  Gt() {
    return false;
  },
  HUA() {},
  P(value) {
    return value;
  },
  Ri: class DeferredSunVector {
    constructor() {
      this.gZ = 0;
      this.gM = 0;
      this.g0 = 0;
    }
  },
  SD_getEnabled() {
    return true;
  },
  T_: class IntegratedServerView {},
};

vm.createContext(context);
for (const source of sources) {
  vm.runInContext(source, context);
}

const minecraft = {
  Mj: itemRenderer,
  bG: textureManager,
  hl: null,
  t: { kind: "world" },
  w: { bWc: false },
};
const renderer = new context["AI$"]();

assert.doesNotThrow(
  () => context.Cbx(renderer, minecraft, { kind: "resource-manager" }),
  "the renderer constructor completes synchronously",
);

let updateError = null;
try {
  context.Dmj(renderer);
} catch (error) {
  updateError = error;
}
assert.equal(
  updateError,
  updateBoundary,
  "Tuff updateRenderer reaches its next boundary after resetting both mouse filters",
);
assert.deepEqual(
  [renderer.ca3?.da3, renderer.ca3?.dfF, renderer.ca3?.dq7],
  [0, 0, 0],
  "the canonical X-axis MouseFilter is initialized and reset",
);
assert.deepEqual(
  [renderer.cb6?.da3, renderer.cb6?.dfF, renderer.cb6?.dq7],
  [0, 0, 0],
  "the canonical Y-axis MouseFilter is initialized and reset",
);

renderer.cga = 1;
assert.equal(
  renderer.coF,
  1,
  "the deferred lightmap-dirty field writes through to Tuff's canonical state",
);
renderer.dY1 = 27;
assert.equal(
  renderer.bGW,
  27,
  "the deferred frame counter reads Tuff's canonical state",
);
assert.equal(
  renderer.bTd,
  renderer.cmv,
  "the deferred lightmap texture aliases Tuff's initialized texture",
);
assert.equal(
  renderer.cWv,
  renderer.d1k,
  "the deferred lightmap pixels alias Tuff's initialized pixel array",
);
assert.ok(renderer.bV5, "the deferred sun vector is initialized");
assert.deepEqual(
  [renderer.cK2, renderer.cK1, renderer.dqi],
  [0, 0, 0],
  "the deferred waving-block origin starts at Java's zero defaults",
);

console.log("EntityRenderer state is shared safely by Tuff and deferred code");
