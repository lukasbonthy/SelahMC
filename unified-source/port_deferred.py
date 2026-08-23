#!/usr/bin/env python3
from __future__ import annotations

import pathlib
import re
import sys

base = pathlib.Path(sys.argv[1]).resolve()
deferred = base / 'src/main/java/net/lax1dude/eaglercraft/opengl/ext/deferred'
iface = base / 'src/main/java/net/lax1dude/eaglercraft/minecraft/IAcceleratedParticleEngine.java'
if not deferred.is_dir():
    raise SystemExit(f'missing deferred tree: {deferred}')

replacements: list[tuple[str, str]] = [
    ('net.lax1dude.eaglercraft.v1_8.', 'net.lax1dude.eaglercraft.'),
    ('package net.lax1dude.eaglercraft.v1_8.', 'package net.lax1dude.eaglercraft.'),
    ('net.lax1dude.eaglercraft.log4j.LogManager', 'org.apache.logging.log4j.LogManager'),
    ('net.lax1dude.eaglercraft.log4j.Logger', 'org.apache.logging.log4j.Logger'),
    ('IBufferArrayGL', 'IVertexArrayGL'),
    ('EaglercraftGPU.bindGLBufferArray', 'EaglercraftGPU.bindGLVertexArray'),
    ('net.lax1dude.eaglercraft.minecraft.EaglerTextureAtlasSprite', 'net.minecraft.client.renderer.texture.TextureAtlasSprite'),
    ('net.minecraft.util.BlockPos', 'net.minecraft.util.math.BlockPos'),
    ('net.minecraft.util.MathHelper', 'net.minecraft.util.math.MathHelper'),
    ('net.minecraft.util.AxisAlignedBB', 'net.minecraft.util.math.AxisAlignedBB'),
    ('net.minecraft.util.Vec3', 'net.minecraft.util.math.Vec3d'),
    ('net.minecraft.util.EnumChatFormatting', 'net.minecraft.util.text.TextFormatting'),
    ('EnumChatFormatting', 'TextFormatting'),
    ('net.minecraft.client.particle.EntityFX', 'net.minecraft.client.particle.Particle'),
    ('EntityFX', 'Particle'),
    ('Item.itemRegistry', 'Item.REGISTRY'),
    ('TextureMap.locationBlocksTexture', 'TextureMap.LOCATION_BLOCKS_TEXTURE'),
    ('MathHelper.clamp_double', 'MathHelper.clamp'),
    ('MathHelper.clamp_float', 'MathHelper.clamp'),
    ('MathHelper.sqrt_float', 'MathHelper.sqrt'),
    ('MathHelper.floor_double', 'MathHelper.floor'),
    ('MathHelper.floor_float', 'MathHelper.floor'),
    ('.theWorld', '.world'),
    ('.thePlayer', '.player'),
]

def translate(path: pathlib.Path) -> bool:
    text = path.read_text(encoding='utf-8')
    old = text
    for a, b in replacements:
        text = text.replace(a, b)
    # Fix accidental prefix replacement in TextureClock/Compass subclasses.
    text = text.replace('extends TextureAtlasSpritePBR', 'extends EaglerTextureAtlasSpritePBR')
    # Only the PBR base itself changes parent class.
    if path.name == 'EaglerTextureAtlasSpritePBR.java':
        text = text.replace('extends EaglerTextureAtlasSprite', 'extends TextureAtlasSprite')
    if 'import net.minecraft.util.math.Vec3d;' in text:
        text = text.replace('Vec3 ', 'Vec3d ').replace('Vec3(', 'Vec3d(')
    if text != old:
        path.write_text(text, encoding='utf-8')
        return True
    return False

changed = 0
for path in list(deferred.rglob('*.java')) + ([iface] if iface.exists() else []):
    changed += int(translate(path))

# Match the extension surface the deferred PBR atlas had in 1.8.
atlas = base / 'src/game/java/net/minecraft/client/renderer/texture/TextureAtlasSprite.java'
text = atlas.read_text(encoding='utf-8')
for old, new in [
    ('private final String iconName;', 'protected final String iconName;'),
    ('private AnimationMetadataSection animationMetadata;', 'protected AnimationMetadataSection animationMetadata;'),
    ('private float minU;', 'protected float minU;'), ('private float maxU;', 'protected float maxU;'),
    ('private float minV;', 'protected float minV;'), ('private float maxV;', 'protected float maxV;'),
    ('private void allocateFrameTextureData(int index)', 'protected void allocateFrameTextureData(int index)'),
    ('private static int[][] getFrameTextureData(int[][] data, int rows, int columns, int p_147962_3_)',
     'protected static int[][] getFrameTextureData(int[][] data, int rows, int columns, int p_147962_3_)'),
    ('private void resetSprite()', 'protected void resetSprite()'),
]:
    text = text.replace(old, new)
needle = '\tprotected int tickCounter;\n'
if 'locationNameClock' not in text:
    text = text.replace(needle, needle + '\tprotected static String locationNameClock = "builtin/clock";\n\tprotected static String locationNameCompass = "builtin/compass";\n\n\tpublic static void setLocationNameClock(String s) { locationNameClock = s; }\n\tpublic static void setLocationNameCompass(String s) { locationNameCompass = s; }\n')
atlas.write_text(text, encoding='utf-8')

