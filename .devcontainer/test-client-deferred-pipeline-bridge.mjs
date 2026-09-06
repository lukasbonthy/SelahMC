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
  assert.ok(start >= 0 && end >= 0, `${name} is present in the generated client`);
  return client.slice(start, end);
}

function runPipelineDispatch(name, alphaName, hostName, args) {
  const alphaCalls = [];
  const hostCalls = [];
  const hostResult = { operation: name, implementation: "tuff-host" };
  const context = {
    B() {
      return false;
    },
    DI() {
      throw new Error("the dispatch must not suspend");
    },
    Gs() {
      throw new Error("invalid TeaVM state");
    },
    Gt() {
      return false;
    },
    SD_getEnabled() {
      return true;
    },
    [alphaName](...received) {
      alphaCalls.push(received);
      return { operation: name, implementation: "alpha-graft" };
    },
    [hostName](...received) {
      hostCalls.push(received);
      return hostResult;
    },
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(name), context);
  const result = context[name](...args);
  assert.equal(result, hostResult, `${name} returns the host pipeline result`);
  assert.deepEqual(
    alphaCalls,
    [],
    `${name} never enters the Alpha object-layout implementation`,
  );
  assert.deepEqual(hostCalls, [args], `${name} preserves every host argument`);
}

runPipelineDispatch("FcU", "SD_EVW", "SD_TUFF_FcU", [{ attribs: 7 }]);
runPipelineDispatch("DtO", "SD_Dha", "SD_TUFF_DtO", [23, 5, 1]);
runPipelineDispatch("DOQ", "SD_DA8", "SD_TUFF_DOQ", [{ pipeline: 1 }]);
runPipelineDispatch("EU2", "SD_ECZ", "SD_TUFF_EU2", [31]);

const deferredDrawSource = extractFunction("SD_FQU");
const pipeline = { kind: "host-fixed-function-pipeline" };
const drawBoundary = new Error("draw-boundary");
const alphaUpdateCalls = [];
const hostUpdateCalls = [];
const resumeOrder = [
  "$p",
  "n",
  "m",
  "l",
  "k",
  "j",
  "i",
  "h",
  "g",
  "f",
  "e",
  "d",
  "c",
  "b",
  "a",
];
const resumedLocals = {
  $p: 15,
  g: pipeline,
};
let resumeIndex = 0;
const resumeStack = {
  l() {
    const name = resumeOrder[resumeIndex++];
    return Object.hasOwn(resumedLocals, name) ? resumedLocals[name] : null;
  },
  s() {
    throw new Error("the fixed-function update must not suspend");
  },
};
const drawContext = {
  B() {
    return false;
  },
  DI() {
    return resumeStack;
  },
  DQ4() {
    throw drawBoundary;
  },
  Gt() {
    return true;
  },
  SD_DA8(value) {
    alphaUpdateCalls.push(value);
    throw new TypeError("Cannot read properties of undefined (reading 'biQ')");
  },
  SD_TUFF_DOQ(value) {
    hostUpdateCalls.push(value);
    return value;
  },
  SD_HWL: null,
};
vm.createContext(drawContext);
vm.runInContext(deferredDrawSource, drawContext);
let drawError = null;
try {
  drawContext.SD_FQU({});
} catch (error) {
  drawError = error;
}
assert.equal(
  drawError,
  drawBoundary,
  "the deferred tessellator gets past the fixed-function uniform update",
);
assert.deepEqual(
  alphaUpdateCalls,
  [],
  "the deferred tessellator cannot call the incompatible Alpha updater directly",
);
assert.deepEqual(hostUpdateCalls, [pipeline]);

const guiPrimitiveModes = [];
const guiVertexBuffer = { kind: "gui-vertex-buffer" };
const guiUploadBuffer = { BW: 34962 };
const guiPipeline = {
  bVH: {
    a8G: 0,
    bVJ: { kind: "vertex-array" },
    ua: {
      data: [
        {
          Dh: null,
          V8: guiUploadBuffer,
        },
      ],
    },
  },
  k2: -1,
  R5: 0,
  Zw: -1,
};
const guiBuilder = {
  cX0: 7,
  de: undefined,
  kw: { data: new Uint8Array(64) },
  pM: 4,
  tc: { c3z: 8, rs: 20 },
};
const guiContext = {
  B() {
    return false;
  },
  Bg() {},
  C(id) {
    return `string-${id}`;
  },
  Cxp() {},
  Cya() {
    return guiPipeline;
  },
  Da() {},
  DI() {
    throw new Error("the GUI quad upload must not suspend");
  },
  DlA() {},
  DQ4(_pipeline, primitiveMode, firstVertex, vertexCount) {
    guiPrimitiveModes.push({ firstVertex, primitiveMode, vertexCount });
  },
  DtT() {
    return guiVertexBuffer;
  },
  EDX() {},
  EEW() {},
  F5Y() {},
  F8p() {},
  Fj() {},
  Fo: class RuntimeException {},
  GFv() {},
  GGr(buffer) {
    return buffer;
  },
  GTO() {
    return 0;
  },
  GVK() {},
  Gs() {
    throw new Error("invalid TeaVM state");
  },
  Gt() {
    return false;
  },
  HeZ() {},
  I(error) {
    throw error;
  },
  IvN: null,
  IvO: { bl5: 4096, data: new Uint8Array(4096), ex: 0 },
  IW(buffer) {
    return buffer.data.length;
  },
  SD_HWL: null,
  SD_HWy: null,
  SD_HWz: { bl5: 4096, ex: 0 },
  SD_KTU: 0,
  SD_TUFF_DOQ(value) {
    return value;
  },
  V(left, right) {
    return Math.imul(left, right);
  },
  YX() {},
};
guiBuilder.de = guiBuilder;
vm.createContext(guiContext);
vm.runInContext(deferredDrawSource, guiContext);
guiContext.SD_FQU({ de: guiBuilder });
assert.deepEqual(
  guiPrimitiveModes,
  [{ firstVertex: 0, primitiveMode: 7, vertexCount: 4 }],
  "the deferred GUI upload submits the primitive mode initialized by Tuff's BufferBuilder",
);

