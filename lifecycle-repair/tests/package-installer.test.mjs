import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  appendFile,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { buildRelease } from "../tools/package-release.mjs";

const execFileAsync = promisify(execFile);

async function makeFakeClientRoot(parent) {
  const target = join(parent, "client");
  await mkdir(target, { recursive: true });
  await writeFile(join(target, "index.html"), "old-index-v8.3.3\n", "utf8");
  await writeFile(
    join(target, "selahmc-client-v8.3.3.js"),
    "old-client-v8.3.3\n",
    "utf8",
  );
  await writeFile(
    join(target, "selahmc-client-v8.3.4.js"),
    "old-client-v8.3.4\n",
    "utf8",
  );
  await writeFile(
    join(target, "selahmc-client-v8.3.5.js"),
    "old-client-v8.3.5\n",
    "utf8",
  );
  return target;
}

test("release contains the versioned client, hash-pinned index, and five files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "selah-package-layout-"));
  try {
    const release = await buildRelease({ outputRoot: directory });
    const files = (await readdir(release.releaseDirectory)).sort();
    const index = await readFile(
      join(release.releaseDirectory, "index.html"),
      "utf8",
    );
    const listing = await execFileAsync("unzip", ["-Z1", release.zipPath], {
      encoding: "utf8",
    });

    assert.deepEqual(files, [
      "README.txt",
      "SHA256SUMS",
      "index.html",
      "install.sh",
      "selahmc-client-v8.3.7.js",
    ]);
    assert.match(
      index,
      new RegExp(
        `selahmc-client-v8\\.3\\.7\\.js\\?v=${release.bundleSha256.slice(0, 8)}`,
      ),
    );
    assert.doesNotMatch(index, /selah-diagnostics\.js/);
    assert.doesNotMatch(index, /__selah_diag/);
    assert.deepEqual(
      listing.stdout.trim().split("\n").sort(),
      files
        .map((file) => `SelahMC-v8.3.7-Lifecycle-Transaction/${file}`)
        .sort(),
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("installer preserves v8.3.3, creates a rollback backup, and installs atomically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "selah-installer-"));
  try {
    const release = await buildRelease({ outputRoot: join(directory, "release") });
    const target = await makeFakeClientRoot(directory);
    const backupRoot = join(directory, "backups");
    const installer = join(release.releaseDirectory, "install.sh");
    await chmod(installer, 0o755);

    const result = await execFileAsync("bash", [installer], {
      encoding: "utf8",
      env: {
        ...process.env,
        SELAH_BACKUP_DIR: backupRoot,
        SELAH_CLIENT_DIR: target,
      },
    });

    const backupNames = await readdir(backupRoot);
    assert.equal(backupNames.length, 1);
    const backup = join(backupRoot, backupNames[0]);
    assert.equal(
      await readFile(join(target, "selahmc-client-v8.3.3.js"), "utf8"),
      "old-client-v8.3.3\n",
    );
    assert.equal(
      await readFile(join(backup, "index.html"), "utf8"),
      "old-index-v8.3.3\n",
    );
    assert.equal(
      await readFile(join(backup, "selahmc-client-v8.3.3.js"), "utf8"),
      "old-client-v8.3.3\n",
    );
    assert.equal(
      await readFile(join(backup, "selahmc-client-v8.3.4.js"), "utf8"),
      "old-client-v8.3.4\n",
    );
    assert.equal(
      await readFile(join(backup, "selahmc-client-v8.3.5.js"), "utf8"),
      "old-client-v8.3.5\n",
    );
    const installedIndex = await readFile(join(target, "index.html"), "utf8");
    assert.match(
      installedIndex,
      new RegExp(
        `selahmc-client-v8\\.3\\.7\\.js\\?v=${release.bundleSha256.slice(0, 8)}`,
      ),
    );
    assert.equal(
      (await stat(join(target, "selahmc-client-v8.3.7.js"))).mode & 0o777,
      0o644,
    );
    assert.match(result.stdout, /Deployment complete/);
    assert.match(result.stdout, /Rollback index/);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("corrupt package fails before changing the client root", async () => {
  const directory = await mkdtemp(join(tmpdir(), "selah-corrupt-package-"));
  try {
    const release = await buildRelease({ outputRoot: join(directory, "release") });
    const corruptRelease = join(directory, "corrupt-release");
    await cp(release.releaseDirectory, corruptRelease, { recursive: true });
    await appendFile(
      join(corruptRelease, "selahmc-client-v8.3.7.js"),
      "\n// corruption\n",
      "utf8",
    );
    const target = await makeFakeClientRoot(directory);
    const backupRoot = join(directory, "backups");
    const originalIndex = await readFile(join(target, "index.html"), "utf8");
    const originalClient = await readFile(
      join(target, "selahmc-client-v8.3.3.js"),
      "utf8",
    );
    const installer = join(corruptRelease, "install.sh");
    await chmod(installer, 0o755);

    await assert.rejects(
      execFileAsync("bash", [installer], {
        encoding: "utf8",
        env: {
          ...process.env,
          SELAH_BACKUP_DIR: backupRoot,
          SELAH_CLIENT_DIR: target,
        },
      }),
      /Command failed/,
    );

    assert.equal(await readFile(join(target, "index.html"), "utf8"), originalIndex);
    assert.equal(
      await readFile(join(target, "selahmc-client-v8.3.3.js"), "utf8"),
      originalClient,
    );
    await assert.rejects(stat(join(target, "selahmc-client-v8.3.7.js")), {
      code: "ENOENT",
    });
    await assert.rejects(readdir(backupRoot), { code: "ENOENT" });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
