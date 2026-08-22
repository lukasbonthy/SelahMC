#!/usr/bin/env python3
import pathlib, shutil, sys

base = pathlib.Path(sys.argv[1]).resolve()
up = pathlib.Path(sys.argv[2]).resolve()

candidates = [
    up / "src/main/java/net/lax1dude/eaglercraft/v1_8/opengl/ext/deferred",
    up / "sources/main/java/net/lax1dude/eaglercraft/v1_8/opengl/ext/deferred",
]
src = next((p for p in candidates if p.is_dir()), None)
if src is None:
    raise SystemExit("missing deferred source tree")
dst = base / "src/main/java/net/lax1dude/eaglercraft/opengl/ext/deferred"
if dst.exists():
    shutil.rmtree(dst)
shutil.copytree(src, dst)

# Mechanical names that changed between the 1.8 renderer and the 1.12.2 u2 base.
replacements = [
    ("net.lax1dude.eaglercraft.v1_8", "net.lax1dude.eaglercraft"),
    ("net.lax1dude.eaglercraft.log4j.LogManager", "org.apache.logging.log4j.LogManager"),
    ("net.lax1dude.eaglercraft.log4j.Logger", "org.apache.logging.log4j.Logger"),
    ("net.minecraft.util.MathHelper", "net.minecraft.util.math.MathHelper"),
    ("net.minecraft.util.AxisAlignedBB", "net.minecraft.util.math.AxisAlignedBB"),
    ("net.minecraft.util.BlockPos", "net.minecraft.util.math.BlockPos"),
    ("net.minecraft.util.EnumChatFormatting", "net.minecraft.util.text.TextFormatting"),
    ("EnumChatFormatting", "TextFormatting"),
]
for p in dst.rglob("*.java"):
    s = p.read_text(encoding="utf-8")
    for a, b in replacements:
        s = s.replace(a, b)
    p.write_text(s, encoding="utf-8")

# Renderer resources live in src/main/resources in modern workspaces.
resource_candidates = [
    up / "src/main/resources/assets/eagler/glsl/deferred",
    up / "src/main/resources/assets/eagler/glsl",
    up / "sources/resources/assets/eagler/glsl/deferred",
    up / "sources/resources/assets/eagler/glsl",
]
for cand in resource_candidates:
    if cand.is_dir():
        # Preserve assets/eagler/... from whichever resource root was found.
        anchor = next(x for x in cand.parents if x.name in ("resources",))
        rel = cand.relative_to(anchor)
        out = base / "src/main/resources" / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        if out.exists():
            shutil.rmtree(out)
        shutil.copytree(cand, out)
        print(f"copied renderer resources: {rel}")
        break

print(f"ported deferred Java package: {sum(1 for _ in dst.rglob('*.java'))} files")
