#!/usr/bin/env python3
from __future__ import annotations

import pathlib
import sys

base = pathlib.Path(sys.argv[1]).resolve()
deferred = base / 'src/main/java/net/lax1dude/eaglercraft/opengl/ext/deferred'
if not deferred.is_dir():
    raise SystemExit(f'missing deferred tree: {deferred}')

# The 1.12 workspace dropped the v1_8 package segment while retaining the
# Eagler platform classes. Minecraft 1.12 also moved math primitives from
# net.minecraft.util into net.minecraft.util.math.
replacements: list[tuple[str, str]] = [
    ('net.lax1dude.eaglercraft.v1_8.', 'net.lax1dude.eaglercraft.'),
    ('package net.lax1dude.eaglercraft.v1_8.', 'package net.lax1dude.eaglercraft.'),
    ('net.lax1dude.eaglercraft.log4j.LogManager', 'org.apache.logging.log4j.LogManager'),
    ('net.lax1dude.eaglercraft.log4j.Logger', 'org.apache.logging.log4j.Logger'),
    ('net.minecraft.util.BlockPos', 'net.minecraft.util.math.BlockPos'),
    ('net.minecraft.util.MathHelper', 'net.minecraft.util.math.MathHelper'),
    ('net.minecraft.util.AxisAlignedBB', 'net.minecraft.util.math.AxisAlignedBB'),
    ('net.minecraft.util.Vec3', 'net.minecraft.util.math.Vec3d'),
]

changed = 0
for path in deferred.rglob('*.java'):
    text = path.read_text(encoding='utf-8')
    old = text
    for a, b in replacements:
        text = text.replace(a, b)
    # A few 1.8 files reference Vec3 by the old simple class name after import.
    if 'import net.minecraft.util.math.Vec3d;' in text:
        text = text.replace('Vec3 ', 'Vec3d ').replace('Vec3(', 'Vec3d(')
    if text != old:
        path.write_text(text, encoding='utf-8')
        changed += 1

print(f'deferred java files: {sum(1 for _ in deferred.rglob("*.java"))}')
print(f'namespace/API files changed: {changed}')