# Adapt the PBR subclass to 1.12 crash-report APIs.
pbr = deferred / 'texture/EaglerTextureAtlasSpritePBR.java'
text = pbr.read_text(encoding='utf-8')
text = text.replace('import java.util.concurrent.Callable;\n', '')
if 'import net.minecraft.crash.ICrashReportDetail;' not in text:
    text = text.replace('import net.minecraft.crash.CrashReportCategory;\n', 'import net.minecraft.crash.CrashReportCategory;\nimport net.minecraft.crash.ICrashReportDetail;\n')
text = text.replace('crashreportcategory.addCrashSectionCallable("Frame sizes", new Callable<String>() {',
                    'crashreportcategory.setDetail("Frame sizes", new ICrashReportDetail<String>() {')
if 'public void updateAnimation() {' not in text:
    marker = '\tpublic void updateAnimation(IFramebufferGL[] fb) {'
    text = text.replace(marker, '\t@Override\n\tpublic void updateAnimation() {\n\t\t// driven by updateAnimationPBR()\n\t}\n\n' + marker)
pbr.write_text(text, encoding='utf-8')

# Framebuffer-targeted animation helpers used by the PBR atlas. For interpolated
# frames use the nearest source frame on 1.12 first; this avoids relying on the
# older SpriteLevelMixer matrix API that no longer exists.
cache = base / 'src/main/java/net/lax1dude/eaglercraft/minecraft/TextureAnimationCache.java'
text = cache.read_text(encoding='utf-8')
if 'copyFrameLevelsToTex2D' not in text:
    text = text.replace('import static net.lax1dude.eaglercraft.opengl.RealOpenGLEnums.*;\n',
                        'import static net.lax1dude.eaglercraft.opengl.RealOpenGLEnums.*;\nimport static net.lax1dude.eaglercraft.internal.PlatformOpenGL.*;\n')
    if 'import net.lax1dude.eaglercraft.internal.IFramebufferGL;' not in text:
        text = text.replace('import net.lax1dude.eaglercraft.EagRuntime;\n', 'import net.lax1dude.eaglercraft.EagRuntime;\nimport net.lax1dude.eaglercraft.internal.IFramebufferGL;\n')
    helper = r'''
	public static final int _GL_FRAMEBUFFER = 0x8D40;

	public void copyFrameLevelsToTex2D(int animationFrame, int dx, int dy, int w, int h, IFramebufferGL[] dstFramebuffers) {
		for(int i = 0; i < mipLevels; ++i) {
			_wglBindFramebuffer(_GL_FRAMEBUFFER, dstFramebuffers[i]);
			if(cacheTextures == null) throw new IllegalStateException("Cannot copy from uninitialized TextureAnimationCache");
			GlStateManager.bindTexture(cacheTextures[i]);
			TextureCopyUtil.srcSize(width >> i, (height >> i) * frameCount);
			TextureCopyUtil.blitTextureUsingViewports(0, (h >> i) * animationFrame, dx >> i, dy >> i, w >> i, h >> i);
		}
	}

	public void copyInterpolatedFrameLevelsToTex2D(int animationFrameFrom, int animationFrameTo, float factor,
			int dx, int dy, int w, int h, IFramebufferGL[] dstFramebuffers) {
		copyFrameLevelsToTex2D(factor < 0.5f ? animationFrameFrom : animationFrameTo, dx, dy, w, h, dstFramebuffers);
	}

'''
    text = text.replace('\tpublic int getFrameCount() {', helper + '\tpublic int getFrameCount() {')
cache.write_text(text, encoding='utf-8')

# Native deferred settings live in GameSettings and are persisted beside normal
# options so GuiShaderConfig is functional, not just visible.
gs = base / 'src/game/java/net/minecraft/client/settings/GameSettings.java'
text = gs.read_text(encoding='utf-8')
if 'import net.lax1dude.eaglercraft.opengl.ext.deferred.EaglerDeferredConfig;' not in text:
    text = text.replace('import net.lax1dude.eaglercraft.Mouse;\n', 'import net.lax1dude.eaglercraft.Mouse;\nimport net.lax1dude.eaglercraft.opengl.ext.deferred.EaglerDeferredConfig;\n')
if 'public EaglerDeferredConfig deferredShaderConf' not in text:
    anchor = '\tpublic boolean customItemsOF = true;\n'
    text = text.replace(anchor, anchor + '\n\tpublic boolean shaders = false;\n\tpublic boolean shadersAODisable = false;\n\tpublic EaglerDeferredConfig deferredShaderConf = new EaglerDeferredConfig();\n')
if 'deferredShaderConf.readOption(parts.get(0), parts.get(1));' not in text:
    text = text.replace('nbttagcompound.setString(parts.get(0), parts.get(1));',
                        'nbttagcompound.setString(parts.get(0), parts.get(1));\n\t\t\t\t\t\tdeferredShaderConf.readOption(parts.get(0), parts.get(1));')
if 'deferredShaderConf.writeOptions(printwriter);' not in text:
    text = text.replace('\t\t\tprintwriter.close();', '\t\t\tdeferredShaderConf.writeOptions(printwriter);\n\n\t\t\tprintwriter.close();')
gs.write_text(text, encoding='utf-8')

# Deferred lens flare code needs the real per-frame FOV helper.
er = base / 'src/game/java/net/minecraft/client/renderer/EntityRenderer.java'
text = er.read_text(encoding='utf-8')
text = text.replace('private float getFOVModifier(float partialTicks, boolean useFOVSetting)',
                    'public float getFOVModifier(float partialTicks, boolean useFOVSetting)')
er.write_text(text, encoding='utf-8')

print(f'deferred java files: {sum(1 for _ in deferred.rglob("*.java"))}')
print(f'namespace/API files changed: {changed}')
