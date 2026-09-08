SelahMC v8.3.9 Portable for Windows
===================================

This is the no-install school-PC build. It includes the complete SelahMC
v8.3.9 client, its 1.12.2 asset pack, plugins, launcher images, and portable
localhost servers for Windows x64 and Windows ARM64.

How to start
------------

1. Extract the ENTIRE ZIP. Do not run it from inside the ZIP preview.
2. Open the extracted SelahMC folder.
3. Double-click START_SELAHMC.cmd.
4. Keep the SelahMC command window open while playing.

The launcher requires no administrator access, installation, Python, Node,
npm, registry change, or Windows service. It serves the bundled client only
on localhost and opens its selected port in the default browser.

Internet access is still required to join wss://mc.selahmc.me and for online
features such as relays, skins, Microsoft sign-in, and server resource packs.

Shader settings
---------------

The Shaders entry opens the native deferred/PBR settings in the Selah client.
The built-in renderer and its original controls are retained. The separate
OptiFine Packs... action opens the optional importer; it is not the deferred
shader settings screen. Choose Done to return to the client.

This is a prerelease. Automated routing and packaging checks do not establish
that all native rendering options work on every GPU. Keep the previous package
for rollback; no browser storage or saved worlds are deleted.

If it does not start
--------------------

- Make sure the whole folder was extracted.
- Close an older SelahMC portable command window if port 3001 is already used.
- A school security policy may block downloaded executable files. This package
  does not alter or bypass school security controls.

SHA256SUMS.txt contains a SHA-256 checksum for every packaged file.

The launcher tries ports 3001-3010 and opens the port it successfully binds.
A different port has separate browser storage; reopen the original port to access
worlds saved there. No browser storage or saved worlds are deleted.
