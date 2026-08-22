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
    ('net.lax1dude.eaglercraft.minecraft.EaglerTextureAtlasSprite', 'net.minecraft.client.renderer.texture.TextureAtlasSprite'),
    ('extends EaglerTextureAtlasSprite', 'extends TextureAtlasSprite'),
    ('net.minecraft.util.BlockPos', 'net.minecraft.util.math.BlockPos'),
    ('net.minecraft.util.MathHelper', 'net.minecraft.util.math.MathHelper'),
    ('net.minecraft.util.AxisAlignedBB', 'net.minecraft.util.math.AxisAlignedBB'),
    ('net.minecraft.util.Vec3', 'net.minecraft.util.math.Vec3d'),
    ('net.minecraft.util.EnumChatFormatting', 'net.minecraft.util.text.TextFormatting'),
    ('EnumChatFormatting', 'TextFormatting'),
    ('net.minecraft.client.particle.EntityFX', 'net.minecraft.client.particle.Particle'),
    ('EntityFX', 'Particle'),
]

def translate(path: pathlib.Path) -> bool:
    text = path.read_text(encoding='utf-8')
    old = text
    for a, b in replacements:
        text = text.replace(a, b)
    if 'import net.minecraft.util.math.Vec3d;' in text:
        text = text.replace('Vec3 ', 'Vec3d ').replace('Vec3(', 'Vec3d(')
    if text != old:
        path.write_text(text, encoding='utf-8')
        return True
    return False

changed = 0
for path in list(deferred.rglob('*.java')) + ([iface] if iface.exists() else []):
    changed += int(translate(path))

