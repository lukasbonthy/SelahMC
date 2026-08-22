#!/usr/bin/env python3
import pathlib, shutil, sys, re

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

# Copy the tiny accelerated-particle contract used by the deferred renderers.
accel_src = up / "src/main/java/net/lax1dude/eaglercraft/v1_8/minecraft/IAcceleratedParticleEngine.java"
if accel_src.is_file():
    accel_dst = base / "src/main/java/net/lax1dude/eaglercraft/minecraft/IAcceleratedParticleEngine.java"
    accel_dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(accel_src, accel_dst)

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
    ("net.minecraft.client.particle.EntityFX", "net.minecraft.client.particle.Particle"),
    ("EntityFX.interpPos", "Particle.interpPos"),
]
for p in list(dst.rglob("*.java")) + list((base / "src/main/java/net/lax1dude/eaglercraft/minecraft").glob("IAcceleratedParticleEngine.java")):
    s = p.read_text(encoding="utf-8")
    for a, b in replacements:
        s = s.replace(a, b)
    p.write_text(s, encoding="utf-8")

# 1.12 already has the Eagler animation-cache additions directly on TextureAtlasSprite.
# Expose the same protected state the native PBR subclass needs rather than maintaining
# a second incompatible atlas-sprite hierarchy.
atlas = base / "src/game/java/net/minecraft/client/renderer/texture/TextureAtlasSprite.java"
s = atlas.read_text(encoding="utf-8")
for old, new in [
    ("private final String iconName;", "protected final String iconName;"),
    ("private AnimationMetadataSection animationMetadata;", "protected AnimationMetadataSection animationMetadata;"),
    ("private float minU;", "protected float minU;"),
    ("private float maxU;", "protected float maxU;"),
    ("private float minV;", "protected float minV;"),
    ("private float maxV;", "protected float maxV;"),
    ("private void allocateFrameTextureData(int index)", "protected void allocateFrameTextureData(int index)"),
    ("private static int[][] getFrameTextureData(int[][] data, int rows, int columns, int p_147962_3_)", "protected static int[][] getFrameTextureData(int[][] data, int rows, int columns, int p_147962_3_)"),
    ("private void resetSprite()", "protected void resetSprite()"),
]:
    s = s.replace(old, new)
# Provide the two names used by the PBR clock/compass factory.
needle = "public class TextureAtlasSprite {\n"
if "locationNameClock" not in s:
    s = s.replace(needle, needle + "\tprotected static String locationNameClock = \"builtin/clock\";\n\tprotected static String locationNameCompass = \"builtin/compass\";\n")
atlas.write_text(s, encoding="utf-8")

# Adapt the PBR sprite subclass to 1.12's TextureAtlasSprite implementation.
pbr = dst / "texture/EaglerTextureAtlasSpritePBR.java"
s = pbr.read_text(encoding="utf-8")
s = s.replace("import java.util.concurrent.Callable;\n", "import net.minecraft.crash.ICrashReportDetail;\n")
s = s.replace("import com.carrotsearch.hppc.cursors.IntCursor;\n", "")
s = s.replace("import net.lax1dude.eaglercraft.minecraft.EaglerTextureAtlasSprite;\n", "import net.minecraft.client.renderer.texture.TextureAtlasSprite;\n")
s = s.replace("extends EaglerTextureAtlasSprite", "extends TextureAtlasSprite")
s = s.replace("for (IntCursor cur : meta.getFrameIndexSet()) {\n\t\t\t\t\tint i1 = cur.value;", "for (Integer cur : meta.getFrameIndexSet()) {\n\t\t\t\t\tint i1 = cur.intValue();")
s = s.replace("addCrashSectionCallable(\"Frame sizes\", new Callable<String>()", "setDetail(\"Frame sizes\", new ICrashReportDetail<String>()")
pbr.write_text(s, encoding="utf-8")

# Renderer resources live in src/main/resources in modern workspaces.
resource_candidates = [
    up / "src/main/resources/assets/eagler/glsl/deferred",
    up / "src/main/resources/assets/eagler/glsl",
    up / "sources/resources/assets/eagler/glsl/deferred",
    up / "sources/resources/assets/eagler/glsl",
]
for cand in resource_candidates:
    if cand.is_dir():
        anchor = next(x for x in cand.parents if x.name == "resources")
        rel = cand.relative_to(anchor)
        out = base / "src/main/resources" / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        if out.exists():
            shutil.rmtree(out)
        shutil.copytree(cand, out)
        print(f"copied renderer resources: {rel}")
        break

print(f"ported deferred Java package: {sum(1 for _ in dst.rglob('*.java'))} files")
