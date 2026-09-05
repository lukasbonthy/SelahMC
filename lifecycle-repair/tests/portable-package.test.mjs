import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  DEFAULT_ASSET_MANIFEST,
  PORTABLE_ASSET_PATHS,
  PORTABLE_RELEASE_NAME,
  buildPortableRelease,
  createDeterministicZip,
  fetchPortableAssets,
  validatePortableAssetClosure,
} from "../tools/package-portable-release.mjs";

const execFileAsync = promisify(execFile);

test("pinned live manifest covers every portable dependency exactly once", () => {
  assert.deepEqual(
    DEFAULT_ASSET_MANIFEST.map((asset) => asset.path).sort(),
    [...PORTABLE_ASSET_PATHS].sort(),
  );
  assert.equal(new Set(DEFAULT_ASSET_MANIFEST.map((asset) => asset.path)).size, PORTABLE_ASSET_PATHS.length);
  for (const asset of DEFAULT_ASSET_MANIFEST) {
    assert.match(asset.url, /^https:\/\/selahmc\.me\/client\//);
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  }
});

async function writeFixtureAssets(root) {
  for (const assetPath of PORTABLE_ASSET_PATHS) {
    const outputPath = join(root, assetPath);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `portable fixture: ${assetPath}\n`, "utf8");
  }
}

async function listFiles(root, relative = "") {
  const entries = await readdir(join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, child)));
    } else {
      files.push(child.replaceAll("\\", "/"));
    }
  }
  return files.sort();
}

function peMachine(binary) {
  assert.equal(binary.subarray(0, 2).toString("ascii"), "MZ");
  const peOffset = binary.readUInt32LE(0x3c);
  assert.equal(binary.subarray(peOffset, peOffset + 4).toString("binary"), "PE\0\0");
  return binary.readUInt16LE(peOffset + 4);
}

