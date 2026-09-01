import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { replaceExact, transformBundle } from "./build-lifecycle-repair.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export const RELEASE_NAME = "SelahMC-v8.3.6-Lifecycle-Barrier";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function rewriteClientScript(index, bundleSha256) {
  const clientScriptPattern =
    /src="selahmc-client-v\d+\.\d+\.\d+\.js(?:\?v=[a-f0-9]+)?"/gu;
  const matches = index.match(clientScriptPattern) || [];
  if (matches.length !== 1) {
    throw new Error(
      `index client script: expected 1, found ${matches.length}`,
    );
  }
  return index.replace(
    clientScriptPattern,
    `src="selahmc-client-v8.3.6.js?v=${bundleSha256.slice(0, 8)}"`,
  );
}

function assertChildPath(parent, child) {
  const normalizedParent = `${resolve(parent)}${sep}`;
  const normalizedChild = resolve(child);
  if (!normalizedChild.startsWith(normalizedParent)) {
    throw new Error(`refusing release path outside output root: ${normalizedChild}`);
  }
}

export async function buildRelease(options = {}) {
  const outputRoot = resolve(options.outputRoot || join(projectRoot, "dist"));
  const baseBundlePath = resolve(
    options.baseBundlePath ||
      join(projectRoot, "../recovered-live/selahmc-client-v8.3.3.js"),
  );
  const baseIndexPath = resolve(
    options.baseIndexPath || join(projectRoot, "../recovered-live/index.html"),
  );
  const barrierPath = resolve(
    options.barrierPath || join(projectRoot, "src/world-lifecycle-barrier.js"),
  );
  const releaseDirectory = join(outputRoot, RELEASE_NAME);
  const zipPath = join(outputRoot, `${RELEASE_NAME}.zip`);
  assertChildPath(outputRoot, releaseDirectory);
  assertChildPath(outputRoot, zipPath);

  const [baseSource, baseIndex, barrierSource, installerSource, readmeSource] =
    await Promise.all([
      readFile(baseBundlePath, "utf8"),
      readFile(baseIndexPath, "utf8"),
      readFile(barrierPath, "utf8"),
      readFile(join(projectRoot, "packaging/install.sh"), "utf8"),
      readFile(join(projectRoot, "packaging/README.txt"), "utf8"),
    ]);
  const transformed = transformBundle(baseSource, barrierSource);
  const bundleSha256 = transformed.outputSha256;
  const versionedIndex = rewriteClientScript(baseIndex, bundleSha256);
  const patchedIndex = replaceExact(
    versionedIndex,
    '\t\t<script type="text/javascript" src="selah-diagnostics.js"></script>\n',
    "",
    1,
    "broken remote diagnostics script",
  );

  await mkdir(outputRoot, { recursive: true });
  await rm(releaseDirectory, { force: true, recursive: true });
  await rm(zipPath, { force: true });
  await mkdir(releaseDirectory, { recursive: true });

  const files = {
    "README.txt": readmeSource,
    "index.html": patchedIndex,
    "install.sh": installerSource,
    "selahmc-client-v8.3.6.js": transformed.code,
  };
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(join(releaseDirectory, name), contents, "utf8");
  }
  await chmod(join(releaseDirectory, "install.sh"), 0o755);

  const checksumLines = Object.entries(files).map(
    ([name, contents]) => `${sha256(contents)}  ${name}`,
  );
  await writeFile(
    join(releaseDirectory, "SHA256SUMS"),
    `${checksumLines.join("\n")}\n`,
    "utf8",
  );

  await execFileAsync(
    process.execPath,
    ["--check", join(releaseDirectory, "selahmc-client-v8.3.6.js")],
    { encoding: "utf8" },
  );

  const stableTime = new Date("2000-01-01T00:00:00.000Z");
  const releaseFiles = [
    "README.txt",
    "SHA256SUMS",
    "index.html",
    "install.sh",
    "selahmc-client-v8.3.6.js",
  ];
  for (const name of releaseFiles) {
    await utimes(join(releaseDirectory, name), stableTime, stableTime);
  }

  await execFileAsync(
    "zip",
    [
      "-X",
      "-q",
      zipPath,
      ...releaseFiles.map((name) => `${RELEASE_NAME}/${name}`),
    ],
    { cwd: outputRoot, encoding: "utf8" },
  );
  const zipContents = await readFile(zipPath);

  return {
    bundleSha256,
    releaseDirectory,
    zipPath,
    zipSha256: sha256(zipContents),
  };
}

async function main() {
  const release = await buildRelease();
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
