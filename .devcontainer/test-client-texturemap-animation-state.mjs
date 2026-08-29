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
  const end = client.indexOf("\nfunction ", start + 1);
  assert.ok(start >= 0 && end > start, `${name} is present in the client`);
  return client.slice(start, end);
}

const deferredAtlasSource = extractFunction("SD_Dwf");
const textureTickSource = extractFunction("Ep1");
const textureDeleteSource = extractFunction("E0c");

const colorFramebuffer = { kind: "color-framebuffer" };
const materialFramebuffer = { kind: "material-framebuffer" };
const framebuffers = [colorFramebuffer, materialFramebuffer];
const atlasWidth = 256;
const atlasHeight = 128;
const stitcher = { width: atlasWidth, height: atlasHeight };
const atlas = {
  Cq: null,
  CV: 1,
  KG: { kind: "registered-sprites" },
  Ox: "material-texture",
  Qy: 0,
  R8: 0,
  Tf: 0,
  XX: "color-texture",
  bQV: 0,
  bqc: 0,
  qA: null,
  ri: null,
  uF: { c: 0 },
  ul: null,
};

const resumeOrder = [
  "$p", "bi", "bh", "bg", "bf", "be", "bd", "bc", "bb", "ba",
  "z", "y", "x", "w", "v", "u", "t", "s", "r", "q", "p", "o",
  "n", "m", "l", "k", "j", "i", "h", "g", "f", "e", "d", "c",
  "b", "a",
];
const resumedLocals = {
  $p: 48,
  a: atlas,
  d: stitcher,
  e: atlas.XX,
};
let resumeIndex = 0;
let resumeMode = true;
const resumeStack = {
  l() {
    const name = resumeOrder[resumeIndex++];
    return Object.hasOwn(resumedLocals, name) ? resumedLocals[name] : null;
  },
  s() {
    throw new Error("the atlas allocation path must not suspend");
  },
};

const atlasBoundary = new Error("atlas-state-published");
let framebufferIndex = 0;
const boundFramebuffers = [];
const attachedTextures = [];
const viewports = [];
const deletedFramebuffers = [];
const context = {
  B() {
    return false;
  },
  Be_(value) {
    assert.equal(value, stitcher);
    return atlasHeight;
  },
  Bno(value) {
    assert.equal(value, stitcher);
    return atlasWidth;
  },
  CUo(_target, _attachment, _textureTarget, nativeTexture, level) {
    attachedTextures.push([nativeTexture, level]);
  },
  CzZ() {
    return framebuffers[framebufferIndex++];
  },
  D65(value) {
    assert.equal(value, atlas.KG);
    return { kind: "uploaded-sprite-copy" };
  },
  DI() {
    return resumeStack;
  },
  DmJ(value) {
    assert.equal(value, atlas);
  },
  DOl(texture) {
    return `native:${texture}`;
  },
  E07(framebuffer) {
    deletedFramebuffers.push(framebuffer);
  },
  Ex() {},
  FfH(x, y, width, height) {
    viewports.push([x, y, width, height]);
  },
  FQG(texture) {
    assert.equal(texture, atlas.XX);
  },
  G(_arrayClass, length) {
    return { data: Array(length).fill(null) };
  },
  GL3(value) {
    assert.equal(value, stitcher);
    throw atlasBoundary;
  },
  Gs() {
    throw new Error("invalid TeaVM state");
  },
  Gt() {
    return resumeMode;
  },
  HdF(_target, framebuffer) {
    boundFramebuffers.push(framebuffer);
  },
  MwO: 0,
  SD_OK: { kind: "framebuffer-array-class" },
};

vm.createContext(context);
vm.runInContext(deferredAtlasSource, context);
vm.runInContext(textureTickSource, context);
vm.runInContext(textureDeleteSource, context);

let loaderError = null;
try {
  context.SD_Dwf(atlas, "resource-manager");
} catch (error) {
  loaderError = error;
}
assert.equal(
  loaderError,
  atlasBoundary,
  "the deferred loader reaches the point where the completed atlas state is published",
);

resumeMode = false;
boundFramebuffers.length = 0;
assert.doesNotThrow(
  () => context.Ep1(atlas),
  "TextureMap.tick can consume the framebuffers produced by the deferred atlas loader",
);
assert.equal(
  atlas.ri?.data[0],
  colorFramebuffer,
  "the deferred color framebuffer is owned by Tuff's canonical TextureMap field",
);
assert.equal(
  atlas.Cq?.data[0],
  materialFramebuffer,
  "the deferred material framebuffer is owned by Tuff's canonical TextureMap field",
);
assert.deepEqual(
  viewports,
  [[0, 0, atlasWidth, atlasHeight]],
  "the first animation tick uses the atlas dimensions produced by the deferred loader",
);
assert.deepEqual(
  attachedTextures,
  [["native:color-texture", 0], ["native:material-texture", 0]],
  "the deferred loader attaches both color and material textures",
);

context.E0c(atlas);
assert.deepEqual(
  deletedFramebuffers,
  [colorFramebuffer, materialFramebuffer],
  "TextureMap deletion releases both framebuffer arrays created by the deferred loader",
);
assert.equal(atlas.ri, null, "the canonical color framebuffer state is cleared");
assert.equal(atlas.Cq, null, "the canonical material framebuffer state is cleared");

console.log("deferred atlas state survives the Tuff tick and delete lifecycle");
