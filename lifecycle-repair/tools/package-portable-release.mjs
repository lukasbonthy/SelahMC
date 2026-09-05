import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { buildRelease } from "./package-release.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export const PORTABLE_RELEASE_NAME = "SelahMC-v8.3.7-Portable-Windows";

export const PORTABLE_ASSET_PATHS = Object.freeze([
  "favicon.png",
  "selah-loader-bg-v7.8.jpg",
  "selah-loader-bg-v7.8-2x.jpg",
  "selah-logo-v7.8.png",
  "selah-loader-v8.3.3.js",
  "plugins/EventBus.js",
  "plugins/PluginManager.js",
  "plugins/PluginAPI.js",
  "plugins/PluginRuntime.js",
  "plugins/PluginBootstrap.js",
  "selah-resource-packs-v7.8.js",
  "selah-device-modes-v7.8.js",
  "plugins/SelahWorkshop-v7.8.js",
  "selah-companion-v7.8.js",
  "selah-optifine-bridge-v8.3.3.js",
  "selahmc-assets-v8.3.3.epk",
]);

const assetHashes = {
  "favicon.png": "8a0d441a7dd12fbb1b3fdfc403632a71b110a19c1594ab6ba1704cffff74d983",
  "selah-loader-bg-v7.8.jpg": "538d5539c24f3c51d27b751885603cde3b1db453b14638b7830ccb9dcb796b4d",
  "selah-loader-bg-v7.8-2x.jpg": "7e2248816462818f1d176f64327008ce98cb590c70fc6367ce957d607b07cbe4",
  "selah-logo-v7.8.png": "63f6e8bd7aac48f0f3baae890bb7f261280871a2edfd5e23ff133bfc87582e69",
  "selah-loader-v8.3.3.js": "766018891402456aee3c803014b6d1158ccbf0e9dfd7004975dd74cd884cb43b",
  "plugins/EventBus.js": "0a9a24d4170d4ad0d9ebcca6dc39e4538d01a78b707cec8a8ebb57b628f07c68",
  "plugins/PluginManager.js": "56d415d38b70726c0213e291a59fab95b44fac71f6286f09cde50a1e96a3bbcb",
  "plugins/PluginAPI.js": "d7565e6318a7f8c768c4a7d5c7e473516b70c5b402abbe36dd00fb1b9e08a52f",
  "plugins/PluginRuntime.js": "bb92077598fc8d0776e4f6cd20d126c885753af35d5eabfaf36e35fdae7e519f",
  "plugins/PluginBootstrap.js": "f6548ebb7d1d9b284669d978e74174fdd35c1681a6adeceb07cdf8bde4894a53",
  "selah-resource-packs-v7.8.js": "bec7bcb9cb24c87a0f346e44c276421faf1123ff734135a94ab3623c73710553",
  "selah-device-modes-v7.8.js": "295aa29d76a53a76f4c82c92bc3ac21825acf46ad44fa37577ccd74e143299bf",
  "plugins/SelahWorkshop-v7.8.js": "0ac86c9437c3f042d4940f04a4cb78267879af1be85716f1d6248b7f2b7198b1",
  "selah-companion-v7.8.js": "e98208f72419d9f801ddeeee1034ba936b4c8f66d6f54079358fc481e8d68067",
  "selah-optifine-bridge-v8.3.3.js": "9ecb0a64045381ae539428178d6db324a68a48ff9bb54bb5fafc57a5921dbddd",
  "selahmc-assets-v8.3.3.epk": "880c2d18e6f120ec735ab770b655160edc9d473b6a6326e75027723aedf459fd",
};

export const DEFAULT_ASSET_MANIFEST = Object.freeze(
  PORTABLE_ASSET_PATHS.map((path) =>
    Object.freeze({
      path,
      sha256: assetHashes[path],
      url: `https://selahmc.me/client/${path}`,
    }),
  ),
);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function childPath(parent, child) {
  if (!child || isAbsolute(child)) {
    throw new Error(`invalid relative package path: ${child}`);
  }
  const normalizedParent = `${resolve(parent)}${sep}`;
  const normalizedChild = resolve(parent, child);
  if (!normalizedChild.startsWith(normalizedParent)) {
    throw new Error(`package path escapes its root: ${child}`);
  }
  return normalizedChild;
}

async function fileSha256(path) {
  return sha256(await readFile(path));
}

