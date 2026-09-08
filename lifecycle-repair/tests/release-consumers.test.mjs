import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { transformBundle } from "../tools/build-lifecycle-repair.mjs";
import { transformOptiFineBridge } from "../tools/patch-optifine-bridge.mjs";

const repoRoot = new URL("../../", import.meta.url);
const lifecycleRoot = new URL("../", import.meta.url);

const [baseSource, baseBridge, barrierSource] = await Promise.all([
  readFile(new URL("recovered-live/selahmc-client-v8.3.3.js", repoRoot), "utf8"),
  readFile(new URL("recovered-live/selah-optifine-bridge-v8.3.3.js", repoRoot), "utf8"),
  readFile(new URL("src/world-lifecycle-barrier.js", lifecycleRoot), "utf8"),
]);
const transformed = transformBundle(baseSource, barrierSource);
const transformedBridge = transformOptiFineBridge(baseBridge);
const releaseSha = createHash("sha256").update(transformed.code).digest("hex");
const bridgeSha = createHash("sha256").update(transformedBridge.code).digest("hex");
const releaseShortSha = releaseSha.slice(0, 8);
const bridgeShortSha = bridgeSha.slice(0, 8);

test("Codespaces launchers pin the current generated client and marker", async () => {
  const [setup, start, integrationTest] = await Promise.all([
    readFile(new URL(".devcontainer/setup-selah-test.sh", repoRoot), "utf8"),
    readFile(new URL(".devcontainer/start-selah-test.sh", repoRoot), "utf8"),
    readFile(new URL(".devcontainer/test-v8.3.8-codespace-setup.mjs", repoRoot), "utf8"),
  ]);
  const marker = `.ready-v8.3.8-${releaseShortSha}-${bridgeShortSha}`;

  assert.match(setup, new RegExp(`release_client_sha="${releaseSha}"`));
  assert.match(setup, new RegExp(`release_bridge_sha="${bridgeSha}"`));
  assert.match(setup, new RegExp(`release_marker="${marker}"`));
  assert.match(start, new RegExp(marker.replaceAll(".", "\\.")));
  assert.match(integrationTest, new RegExp(releaseSha));
  assert.match(integrationTest, new RegExp(bridgeSha));
  assert.match(integrationTest, new RegExp(releaseShortSha));
  assert.match(integrationTest, new RegExp(marker.replaceAll(".", "\\.")));
});

test("release workflow verifies and uploads the hash-qualified portable archive", async () => {
  const workflow = await readFile(
    new URL(".github/workflows/selah-v8.3.8-release.yml", repoRoot),
    "utf8",
  );

  assert.doesNotMatch(workflow, /SelahMC-v8\.3\.8-Portable-Windows\.zip/);
  assert.match(workflow, /branches: \["stability-v8\.3\.8"\]/);
  assert.match(workflow, /sha256sum lifecycle-repair\/dist\/work\/selahmc-client-v8\.3\.8\.js/);
  assert.match(workflow, /PORTABLE_ARCHIVE/);
  assert.match(workflow, /CLIENT_SHORT_SHA/);
  assert.match(workflow, /for archive in "\$\{PORTABLE_ARCHIVE\}"/);
  assert.match(workflow, /artifacts=\("\$\{PORTABLE_ARCHIVE\}" "\$\{PORTABLE_ARCHIVE\}\.sha256"/);
  assert.match(workflow, /tag="v8\.3\.8-\$\{CLIENT_SHORT_SHA\}-portable"/);
  assert.doesNotMatch(workflow, /tag="v8\.3\.8-portable"/);
});

test("release notes identify the font replay and shader-screen repairs", async () => {
  const notes = await readFile(
    new URL("packaging/release-notes.md", lifecycleRoot),
    "utf8",
  );

  assert.match(notes, /renderAgain\(\)/);
  assert.match(notes, /missing cached direct render/);
  assert.match(notes, /Shaders button now opens the isolated browser shader panel/);
  assert.match(notes, /restores texture-unit 0/);
});

test("portable instructions do not promise the obsolete unqualified folder", async () => {
  const readme = await readFile(
    new URL("portable/README.txt", lifecycleRoot),
    "utf8",
  );

  assert.doesNotMatch(readme, /SelahMC-v8\.3\.8-Portable-Windows folder/);
  assert.match(readme, /extracted SelahMC folder/);
});
