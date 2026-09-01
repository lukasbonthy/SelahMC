SelahMC v8.3.6 Lifecycle Barrier
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

The existing controller, camera, fog, sky, lightmap, deferred, Tuff, and
render-pass lifecycle gates remain enabled.

Windows PowerShell upload:

scp "$env:USERPROFILE\Downloads\SelahMC-v8.3.6-Lifecycle-Barrier.zip" ubuntu@135.148.42.63:/home/ubuntu/

Then connect:

ssh ubuntu@135.148.42.63

Run on the VPS:

cd /home/ubuntu
unzip -q -o SelahMC-v8.3.6-Lifecycle-Barrier.zip -d /home/ubuntu/selahmc-v8.3.6-lifecycle-barrier
cd /home/ubuntu/selahmc-v8.3.6-lifecycle-barrier/SelahMC-v8.3.6-Lifecycle-Barrier
chmod +x install.sh
sudo ./install.sh

Default live directory: /srv/selahmc/client
Default backups: /home/ubuntu/selahmc-client-backups/<UTC timestamp>

The installer verifies every package hash before it touches the live client,
keeps selahmc-client-v8.3.3.js in place, backs up the current index and client,
and atomically switches index.html to the versioned v8.3.6 bundle.
