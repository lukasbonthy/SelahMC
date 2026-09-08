import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { transformBundle } from "../tools/build-lifecycle-repair.mjs";
import { transformOptiFineBridge } from "../tools/patch-optifine-bridge.mjs";

const repoRoot = new URL("../../", import.meta.url);
const lifecycleRoot = new URL("../", import.meta.url);

const [baseSource, barrierSource] = await Promise.all([
  readFile(new URL("recovered-live/selahmc-client-v8.3.3.js", repoRoot), "utf8"),
  readFile(new URL("src/world-lifecycle-barrier.js", lifecycleRoot), "utf8"),
]);
const transformed = transformBundle(baseSource, barrierSource);
const releaseSha = createHash("sha256").update(transformed.code).digest("hex");
const releaseShortSha = releaseSha.slice(0, 8);
const bridgeSource = await readFile(new URL("recovered-live/selah-optifine-bridge-v8.3.3.js", repoRoot), "utf8");
const bridgeSha = createHash("sha256").update(transformOptiFineBridge(bridgeSource).code).digest("hex");

test("Codespaces launchers pin the current generated client and marker", async () => {
  const [setup, start, integrationTest] = await Promise.all([
    readFile(new URL(".devcontainer/setup-selah-test.sh", repoRoot), "utf8"),
    readFile(new URL(".devcontainer/start-selah-test.sh", repoRoot), "utf8"),
    readFile(new URL(".devcontainer/test-v8.3.9-codespace-setup.mjs", repoRoot), "utf8")
      .catch(() => null),
  ]);
  const marker = `.ready-v8.3.9-${releaseShortSha}-${bridgeSha.slice(0, 8)}`;

  assert.ok(integrationTest, "the v8.3.9 Codespaces verification must exist");
  assert.match(setup, new RegExp(`release_client_sha="${releaseSha}"`));
  assert.match(setup, new RegExp(`release_bridge_sha="${bridgeSha}"`));
  assert.match(integrationTest, new RegExp(bridgeSha));
  assert.match(setup, new RegExp(`release_marker="${marker}"`));
  assert.match(start, new RegExp(marker.replaceAll(".", "\\.")));
  assert.match(integrationTest, new RegExp(releaseSha));
  assert.match(integrationTest, new RegExp(releaseShortSha));
  assert.match(integrationTest, new RegExp(marker.replaceAll(".", "\\.")));
});

test("release workflow verifies and uploads the hash-qualified portable archive", async () => {
  const workflow = await readFile(
    new URL(".github/workflows/selah-v8.3.9-release.yml", repoRoot),
    "utf8",
  ).catch(() => null);

  assert.ok(workflow, "the v8.3.9 release workflow must exist");
  assert.doesNotMatch(workflow, /SelahMC-v8\.3\.9-Portable-Windows\.zip/);
  assert.match(workflow, /branches: \["stability-v8\.3\.9"\]/);
  assert.match(workflow, /sha256sum lifecycle-repair\/dist\/work\/selahmc-client-v8\.3\.9\.js/);
  assert.match(workflow, /PORTABLE_ARCHIVE/);
  assert.match(workflow, /CLIENT_SHORT_SHA/);
  assert.match(workflow, /for archive in "\$\{PORTABLE_ARCHIVE\}"/);
  assert.match(workflow, /artifacts=\("\$\{PORTABLE_ARCHIVE\}" "\$\{PORTABLE_ARCHIVE\}\.sha256"/);
  assert.match(workflow, /tag="v8\.3\.9-\$\{CLIENT_SHORT_SHA\}-portable"/);
  assert.doesNotMatch(workflow, /tag="v8\.3\.9-portable"/);
});

test("release notes identify the native deferred merge and renderer guards", async () => {
  const notes = await readFile(
    new URL("packaging/release-notes.md", lifecycleRoot),
    "utf8",
  );

  assert.match(notes, /renderAgain\(\)/);
  assert.match(notes, /missing cached direct render/);
  assert.match(notes, /native deferred\/PBR/i);
  assert.match(notes, /OptiFine Packs\.\.\./);
  assert.doesNotMatch(notes, /Shaders button now opens the isolated browser shader panel/);
  assert.match(notes, /restores texture-unit 0/);
});

test("portable instructions do not promise the obsolete unqualified folder", async () => {
  const readme = await readFile(
    new URL("portable/README.txt", lifecycleRoot),
    "utf8",
  );

  assert.doesNotMatch(readme, /SelahMC-v8\.3\.9-Portable-Windows folder/);
  assert.match(readme, /extracted SelahMC folder/);
});

test("portable launcher opens the v8.3.9 identity URL", async () => {
  const server = await readFile(
    new URL("portable/server/main.go", lifecycleRoot),
    "utf8",
  );

  assert.match(server, /\?portable=v8\.3\.9/);
});
