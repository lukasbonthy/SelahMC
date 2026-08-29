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

const hostInitializerSource = extractFunction("CTi");
const deferredPipelineFactorySource = extractFunction("SD_Dha");
const deferredPipeline = { kind: "deferred-fixed-function-pipeline" };
const resumeOrder = [
  "$p",
  "s",
  "r",
  "q",
  "p",
  "o",
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
];
const resumedLocals = {
  $p: 45,
  e: null,
  f: { kind: "compiled-fragment-shader" },
  m: deferredPipeline,
  q: null,
};
let resumeIndex = 0;
let resuming = false;
const resumeStack = {
  l() {
    const name = resumeOrder[resumeIndex++];
    return Object.hasOwn(resumedLocals, name) ? resumedLocals[name] : null;
  },
  s() {
    throw new Error("the pipeline cache write must not suspend");
  },
};

const context = {
  B() {
    return false;
  },
  C(id) {
    return `string-${id}`;
  },
  Cvi() {},
  DI() {
    return resumeStack;
  },
  Fia(name) {
    return { kind: "logger", name };
  },
  G(_arrayClass, size) {
    return { data: new Array(size).fill(null) };
  },
  Gs() {
    throw new Error("invalid TeaVM state");
  },
  Gt() {
    return resuming;
  },
  Lh(capacity) {
    return { capacity, items: [] };
  },
  Ph() {
    return { kind: "map" };
  },
  Q7: class FixedFunctionPipeline {},
  W(list, value) {
    list.items.push(value);
    return 1;
  },
  W$: class MatrixState {},
  $rt_arraycls(arrayClass) {
    return arrayClass;
  },
  SD_HXj: null,
};

vm.createContext(context);
vm.runInContext(hostInitializerSource, context);
vm.runInContext(deferredPipelineFactorySource, context);
context.CTi();

resuming = true;
let pipelineResult = null;
let pipelineError = null;
try {
  pipelineResult = context.SD_Dha(0, 0, 0);
} catch (error) {
  pipelineError = error;
}

// Regression target: removing the shared SD_HXj/LS8 initialization must make
// this fail, because deferred creation can no longer write into the host cache.
assert.equal(
  pipelineError,
  null,
  "the host initializer makes the deferred fixed-function cache writable",
);
assert.equal(pipelineResult, deferredPipeline);
assert.deepEqual(
  context.LS8.items,
  [deferredPipeline],
  "a deferred pipeline is retained by the host cache that owns cache cleanup",
);

console.log("deferred fixed-function pipelines share the initialized host cache");
