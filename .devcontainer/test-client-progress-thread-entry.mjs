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

function extractThreadRuntime() {
  const start = client.indexOf("function TeaVMThread(");
  const end = client.indexOf("function $rt_invalidPointer()", start);
  assert.ok(start >= 0 && end > start, "TeaVM thread runtime is present");
  return client.slice(start, end);
}

test("asset progress enters a TeaVM thread before redrawing the loading screen", () => {
  let browserProgressCallback = null;
  let observedProgress = null;
  let observedThread = null;

  class FetchSuccessCallback {
    onFetch() {}
  }

  class FetchErrorCallback {
    onFetch() {}
  }

  class FetchProgressCallback {
    onProgress(progress) {
      observedProgress = progress;
      observedThread = context.$rt_nativeThread();
    }
  }

  const context = {
    $rt_globals: { Error },
    $rt_ustr(value) {
      return value;
    },
    B() {
      return false;
    },
    BJW: FetchProgressCallback,
    BJX: FetchSuccessCallback,
    BJY: FetchErrorCallback,
    C(index) {
      return `string-${index}`;
    },
    Dh6() {
      return false;
    },
    DI() {
      throw new Error("the fetch setup must not suspend");
    },
    Dw() {},
    Gs() {
      throw new Error("invalid TeaVM state");
    },
    Gt() {
      return false;
    },
    HlG(_url, _method, _onFetch, onProgress) {
      browserProgressCallback = onProgress;
    },
    Ho() {},
    Im1: false,
  };

  vm.createContext(context);
  vm.runInContext(extractThreadRuntime(), context);
  vm.runInContext(extractFunction("Dp"), context);
  vm.runInContext(extractFunction("Es3"), context);

  context.Es3("assets.epk", false, { kind: "aggregate-progress" }, null);
  assert.equal(typeof browserProgressCallback, "function");

  browserProgressCallback(0.65);

  assert.equal(observedProgress, 0.65);
  assert.ok(
    observedThread,
    "browser progress must not call the suspendable Java handler without a TeaVM thread",
  );
  assert.equal(
    context.$rt_nativeThread(),
    null,
    "the browser callback releases the TeaVM thread after the handler returns",
  );
});
