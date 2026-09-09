import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Exercise the shipped executable on Windows, not a Linux rebuild or mock.
assert.equal(process.platform, 'win32', 'Run this check on Windows');
const root = resolve(process.argv[2]);
const logs = resolve('portable-runtime-logs');
await mkdir(logs, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = ['index.html', 'selahmc-client-v8.3.10.js', 'selahmc-assets-v8.3.3.epk'];
const expected = new Map();
for (const file of files) {
  const bytes = await readFile(join(root, 'client', file));
  expected.set(file, { hash: hash(bytes), prefix: bytes.subarray(0, 1024) });
}

for (const scenario of [
  { name: 'normal-browser-launch', open: true, env: {} },
  { name: 'frequent-gc', open: false, env: { GOGC: '20', GODEBUG: 'gctrace=1' } },
]) {
  const child = spawn(join(root, 'bin', 'selah-portable-server-x64.exe'),
    ['--root', join(root, 'client'), '--port', '3001', `--open=${scenario.open}`],
    { env: { ...process.env, ...scenario.env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', failure = null, address;
  const append = chunk => { output = (output + chunk.toString()).slice(-2_000_000); };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('error', error => { failure = error; });
  // Register immediately to avoid missing a fast exit during startup.
  const exited = once(child, 'close');
  exited.catch(() => {});
  const alive = () => {
    if (failure) throw failure;
    assert.equal(child.exitCode, null, `Server exited: ${output}`);
    assert.equal(child.signalCode, null, `Server was killed: ${output}`);
  };
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      alive();
      address = output.match(/Open: (http:\/\/127\.0\.0\.1:\d+)\//)?.[1];
      if (address) break;
      await delay(100);
    }
    assert.ok(address, `Server did not report readiness: ${output}`);
    let transferred = 0;
    // Concurrent full and partial reads exercise file serving and allocation
    // while GC scans stacks, the phase named in the user's fatal crash.
    await Promise.all(Array.from({ length: 8 }, async (_, worker) => {
      for (let iteration = 0; iteration < 18; iteration++) {
        alive();
        const file = files[(worker + iteration) % files.length];
        const range = iteration % 3 === 0;
        const response = await fetch(`${address}/${file}?probe=${worker}-${iteration}`, {
          headers: range ? { Range: 'bytes=0-1023' } : {},
          signal: AbortSignal.timeout(30000),
        });
        assert.equal(response.status, range ? 206 : 200);
        const body = Buffer.from(await response.arrayBuffer());
        if (range) assert.deepEqual(body, expected.get(file).prefix);
        else assert.equal(hash(body), expected.get(file).hash);
        transferred += body.length;
      }
    }));
    // Allow background collection after the burst to finish before declaring
    // that the process survived. This is not a gameplay or renderer test.
    await delay(3000);
    alive();
    if (scenario.name === 'frequent-gc') {
      assert.match(output, /gc \d+ @/, 'The stress run must actually perform GC');
    }
    const result = { scenario: scenario.name, requests: 144, transferred, survived: true };
    console.log(JSON.stringify(result));
    await writeFile(join(logs, `${scenario.name}.json`), JSON.stringify(result, null, 2));
  } finally {
    child.kill();
    await Promise.race([exited.catch(() => {}), delay(5000)]);
    await writeFile(join(logs, `${scenario.name}.log`), output);
  }
}
