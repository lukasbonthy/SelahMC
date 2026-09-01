# SelahMC v8.3.6 lifecycle test

This branch creates a private GitHub Codespace test server automatically.
It downloads the hash-pinned SelahMC v8.3.3 base, applies the tested v8.3.6
world-lifecycle repair, verifies the generated client and assets, and forwards
port 8000. The resource-pack prompt keeps receiving GUI input while unsafe
world, renderer, and player-controller work remains gated during joins.

[Open the v8.3.6 test in GitHub Codespaces](https://codespaces.new/lukasbonthy/SelahMC/tree/lifecycle-barrier-v8.3.6?quickstart=1)

The `main` branch and the production SelahMC deployment are not modified.
