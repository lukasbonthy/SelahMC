import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  EXPECTED_BASE_SHA256,
  injectLifecycleBarrier,
  replaceExact,
  transformBundle,
  verifyBaseBundle,
} from "../tools/build-lifecycle-repair.mjs";

const baseBundleUrl = new URL(
  "../../recovered-live/selahmc-client-v8.3.3.js",
  import.meta.url,
);
const barrierUrl = new URL("../src/world-lifecycle-barrier.js", import.meta.url);
const builderUrl = new URL("../tools/build-lifecycle-repair.mjs", import.meta.url);
const execFileAsync = promisify(execFile);

test("accepts only the exact deployed 6e775ed5 bundle", async () => {
  const source = await readFile(baseBundleUrl, "utf8");

  assert.equal(verifyBaseBundle(source), EXPECTED_BASE_SHA256);
  assert.throws(
    () => verifyBaseBundle(`${source}\n// changed`),
    /base bundle SHA-256 mismatch/,
  );
});

test("injects the lifecycle policy immediately before Minecraft.runTick", () => {
  const fixture = "function Before(){}\nfunction CYD(a){return a;}\n";
  const barrier = "var barrierLoaded = true;\n";

  const result = injectLifecycleBarrier(fixture, barrier);

  assert.equal(
    result,
    "function Before(){}\nvar barrierLoaded = true;\n\nfunction CYD(a){return a;}\n",
  );
});

test("rejects missing and duplicated generated signatures", () => {
  const barrier = "var barrierLoaded = true;\n";

  assert.throws(
    () => injectLifecycleBarrier("function Other(){}", barrier),
    /lifecycle policy injection: expected 1, found 0/,
  );
  assert.throws(
    () =>
      injectLifecycleBarrier(
        "function CYD(a){}\nfunction CYD(b){}\n",
        barrier,
      ),
    /lifecycle policy injection: expected 1, found 2/,
  );
});

test("replaceExact refuses under- and over-matched patches", () => {
  assert.equal(
    replaceExact("a-b-c", "-", "/", 2, "dash replacement"),
    "a/b/c",
  );
  assert.throws(
    () => replaceExact("a-b", "-", "/", 2, "dash replacement"),
    /dash replacement: expected 2, found 1/,
  );
  assert.throws(
    () => replaceExact("a-b-c", "-", "/", 1, "dash replacement"),
    /dash replacement: expected 1, found 2/,
  );
});

test("transforms the real bundle and reports the policy injection", async () => {
  const [source, barrier] = await Promise.all([
    readFile(baseBundleUrl, "utf8"),
    readFile(barrierUrl, "utf8"),
  ]);

  const result = transformBundle(source, barrier, {
    applyLifecycleTransforms: false,
  });

  assert.equal(result.baseSha256, EXPECTED_BASE_SHA256);
  assert.equal(result.replacements.policyInjection, 1);
  assert.equal(result.code.includes("function SD_worldLifecycleReady(a, b)"), true);
  assert.equal(
    result.code.indexOf("function SD_worldLifecycleReady(a, b)"),
    result.code.lastIndexOf("function SD_worldLifecycleReady(a, b)"),
  );
  const runTickIndex = result.code.indexOf("function CYD(a)");
  assert.equal(
    result.code.slice(runTickIndex - barrier.length - 1, runTickIndex),
    `${barrier}\n`,
  );
});

test("CLI writes a verified transformed bundle only after success", async () => {
  const directory = await mkdtemp(join(tmpdir(), "selah-transformer-"));
  const outputPath = join(directory, "client.js");

  try {
    const result = await execFileAsync(
      process.execPath,
      [
        builderUrl.pathname,
        "--input",
        baseBundleUrl.pathname,
        "--barrier",
        barrierUrl.pathname,
        "--output",
        outputPath,
        "--no-lifecycle-transforms",
      ],
      { encoding: "utf8" },
    );
    const output = await readFile(outputPath, "utf8");

    assert.match(result.stdout, /base 6e775ed50e83a6ba/);
    assert.match(result.stdout, /policyInjection=1/);
    assert.equal(output.includes("function SD_worldLifecycleReady(a, b)"), true);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