const displayListDraws = [];
const displayListCopies = [];
const displayList = { k2: -1, R5: 0, Zw: -1 };
const displayListBuffer = {
  bl5: 4096,
  data: new Uint8Array(4096),
  ex: 0,
};
const displayListBuilder = {
  cX0: 7,
  de: undefined,
  kw: { data: new Uint8Array(64) },
  pM: 4,
  tc: { c3z: 8, rs: 20 },
};
const displayListContext = {
  B() {
    return false;
  },
  Bg() {},
  C(id) {
    return `string-${id}`;
  },
  Cxp() {},
  Cya() {
    return guiPipeline;
  },
  Da() {},
  DI() {
    throw new Error("display-list capture must not suspend");
  },
  DlA() {},
  DQ4(_pipeline, primitiveMode, firstVertex, vertexCount) {
    displayListDraws.push({ firstVertex, primitiveMode, vertexCount });
  },
  DtT() {
    return guiVertexBuffer;
  },
  EDX() {},
  EEW() {},
  F5Y() {},
  F8p() {},
  Fj() {},
  Fo: class RuntimeException {},
  GFv() {},
  GGr(buffer) {
    return buffer;
  },
  GO8(target, source) {
    displayListCopies.push({ source, target });
  },
  GTO() {
    return 0;
  },
  Gs() {
    throw new Error("invalid TeaVM state");
  },
  Gt() {
    return false;
  },
  HeZ() {},
  I(error) {
    throw error;
  },
  IvN: displayList,
  IvO: displayListBuffer,
  IW(buffer) {
    return buffer.data.length;
  },
  SD_HWL: null,
  SD_HWy: null,
  SD_HWz: { bl5: 4096, data: new Uint8Array(4096), ex: 0 },
  SD_KTU: 0,
  SD_TUFF_DOQ(value) {
    return value;
  },
  V(left, right) {
    return Math.imul(left, right);
  },
  YX() {},
};
displayListBuilder.de = displayListBuilder;
vm.createContext(displayListContext);
vm.runInContext(deferredDrawSource, displayListContext);
displayListContext.SD_FQU({ de: displayListBuilder });
assert.deepEqual(
  displayListDraws,
  [],
  "an open Tuff display list captures deferred geometry instead of drawing it immediately",
);
assert.deepEqual(displayList, { k2: 8, R5: 4, Zw: 7 });
assert.equal(displayListCopies.length, 1);
assert.strictEqual(displayListCopies[0].source, displayListBuilder.kw);
assert.strictEqual(displayListCopies[0].target, displayListBuffer);

const providerCalls = [];
const provider = { kind: "deferred-gbuffer-compiler" };
const extensionContext = {
  B() {
    return false;
  },
  DI() {
    throw new Error("installing the extension bridge must not suspend");
  },
  GGp() {
    providerCalls.push(["flush"]);
  },
  Gs() {
    throw new Error("invalid TeaVM state");
  },
  Gt() {
    return false;
  },
  SD_CBQ(...args) {
    providerCalls.push(["update", ...args]);
    return "updated";
  },
  SD_D05(...args) {
    providerCalls.push(["initialize", ...args]);
    return "initialized";
  },
  SD_EMI(...args) {
    providerCalls.push(["state", ...args]);
    return 257;
  },
  SD_Ftq(...args) {
    providerCalls.push(["source", ...args]);
    return { data: ["vertex", "fragment"] };
  },
  SD_LTv: null,
  LS5: null,
  YX() {},
};
vm.createContext(extensionContext);
vm.runInContext(extractFunction("SD_makeTuffExtensionAdapter"), extensionContext);
vm.runInContext(extractFunction("SD_F_j"), extensionContext);
extensionContext.SD_F_j(provider);

const adapter = extensionContext.LS5;
assert.equal(extensionContext.SD_LTv, provider);
assert.ok(adapter, "installing the deferred provider also installs the Tuff ABI adapter");
const pointer = { data: [null] };
const program = { kind: "program" };
assert.deepEqual(adapter.fK6(23, 5, pointer), {
  data: ["vertex", "fragment"],
});
assert.equal(adapter.gi7(program, 23, 5, pointer), "initialized");
assert.equal(adapter.d9h(23), 257);
assert.equal(adapter.fPp(), 9);
assert.equal(adapter.glN(0), 2943);
assert.equal(adapter.glN(8), 80);
assert.equal(adapter.glN(8 | 32), 112);
assert.equal(adapter.glN(64), 32);
assert.equal(adapter.glN(128), 48);
assert.equal(adapter.si(program, 23, 5, pointer), "updated");
assert.equal(adapter.fF$(program, 23, 5, pointer), undefined);
assert.deepEqual(providerCalls, [
  ["flush"],
  ["source", provider, 23, 5, pointer],
  ["initialize", provider, program, 23, 5, pointer],
  ["state", provider, 23],
  ["update", provider, program, 23, 5, pointer],
]);

extensionContext.SD_F_j(null);
assert.equal(extensionContext.SD_LTv, null);
assert.equal(extensionContext.LS5, null);

console.log("deferred rendering uses one Tuff fixed-function layout and an ABI adapter");
