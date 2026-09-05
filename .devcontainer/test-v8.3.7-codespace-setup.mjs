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

test("Codespaces setup publishes the verified v8.3.7 lifecycle client", async () => {
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

  const clientPath = join(siteRoot, "selahmc-client-v8.3.7.js");
  const index = await readFile(join(siteRoot, "index.html"), "utf8");
  const client = await readFile(clientPath);

  assert.equal(
    sha256(client),
    "8d7e33e1f2ee1c2cc229e0d82160c0a4bbc7708a47e2f2c9bbaa1b20a916f584",
  );
  assert.match(index, /selahmc-client-v8\.3\.7\.js\?v=8d7e33e1/);
  assert.doesNotMatch(index, /selah-diagnostics\.js|selahmc-client-v8\.3\.3\.js/);
  assert.equal(
    (await stat(join(siteRoot, ".ready-v8.3.7-8d7e33e1"))).isFile(),
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
});
