# SelahMC v8.3.7 validation

The reported v8.3.6 resource-pack confirmation crash reached `getHealth` with a null player. The repair now treats world loading as an explicit transaction and lets GUI events continue while gameplay waits for completion.

## Changes

- Begin or invalidate the transaction at `G6r` entry, before its first suspension; commit after the original final player/camera setup.
- Save the transaction generation on TeaVM continuation frames. Superseded loads return cancellation, and all 13 direct callers propagate it before changing player fields or screens.
- Keep readiness checks observational: checking an unfinished or temporarily unavailable world cannot cancel its transaction or leave it permanently blocked.
- Preserve screen closing and the normal healthy/dead-player GUI paths. Drain input while joining; guard scroll and modal-screen paths.
- Save and recheck generation after child completion in all five gameplay input handlers, controller updates, and camera updates. Never return before a pending child has restored its frames.
- Keep the existing render, potion, fog, sky, deferred-field, and integrated-server fixes and the original protocol identity/assets.

These continuation changes extend the initial September 1 plan. The original proposal began too late and did not propagate cancellation into packet handlers; regression tests and independent review exposed those gaps before publishing.

## Verification on September 5, 2026

- 104 Node tests passed with no skips or failures, including generated-runtime behavior, nested saved-frame suspension/resume, current and replaced worlds, GUI input, package checksums, and installer backups.
- Portable-server `go test ./...` and `go vet ./...` passed using Go 1.27.0.
- The actual Codespaces setup and generated-client hash check passed against a local mirror of the pinned inputs and assets.
- The generated JavaScript passed the packaging syntax check. The GitHub release workflow repeats tests, builds both archives, and verifies ZIP integrity before publication.

Base client SHA-256: `6e775ed50e83a6ba976aea593e0ef70ed74b662f652f3f47f616499a85005ba4`

Repaired client SHA-256: `8d7e33e1f2ee1c2cc229e0d82160c0a4bbc7708a47e2f2c9bbaa1b20a916f584`

## Remaining validation

The cloud browser returned `ERR_BLOCKED_BY_CLIENT` for the workspace's local server. Live multiplayer joining, server-resource download acceptance, and gameplay therefore remain unverified. The generated-runtime tests execute real transformed functions with deterministic dependency stubs; they do not replace an end-to-end browser/server test. The release is marked as a prerelease for that reason.

The work updates PR #10's repair branch and produces portable/VPS archives. Deployment is performed by the included installer when run on the VPS.
