#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const clientPath = path.resolve(
  process.argv[2] ?? ".selah-test/selahmc-client-v8.3.3.js",
);
const client = fs.readFileSync(clientPath, "utf8");
const constructorMatch = client.match(/^function SD_BZY\([^\n]+$/m);
const mipmapDiagnosticCall = "$rt_globals.__selahMipmapCrash(k,e,$$e)";
const mipmapCompatibilityDispatch =
  'if(typeof k.eos==="function"){k.eos(e);}else{Fv2(k,e);}';

assert.ok(constructorMatch, "deferred TextureMap constructor SD_BZY is present");
assert.equal(
  client.split(mipmapDiagnosticCall).length - 1,
  1,
  "the mipmap catch reports the raw sprite failure exactly once",
);
assert.equal(
  client.split(mipmapCompatibilityDispatch).length - 1,
  1,
  "mipmap generation preserves PBR overrides and falls back to Tuff's base method",
);

const runMipmapDispatch = vm.runInNewContext(
  `(function(k,e,Fv2){${mipmapCompatibilityDispatch}})`,
);
const dispatchCalls = [];
runMipmapDispatch(
  { eos: (level) => dispatchCalls.push(["pbr", level]) },
  4,
  (_sprite, level) => dispatchCalls.push(["base", level]),
);
runMipmapDispatch(
  {},
  2,
  (_sprite, level) => dispatchCalls.push(["base", level]),
);
assert.deepEqual(dispatchCalls, [["pbr", 4], ["base", 2]]);

const context = {
  AJd() {},
  B() {
    return false;
  },
  Bx() {
    return { c: 0, kind: "list" };
  },
  C(id) {
    return `string-${id}`;
  },
  Cs() {
    return { kind: "map" };
  },
  DI() {
    throw new Error("TeaVM continuation stack should not be needed");
  },
  Gs() {
    throw new Error("invalid TeaVM state");
  },
  Gt() {
    return false;
  },
  HO_(name) {
    return { kind: "standard-missing-sprite", name };
  },
  LW() {},
  MyW: { dqn: "active-logger" },
  SD_AEz: function DeferredMissingSprite() {
    this.kind = "deferred-missing-sprite";
  },
  SD_BuI(sprite, name) {
    sprite.name = name;
  },
  SD_HNA(name) {
    return { kind: "deferred-standard-missing-sprite", name };
  },
  SD_LQF: null,
};

vm.createContext(context);
vm.runInContext(constructorMatch[0], context);

const textureMap = {
  a7$: null,
  bFf: null,
  ccL: null,
  Cq: null,
  ri: null,
  uF: null,
  Y3: null,
};
context.SD_BZY(textureMap, "textures");

assert.equal(textureMap.uF?.c, 0, "standard animated-sprite list is initialized");
assert.equal(textureMap.Y3?.kind, "map", "standard registered-sprite map is initialized");
assert.equal(textureMap.bFf?.kind, "map", "standard uploaded-sprite map is initialized");
assert.equal(
  textureMap.a7$?.kind,
  "standard-missing-sprite",
  "standard missing sprite is initialized",
);
assert.equal(textureMap.ccL, "textures", "standard texture base path is initialized");
assert.equal(textureMap.ri, null, "standard color framebuffer state is initialized");
assert.equal(textureMap.Cq, null, "standard material framebuffer state is initialized");
assert.equal(
  context.SD_LQF?.dqn,
  "active-logger",
  "deferred recoverable-error logging uses the initialized TextureMap logger",
);

assert.equal(textureMap.E$?.c, 0, "deferred animated-sprite list is preserved");
assert.equal(textureMap.KG?.kind, "map", "deferred registered-sprite map is preserved");
assert.equal(textureMap.cdi?.kind, "map", "deferred uploaded-sprite map is preserved");
assert.equal(textureMap.b7L, "textures", "deferred texture base path is preserved");
assert.equal(
  textureMap.by_?.kind,
  "deferred-standard-missing-sprite",
  "deferred standard missing sprite is preserved",
);
assert.equal(
  textureMap.byw?.kind,
  "deferred-missing-sprite",
  "deferred PBR missing sprite is preserved",
);

console.log("deferred TextureMap constructor initializes both standard and deferred state");
