#!/usr/bin/env python3
import pathlib, shutil, sys

base = pathlib.Path(sys.argv[1]).resolve()
up = pathlib.Path(sys.argv[2]).resolve()

src = up / "sources/main/java/net/lax1dude/eaglercraft/v1_8/opengl/ext/deferred"
dst = base / "src/main/java/net/lax1dude/eaglercraft/opengl/ext/deferred"
if not src.is_dir():
    raise SystemExit(f"missing deferred source: {src}")
if dst.exists():
    shutil.rmtree(dst)
shutil.copytree(src, dst)

# The 1.12 u2 baseline drops the historical v1_8 package segment.
for p in dst.rglob("*.java"):
    s = p.read_text(encoding="utf-8")
    s = s.replace("net.lax1dude.eaglercraft.v1_8", "net.lax1dude.eaglercraft")
    p.write_text(s, encoding="utf-8")

# Copy the deferred shader resources so source and renderer resources stay in one build tree.
resource_candidates = [
    up / "sources/resources/assets/eagler/glsl/deferred",
    up / "sources/resources/assets/eagler/glsl",
]
for cand in resource_candidates:
    if cand.is_dir():
        rel = cand.relative_to(up / "sources/resources")
        out = base / "src/main/resources" / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        if out.exists():
            shutil.rmtree(out)
        shutil.copytree(cand, out)
        break

print(f"ported deferred Java package: {sum(1 for _ in dst.rglob('*.java'))} files")