test("portable release contains a complete no-install Windows client", async () => {
  const directory = await mkdtemp(join(tmpdir(), "selah-portable-package-"));
  try {
    const assetRoot = join(directory, "assets");
    await writeFixtureAssets(assetRoot);
    const release = await buildPortableRelease({
      assetRoot,
      goBinary: process.env.SELAH_GO_BIN || "go",
      outputRoot: join(directory, "output"),
    });
    const files = await listFiles(release.releaseDirectory);
    const index = await readFile(
      join(release.releaseDirectory, "client", "index.html"),
      "utf8",
    );
    const launcher = await readFile(
      join(release.releaseDirectory, "START_SELAHMC.cmd"),
      "utf8",
    );
    const listing = await execFileAsync("unzip", ["-Z1", release.zipPath], {
      encoding: "utf8",
    });

    assert.equal(release.releaseName, PORTABLE_RELEASE_NAME);
    assert.match(
      index,
      new RegExp(
        `selahmc-client-v8\\.3\\.7\\.js\\?v=${release.bundleSha256.slice(0, 8)}`,
      ),
    );
    assert.doesNotMatch(index, /selah-diagnostics\.js|\/__selah_diag/);
    assert.doesNotMatch(index, /(?:src|href)="https?:\/\/selahmc\.me\/client\//);

    const localReferences = [
      ...index.matchAll(/(?:src|href)="([^"?#]+)"/g),
      ...index.matchAll(/assetsURI:\s*"([^"?#]+)"/g),
    ]
      .map((match) => match[1])
      .filter((reference) => !/^(?:[a-z]+:|\/\/|#)/i.test(reference));
    for (const localReference of localReferences) {
      assert.equal(
        (await stat(join(release.releaseDirectory, "client", localReference))).isFile(),
        true,
        `missing local dependency: ${localReference}`,
      );
    }

    assert.doesNotMatch(launcher, /powershell|python|node|npm/i);
    assert.doesNotMatch(launcher, /(?<!\r)\n/u);
    assert.equal(
      peMachine(
        await readFile(
          join(release.releaseDirectory, "bin", "selah-portable-server-x64.exe"),
        ),
      ),
      0x8664,
    );
    assert.equal(
      peMachine(
        await readFile(
          join(
            release.releaseDirectory,
            "bin",
            "selah-portable-server-arm64.exe",
          ),
        ),
      ),
      0xaa64,
    );

    await execFileAsync("sha256sum", ["-c", "SHA256SUMS.txt"], {
      cwd: release.releaseDirectory,
      encoding: "utf8",
    });
    assert.deepEqual(
      listing.stdout.trim().split("\n").sort(),
      files.map((file) => `${PORTABLE_RELEASE_NAME}/${file}`).sort(),
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("portable servers omit checkout-specific VCS metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "selah-portable-buildvcs-"));
  try {
    const assetRoot = join(directory, "assets");
    const goBinary = process.env.SELAH_GO_BIN || "go";
    await writeFixtureAssets(assetRoot);
    const release = await buildPortableRelease({
      assetRoot,
      goBinary,
      outputRoot: join(directory, "output"),
    });

    for (const executable of [
      "selah-portable-server-x64.exe",
      "selah-portable-server-arm64.exe",
    ]) {
      const metadata = await execFileAsync(
        goBinary,
        ["version", "-m", join(release.releaseDirectory, "bin", executable)],
        { encoding: "utf8" },
      );
      assert.doesNotMatch(metadata.stdout, /\bbuild\s+vcs(?:\.|=)/u);
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("portable asset fetch rejects altered bytes before caching them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "selah-portable-assets-"));
  try {
    await assert.rejects(
      fetchPortableAssets({
        destination: directory,
        manifest: [
          {
            path: "asset.js",
            sha256:
              "a7b0d0aeaa6c984ff9d3051de6da2c775412cc483f0e143e4eb20569503a3ab2",
            url: "data:text/plain,tampered%20asset%0A",
          },
        ],
      }),
      /asset hash mismatch.*asset\.js/i,
    );
    await assert.rejects(stat(join(directory, "asset.js")), { code: "ENOENT" });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("portable asset fetch writes bytes only after their pinned hash matches", async () => {
  const directory = await mkdtemp(join(tmpdir(), "selah-portable-assets-"));
  try {
    await fetchPortableAssets({
      destination: directory,
      manifest: [
        {
          path: "nested/asset.js",
          sha256:
            "a7b0d0aeaa6c984ff9d3051de6da2c775412cc483f0e143e4eb20569503a3ab2",
          url: "data:text/plain,portable%20asset%0A",
        },
      ],
    });
    assert.equal(
      await readFile(join(directory, "nested", "asset.js"), "utf8"),
      "portable asset\n",
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("portable dependency validation rejects a script whose local asset is absent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "selah-portable-closure-"));
  try {
    await writeFile(
      join(directory, "loader.js"),
      'document.body.style.backgroundImage = "url(missing-background.jpg)";\n',
      "utf8",
    );
    await assert.rejects(
      validatePortableAssetClosure(directory),
      /loader\.js.*missing-background\.jpg/i,
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("portable ZIP bytes do not depend on source-file timestamps", async () => {
  const directory = await mkdtemp(join(tmpdir(), "selah-portable-reproducible-"));
  try {
    const releaseName = "PortableFixture";
    const releaseDirectory = join(directory, releaseName);
    const sourceFile = join(releaseDirectory, "client", "index.html");
    const firstZip = join(directory, "first.zip");
    const secondZip = join(directory, "second.zip");
    await mkdir(dirname(sourceFile), { recursive: true });
    await writeFile(sourceFile, "portable bytes\n", "utf8");

    await createDeterministicZip({ releaseDirectory, releaseName, zipPath: firstZip });
    await utimes(sourceFile, new Date(), new Date());
    await createDeterministicZip({
      releaseDirectory,
      releaseName,
      zipPath: secondZip,
    });

    assert.deepEqual(await readFile(firstZip), await readFile(secondZip));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
