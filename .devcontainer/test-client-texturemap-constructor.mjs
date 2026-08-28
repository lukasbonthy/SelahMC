#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const clientPath = path.resolve(
  process.argv[2] ?? ".selah-test/selahmc-client-v8.3.3.js",
);
const client = fs.readFileSync(clientPath, "utf8");
const index = fs.readFileSync(path.join(path.dirname(clientPath), "index.html"), "utf8");
const clientFingerprint = crypto.createHash("sha256").update(client).digest("hex").slice(0, 8);
const constructorMatch = client.match(/^function SD_BZY\([^\n]+$/m);
const deferredAtlasStart = client.indexOf("function SD_Dwf(");
const deferredAtlasEnd = client.indexOf("\nfunction ", deferredAtlasStart + 1);
const deferredAtlasSource =
  deferredAtlasStart >= 0 && deferredAtlasEnd >= 0
    ? client.slice(deferredAtlasStart, deferredAtlasEnd)
    : null;
const mipmapDiagnosticCall = "$rt_globals.__selahMipmapCrash(k,e,$$e)";
const mipmapCompatibilityDispatch =
  'if(typeof k.eos==="function"){k.eos(e);}else{Fv2(k,e);}';
const animationFrameDiagnosticCall =
  "$rt_globals.__selahAnimationFrameError(i&&i.eh?$rt_ustr(i.eh):null,{pendingTokenConflict:DM(IsX,P(-1)),runtimeReady:!!IoU,timeoutId:IsZ,vsyncEnabled:!!IoV,waiterPresent:IsY!==null})";
const atlasDiagnosticCall =
  "$rt_globals.__selahAtlasCrash(y&&y.eh?$rt_ustr(y.eh):null,{atlasPath:a.b7L?$rt_ustr(a.b7L):null,mipmapLevels:a.Qy})";

assert.ok(constructorMatch, "deferred TextureMap constructor SD_BZY is present");
assert.ok(deferredAtlasSource, "deferred TextureMap atlas loader SD_Dwf is present");
const clientScriptMatch = index.match(
  /src="selahmc-client-v8\.3\.3\.js\?v=([0-9a-f]{8})"/,
);
assert.equal(
  clientScriptMatch?.[1],
  clientFingerprint,
  "the page requests the exact atlas-fixed client instead of a cached older build",
);
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
assert.equal(
  client.split(animationFrameDiagnosticCall).length - 1,
  1,
  "the animation-frame catch reports the hidden exception and waiter state once",
);
assert.equal(
  client.split(atlasDiagnosticCall).length - 1,
  1,
  "the deferred stitcher catch reports the exact atlas failure once",
);

const atlasPrefixCalls = [];
const atlasPrefixBoundary = new Error("atlas-prefix-boundary");
const atlasPrefixContext = {
  B() {
    return false;
  },
  Ct7() {
    atlasPrefixCalls.push("custom-items");
  },
  DcY() {
    throw atlasPrefixBoundary;
  },
  DI() {
    throw new Error("TeaVM continuation stack should not be needed");
  },
  EBi() {
    atlasPrefixCalls.push("better-grass");
  },
  F6X() {
    atlasPrefixCalls.push("natural-textures");
  },
  FyK() {
    atlasPrefixCalls.push("texture-map");
  },
  Gks() {
    atlasPrefixCalls.push("texture-icons");
  },
  Gs() {
    throw new Error("invalid TeaVM state");
  },
  Gt() {
    return false;
  },
};
vm.createContext(atlasPrefixContext);
vm.runInContext(deferredAtlasSource, atlasPrefixContext);
let atlasPrefixError = null;
try {
  atlasPrefixContext.SD_Dwf({}, "resource-manager");
} catch (error) {
  atlasPrefixError = error;
}
assert.equal(
  atlasPrefixError,
  atlasPrefixBoundary,
  "the atlas probe reaches the texture-size boundary",
);
assert.deepEqual(
  atlasPrefixCalls,
  [
    "texture-map",
    "natural-textures",
    "texture-icons",
    "better-grass",
    "custom-items",
  ],
  "the deferred atlas runs every Tuff texture-registration hook before stitching",
);

const tuffSprite = { kind: "tuff-base-sprite" };
const spriteFrames = { kind: "decoded-frame-data" };
const textureMetadata = { kind: "texture-metadata" };
const spriteDispatchBoundary = new Error("sprite-dispatch-boundary");
const spriteDispatchCalls = [];
const resumeOrder = [
  "$p", "bi", "bh", "bg", "bf", "be", "bd", "bc", "bb", "ba",
  "z", "y", "x", "w", "v", "u", "t", "s", "r", "q", "p", "o",
  "n", "m", "l", "k", "j", "i", "h", "g", "f", "e", "d", "c",
  "b", "a",
];
const resumedLocals = {
  $p: 22,
  a: {},
  j: spriteFrames,
  n: tuffSprite,
  q: textureMetadata,
};
let resumeIndex = 0;
const resumeStack = {
  l() {
    const name = resumeOrder[resumeIndex++];
    return Object.hasOwn(resumedLocals, name) ? resumedLocals[name] : null;
  },
  s() {
    throw new Error("the sprite dispatch must not suspend");
  },
};
const atlasSpriteContext = {
  B() {
    return false;
  },
  Bb: class ConvertedRuntimeError extends Error {},
  Ci: class ConvertedResourceError extends Error {},
  DI() {
    return resumeStack;
  },
  Edo(sprite, frames, metadata) {
    spriteDispatchCalls.push([sprite, frames, metadata]);
    throw spriteDispatchBoundary;
  },
  F(error) {
    return error;
  },
  Gt() {
    return true;
  },
};
vm.createContext(atlasSpriteContext);
vm.runInContext(deferredAtlasSource, atlasSpriteContext);
let spriteDispatchError = null;
try {
  atlasSpriteContext.SD_Dwf({}, "resource-manager");
} catch (error) {
  spriteDispatchError = error;
}
assert.equal(
  spriteDispatchError,
  spriteDispatchBoundary,
  "a Tuff base sprite loads through Tuff's dispatcher instead of Alpha's missing virtual method",
);
assert.deepEqual(spriteDispatchCalls, [[tuffSprite, spriteFrames, textureMetadata]]);

const baseFrameData = { kind: "tuff-frame-zero" };
const frameUploadBoundary = new Error("frame-upload-boundary");
const frameDispatchCalls = [];
const frameResumedLocals = {
  $p: 72,
  a: { CV: 0 },
  be: tuffSprite,
  e: 0,
};
let frameResumeIndex = 0;
const frameResumeStack = {
  l() {
    const name = resumeOrder[frameResumeIndex++];
    return Object.hasOwn(frameResumedLocals, name)
      ? frameResumedLocals[name]
      : null;
  },
  s() {
    throw new Error("the frame dispatch must not suspend");
  },
};
const atlasFrameContext = {
  A3b() {
    return 16;
  },
  A4E(sprite, frameIndex) {
    frameDispatchCalls.push([sprite, frameIndex]);
    return baseFrameData;
  },
  A8R() {
    return 16;
  },
  B() {
    return false;
  },
  DI() {
    return frameResumeStack;
  },
  Evi() {
    return 0;
  },
  F(error) {
    return error;
  },
  FCL() {
    return 0;
  },
  Gn_(frameData) {
    assert.equal(frameData, baseFrameData);
    throw frameUploadBoundary;
  },
  Gt() {
    return true;
  },
  K: class ConvertedThrowable extends Error {},
};
vm.createContext(atlasFrameContext);
vm.runInContext(deferredAtlasSource, atlasFrameContext);
let frameUploadError = null;
try {
  atlasFrameContext.SD_Dwf({}, "resource-manager");
} catch (error) {
  frameUploadError = error;
}
assert.equal(
  frameUploadError,
  frameUploadBoundary,
  "a Tuff base sprite uploads frame zero through Tuff's frame-data dispatcher",
);
assert.deepEqual(frameDispatchCalls, [[tuffSprite, 0]]);

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
assert.equal(
  textureMap.E$,
  textureMap.uF,
  "Tuff and deferred atlas loaders share one animated-sprite list",
);
assert.equal(
  textureMap.KG,
  textureMap.Y3,
  "Tuff registration and deferred stitching share one registered-sprite map",
);
assert.equal(
  textureMap.cdi,
  textureMap.bFf,
  "Tuff lookups and deferred uploads share one uploaded-sprite map",
);
assert.equal(textureMap.b7L, "textures", "deferred texture base path is preserved");
const initializedMissingFrames = { kind: "initialized-missing-frames" };
textureMap.a7$.pf = initializedMissingFrames;
assert.equal(
  textureMap.by_?.pf,
  initializedMissingFrames,
  "Tuff initialization supplies frame zero to the deferred standard missing sprite",
);
assert.equal(
  textureMap.byw?.kind,
  "deferred-missing-sprite",
  "deferred PBR missing sprite is preserved",
);

console.log("deferred TextureMap constructor initializes both standard and deferred state");