# 1.8's EaglerTextureAtlasSprite exposed these members to its PBR subclass.
# 1.12 folded EaglerTextureAtlasSprite into vanilla TextureAtlasSprite, so expose
# the same extension surface instead of maintaining a second incompatible atlas.
atlas = base / 'src/game/java/net/minecraft/client/renderer/texture/TextureAtlasSprite.java'
text = atlas.read_text(encoding='utf-8')
for old, new in [
    ('private final String iconName;', 'protected final String iconName;'),
    ('private AnimationMetadataSection animationMetadata;', 'protected AnimationMetadataSection animationMetadata;'),
    ('private float minU;', 'protected float minU;'),
    ('private float maxU;', 'protected float maxU;'),
    ('private float minV;', 'protected float minV;'),
    ('private float maxV;', 'protected float maxV;'),
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

# Adapt the PBR subclass to 1.12 crash-report and TextureAtlasSprite APIs.
pbr = deferred / 'texture/EaglerTextureAtlasSpritePBR.java'
text = pbr.read_text(encoding='utf-8')
text = text.replace('import java.util.concurrent.Callable;\n', '')
if 'import net.minecraft.crash.ICrashReportDetail;' not in text:
    text = text.replace('import net.minecraft.crash.CrashReportCategory;\n', 'import net.minecraft.crash.CrashReportCategory;\nimport net.minecraft.crash.ICrashReportDetail;\n')
text = text.replace('crashreportcategory.addCrashSectionCallable("Frame sizes", new Callable<String>() {',
                    'crashreportcategory.setDetail("Frame sizes", new ICrashReportDetail<String>() {')
# Override 1.12's no-argument animation entry point so TextureMap cannot drive
# the PBR atlas through the legacy single-texture animation cache.
if 'public void updateAnimation() {' not in text:
    marker = '\tpublic void updateAnimation(IFramebufferGL[] fb) {'
    insert = '\t@Override\n\tpublic void updateAnimation() {\n\t\t// PBR animation is submitted by updateAnimationPBR().\n\t}\n\n'
    text = text.replace(marker, insert + marker)
pbr.write_text(text, encoding='utf-8')

# Restore the framebuffer-targeted animation helpers used by the native PBR
# atlas. The 1.12 cache kept only the normal atlas-size helpers.
cache = base / 'src/main/java/net/lax1dude/eaglercraft/minecraft/TextureAnimationCache.java'
text = cache.read_text(encoding='utf-8')
if 'copyFrameLevelsToTex2D' not in text:
    text = text.replace('import static net.lax1dude.eaglercraft.opengl.RealOpenGLEnums.*;\n',
                        'import static net.lax1dude.eaglercraft.opengl.RealOpenGLEnums.*;\nimport static net.lax1dude.eaglercraft.internal.PlatformOpenGL.*;\n')
    if 'import net.lax1dude.eaglercraft.internal.IFramebufferGL;' not in text:
        text = text.replace('import net.lax1dude.eaglercraft.EagRuntime;\n',
                            'import net.lax1dude.eaglercraft.EagRuntime;\nimport net.lax1dude.eaglercraft.internal.IFramebufferGL;\n')
    if 'import net.lax1dude.eaglercraft.vector.Matrix3f;' not in text:
        text = text.replace('import net.lax1dude.eaglercraft.opengl.TextureCopyUtil;\n',
                            'import net.lax1dude.eaglercraft.opengl.TextureCopyUtil;\nimport net.lax1dude.eaglercraft.vector.Matrix3f;\n')
    helper = r'''
	public static final int _GL_FRAMEBUFFER = 0x8D40;

	public void copyFrameLevelsToTex2D(int animationFrame, int dx, int dy, int w, int h, IFramebufferGL[] dstFramebuffers) {
		copyFrameLevelsToTex2D(animationFrame, mipLevels, dx, dy, w, h, dstFramebuffers);
	}

	public void copyFrameLevelsToTex2D(int animationFrame, int levels, int dx, int dy, int w, int h, IFramebufferGL[] dstFramebuffers) {
		for(int i = 0; i < levels; ++i) {
			_wglBindFramebuffer(_GL_FRAMEBUFFER, dstFramebuffers[i]);
			copyFrameToTex2DDirect(animationFrame, i, dx >> i, dy >> i, w >> i, h >> i);
		}
	}

	private void copyFrameToTex2DDirect(int animationFrame, int level, int dx, int dy, int w, int h) {
		if(cacheTextures == null) throw new IllegalStateException("Cannot copy from uninitialized TextureAnimationCache");
		GlStateManager.bindTexture(cacheTextures[level]);
		TextureCopyUtil.srcSize(width >> level, (height >> level) * frameCount);
		TextureCopyUtil.blitTextureUsingViewports(0, h * animationFrame, dx, dy, w, h);
	}

	public void copyInterpolatedFrameLevelsToTex2D(int animationFrameFrom, int animationFrameTo, float factor,
			int dx, int dy, int w, int h, IFramebufferGL[] dstFramebuffers) {
		for(int i = 0; i < mipLevels; ++i) {
			_wglBindFramebuffer(_GL_FRAMEBUFFER, dstFramebuffers[i]);
			copyInterpolatedFrameToTex2DDirect(animationFrameFrom, animationFrameTo, factor, i,
					dx >> i, dy >> i, w >> i, h >> i);
		}
	}

	private void copyInterpolatedFrameToTex2DDirect(int animationFrameFrom, int animationFrameTo, float factor,
			int level, int dx, int dy, int w, int h) {
		if(cacheTextures == null) throw new IllegalStateException("Cannot copy from uninitialized TextureAnimationCache");
		GlStateManager.viewport(dx, dy, w, h);
		GlStateManager.bindTexture(cacheTextures[level]);
		GlStateManager.disableBlend();
		Matrix3f matrix = new Matrix3f();
		matrix.m11 = 1.0f / frameCount;
		matrix.m21 = matrix.m11 * animationFrameFrom;
		SpriteLevelMixer.setMatrix3f(matrix);
		SpriteLevelMixer.setBlendColor(factor, factor, factor, factor);
		SpriteLevelMixer.setBiasColor(0.0f, 0.0f, 0.0f, 0.0f);
		SpriteLevelMixer.drawSprite(0);
		matrix.m21 = matrix.m11 * animationFrameTo;
		SpriteLevelMixer.setMatrix3f(matrix);
		float fac1 = 1.0f - factor;
		SpriteLevelMixer.setBlendColor(fac1, fac1, fac1, fac1);
		GlStateManager.enableBlend();
		GlStateManager.blendFunc(GL_ONE, GL_ONE);
		SpriteLevelMixer.drawSprite(0);
		GlStateManager.disableBlend();
		GlStateManager.blendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
	}

'''
    text = text.replace('\tpublic int getFrameCount() {', helper + '\tpublic int getFrameCount() {')
cache.write_text(text, encoding='utf-8')

print(f'deferred java files: {sum(1 for _ in deferred.rglob("*.java"))}')
print(f'namespace/API files changed: {changed}')