export async function fetchPortableAssets(options = {}) {
  const destination = resolve(options.destination);
  const manifest = options.manifest || DEFAULT_ASSET_MANIFEST;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  await mkdir(destination, { recursive: true });

  for (const asset of manifest) {
    const outputPath = childPath(destination, asset.path);
    try {
      if ((await fileSha256(outputPath)) === asset.sha256) {
        continue;
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }

    const response = await fetchImpl(asset.url);
    if (!response.ok) {
      throw new Error(`asset download failed (${response.status}) for ${asset.path}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const actualHash = sha256(bytes);
    if (actualHash !== asset.sha256) {
      throw new Error(
        `asset hash mismatch for ${asset.path}: expected ${asset.sha256}, received ${actualHash}`,
      );
    }

    await mkdir(dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.download-${process.pid}`;
    await writeFile(temporaryPath, bytes);
    await rename(temporaryPath, outputPath);
  }

  return destination;
}

const localAssetPatterns = [
  /["'`]([^"'`\s()]+\.(?:css|epk|gif|jpe?g|js|json|mp3|ogg|png|svg|ttf|wasm|wav|woff2?)(?:[?#][^"'`\s()]*)?)["'`]/giu,
  /url\(\s*["']?([^"'`()\s]+\.(?:gif|jpe?g|png|svg|ttf|woff2?)(?:[?#][^"'`()\s]*)?)["']?\s*\)/giu,
];

async function walkFiles(root, relativePath = "") {
  const entries = await readdir(join(root, relativePath), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(relativePath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, child)));
    } else {
      files.push(child);
    }
  }
  return files;
}

export async function validatePortableAssetClosure(assetRoot) {
  const root = resolve(assetRoot);
  const sourceFiles = (await walkFiles(root)).filter((path) =>
    [".css", ".js"].includes(extname(path).toLowerCase()),
  );
  const missing = [];
  for (const sourcePath of sourceFiles) {
    const source = await readFile(join(root, sourcePath), "utf8");
    for (const pattern of localAssetPatterns) {
      for (const match of source.matchAll(pattern)) {
        const reference = match[1].split(/[?#]/u, 1)[0];
        if (/^(?:[a-z]+:|\/\/)/iu.test(reference) || reference.includes("${")) {
          continue;
        }
        const normalizedReference = reference
          .replace(/^\.\//u, "")
          .replace(/^\//u, "");
        try {
          const info = await stat(childPath(root, normalizedReference));
          if (!info.isFile()) {
            missing.push(`${sourcePath} -> ${reference}`);
          }
        } catch (error) {
          if (error?.code === "ENOENT") {
            missing.push(`${sourcePath} -> ${reference}`);
          } else {
            throw error;
          }
        }
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(`portable asset closure is incomplete: ${missing.join(", ")}`);
  }
}

async function compileWindowsServer(goBinary, architecture, outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await execFileAsync(
    goBinary,
    [
      "build",
      "-buildvcs=false",
      "-trimpath",
      "-ldflags=-s -w",
      "-o",
      outputPath,
      ".",
    ],
    {
      cwd: join(projectRoot, "portable/server"),
      encoding: "utf8",
      env: {
        ...process.env,
        CGO_ENABLED: "0",
        GOARCH: architecture,
        GOOS: "windows",
      },
    },
  );
}

async function copyAssetTree(assetRoot, clientRoot) {
  for (const assetPath of PORTABLE_ASSET_PATHS) {
    const sourcePath = childPath(assetRoot, assetPath);
    const info = await stat(sourcePath);
    if (!info.isFile()) {
      throw new Error(`portable asset is not a file: ${assetPath}`);
    }
    const destinationPath = childPath(clientRoot, assetPath);
    await mkdir(dirname(destinationPath), { recursive: true });
    await copyFile(sourcePath, destinationPath);
  }
}

async function copyWindowsText(sourcePath, destinationPath) {
  const source = await readFile(sourcePath, "utf8");
  await writeFile(destinationPath, source.replace(/\r?\n/gu, "\r\n"), "utf8");
}

export async function createDeterministicZip(options) {
  const releaseDirectory = resolve(options.releaseDirectory);
  const releaseName = options.releaseName;
  const zipPath = resolve(options.zipPath);
  const releaseFiles = (await walkFiles(releaseDirectory)).sort();
  const stagingRoot = await mkdtemp(join(tmpdir(), "selah-portable-archive-"));
  const stagingRelease = childPath(stagingRoot, releaseName);
  const stagingZip = childPath(stagingRoot, `${releaseName}.zip`);
  const stableTime = new Date("2000-01-01T00:00:00.000Z");

  try {
    for (const file of releaseFiles) {
      const sourcePath = childPath(releaseDirectory, file);
      const stagingPath = childPath(stagingRelease, file);
      await mkdir(dirname(stagingPath), { recursive: true });
      await copyFile(sourcePath, stagingPath);
      await utimes(stagingPath, stableTime, stableTime);
    }
    await execFileAsync(
      "zip",
      [
        "-X",
        "-q",
        stagingZip,
        ...releaseFiles.map((file) => join(releaseName, file).replaceAll(sep, "/")),
      ],
      { cwd: stagingRoot, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
    );
    await mkdir(dirname(zipPath), { recursive: true });
    await copyFile(stagingZip, zipPath);
  } finally {
    await rm(stagingRoot, { force: true, recursive: true });
  }

  return releaseFiles;
}

export async function buildPortableRelease(options = {}) {
  const outputRoot = resolve(options.outputRoot || join(projectRoot, "dist"));
  const assetRoot = resolve(
    options.assetRoot || join(outputRoot, "portable-cache/assets"),
  );
  const goBinary = options.goBinary || process.env.SELAH_GO_BIN || "go";
  const releaseDirectory = childPath(outputRoot, PORTABLE_RELEASE_NAME);
  const zipPath = childPath(outputRoot, `${PORTABLE_RELEASE_NAME}.zip`);
  const coreOutputRoot = childPath(outputRoot, ".portable-core");

  for (const assetPath of PORTABLE_ASSET_PATHS) {
    await stat(childPath(assetRoot, assetPath));
  }
  await validatePortableAssetClosure(assetRoot);

  const coreRelease = await buildRelease({
    baseBundlePath: options.baseBundlePath,
    baseIndexPath: options.baseIndexPath,
    barrierPath: options.barrierPath,
    outputRoot: coreOutputRoot,
  });

  await mkdir(outputRoot, { recursive: true });
  await rm(releaseDirectory, { force: true, recursive: true });
  await rm(zipPath, { force: true });
  await mkdir(join(releaseDirectory, "bin"), { recursive: true });
  await mkdir(join(releaseDirectory, "client"), { recursive: true });

  await Promise.all([
    compileWindowsServer(
      goBinary,
      "amd64",
      join(releaseDirectory, "bin", "selah-portable-server-x64.exe"),
    ),
    compileWindowsServer(
      goBinary,
      "arm64",
      join(releaseDirectory, "bin", "selah-portable-server-arm64.exe"),
    ),
  ]);

  await Promise.all([
    copyFile(
      join(coreRelease.releaseDirectory, "index.html"),
      join(releaseDirectory, "client", "index.html"),
    ),
    copyFile(
      join(coreRelease.releaseDirectory, "selahmc-client-v8.3.7.js"),
      join(releaseDirectory, "client", "selahmc-client-v8.3.7.js"),
    ),
    copyWindowsText(
      join(projectRoot, "portable", "START_SELAHMC.cmd"),
      join(releaseDirectory, "START_SELAHMC.cmd"),
    ),
    copyFile(
      join(projectRoot, "portable", "README.txt"),
      join(releaseDirectory, "README.txt"),
    ),
    copyFile(
      join(projectRoot, "portable", "THIRD_PARTY_NOTICES.txt"),
      join(releaseDirectory, "THIRD_PARTY_NOTICES.txt"),
    ),
  ]);
  await copyAssetTree(assetRoot, join(releaseDirectory, "client"));

  const checksumFiles = await walkFiles(releaseDirectory);
  const checksumLines = [];
  for (const file of checksumFiles.sort()) {
    checksumLines.push(`${await fileSha256(join(releaseDirectory, file))}  ${file.replaceAll(sep, "/")}`);
  }
  await writeFile(
    join(releaseDirectory, "SHA256SUMS.txt"),
    `${checksumLines.join("\n")}\n`,
    "utf8",
  );

  const stableTime = new Date("2000-01-01T00:00:00.000Z");
  const releaseFiles = (await walkFiles(releaseDirectory)).sort();
  for (const file of releaseFiles) {
    await utimes(join(releaseDirectory, file), stableTime, stableTime);
  }
  await chmod(join(releaseDirectory, "START_SELAHMC.cmd"), 0o644);

  await createDeterministicZip({
    releaseDirectory,
    releaseName: PORTABLE_RELEASE_NAME,
    zipPath,
  });
  const zipBytes = await readFile(zipPath);

  return {
    bundleSha256: coreRelease.bundleSha256,
    releaseDirectory,
    releaseName: PORTABLE_RELEASE_NAME,
    zipPath,
    zipSha256: sha256(zipBytes),
  };
}

async function main() {
  const outputRoot = resolve(join(projectRoot, "dist"));
  const assetRoot = join(outputRoot, "portable-cache/assets");
  await fetchPortableAssets({ destination: assetRoot });
  const release = await buildPortableRelease({ assetRoot, outputRoot });
  console.log(`release ${release.zipPath}`);
  console.log(`client ${release.bundleSha256}`);
  console.log(`zip ${release.zipSha256}`);
}

const modulePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (modulePath === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
