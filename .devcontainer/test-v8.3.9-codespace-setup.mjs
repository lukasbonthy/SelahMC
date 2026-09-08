import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const siteRoot = join(repoRoot, ".selah-test");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("Codespaces setup publishes the verified v8.3.9 lifecycle client", async () => {
  await execFileAsync("bash", [join(repoRoot, ".devcontainer/setup-selah-test.sh")], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      SELAH_SOURCE_URL:
        process.env.SELAH_TEST_SOURCE_URL || "https://selahmc.me/client",
    },
    maxBuffer: 4 * 1024 * 1024,
    timeout: 300_000,
  });

  const clientPath = join(siteRoot, "selahmc-client-v8.3.9.js");
  const bridgePath = join(siteRoot, "selah-optifine-bridge-v8.3.3.js");
  const index = await readFile(join(siteRoot, "index.html"), "utf8");
  const client = await readFile(clientPath);
  const bridge = await readFile(bridgePath);

  assert.equal(
    sha256(client),
    "5ed22bfe617383f842938fe6218985ae322045f1ae912e3b53c66815ea43f4e5",
  );
  assert.match(index, /selahmc-client-v8\.3\.9\.js\?v=5ed22bfe/);
  assert.equal(
    sha256(bridge),
    "43daa2d91bd9927b736543cd418766c383a037faec2a3d5725d7b1b786e62101",
  );
  assert.match(index, /selah-optifine-bridge-v8\.3\.3\.js\?v=43daa2d9/);
  assert.doesNotMatch(index, /selah-diagnostics\.js|selahmc-client-v8\.3\.3\.js/);
  assert.equal(
    (await stat(join(siteRoot, ".ready-v8.3.9-5ed22bfe-43daa2d9"))).isFile(),
    true,
  );
  await assert.rejects(stat(join(siteRoot, "selahmc-client-v8.3.3.js")), {
    code: "ENOENT",
  });

  await execFileAsync(process.execPath, ["--check", clientPath], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 60_000,
  });
  await execFileAsync(process.execPath, ["--check", bridgePath], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 60_000,
  });
});
