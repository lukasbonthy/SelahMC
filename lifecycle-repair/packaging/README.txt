SelahMC v8.3.7 Lifecycle Transaction
================================

This package repairs the multiplayer join lifecycle gap in the exact deployed
v8.3.3 client whose SHA-256 begins with 6e775ed5. It preserves GUI/input ticks
while unsafe controller and world work is held, so join and server-resource
prompts remain clickable. It also maps stale deferred RenderChunk fields onto
the current base fields and keeps integrated-server block hooks out of
client-only settings when no Minecraft client singleton exists.

The page no longer loads the temporary selah-diagnostics.js transport. That
script POSTed every loader event and console warning to the nonexistent
/__selah_diag endpoint, producing the repeated 404 flood in DevTools.

Version 8.3.7 begins the join transaction before the first asynchronous load
operation and commits only after player and camera setup. It preserves the
transaction generation across TeaVM suspensions and rejects obsolete loads.
Closing a server-resource prompt no longer reads health from a missing player.
Mouse clicks, scrolls, keyboard events, and modal screens remain responsive
while unsafe gameplay waits; queued gameplay input is drained during joins.
The controller, camera, fog, sky, lightmap, deferred, Tuff, and render-pass
lifecycle gates remain enabled. Normal committed-world behavior is retained.

Verification includes the generated JavaScript, real saved continuation
frames in a deterministic test harness, archive checksums, and installer
rollback tests. Live multiplayer/resource-pack validation is still required;
the development cloud browser could not reach the local test server.

Windows PowerShell upload:

scp "$env:USERPROFILE\Downloads\SelahMC-v8.3.7-Lifecycle-Transaction.zip" ubuntu@135.148.42.63:/home/ubuntu/

Then connect:

ssh ubuntu@135.148.42.63

Run on the VPS:

cd /home/ubuntu
unzip -q -o SelahMC-v8.3.7-Lifecycle-Transaction.zip -d /home/ubuntu/selahmc-v8.3.7-lifecycle-transaction
cd /home/ubuntu/selahmc-v8.3.7-lifecycle-transaction/SelahMC-v8.3.7-Lifecycle-Transaction
chmod +x install.sh
sudo ./install.sh

Default live directory: /srv/selahmc/client
Default backups: /home/ubuntu/selahmc-client-backups/<UTC timestamp>

The installer verifies every package hash before it touches the live client,
keeps selahmc-client-v8.3.3.js in place, backs up the current index and client,
and atomically switches index.html to the versioned v8.3.7 bundle.
