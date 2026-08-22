#!/usr/bin/env python3
from __future__ import annotations

import pathlib
import re
import sys

base = pathlib.Path(sys.argv[1]).resolve()
upstream = pathlib.Path(sys.argv[2]).resolve()
deferred = base / 'src/main/java/net/lax1dude/eaglercraft/v1_8/opengl/ext/deferred'

if not deferred.is_dir():
    raise SystemExit(f'missing deferred tree: {deferred}')

# Keep upstream ownership headers intact.  This pass only performs mechanical
# compatibility substitutions that are safe across the Eagler 1.8 -> 1.12
# source split.  API-specific fixes are kept explicit below so CI failures do
# not get hidden by broad search/replace rules.
replacements: list[tuple[str, str]] = [
    # 1.12 keeps the Eagler platform namespace for these renderer classes.
]

changed = 0
for path in deferred.rglob('*.java'):
    text = path.read_text(encoding='utf-8')
    old = text
    for a, b in replacements:
        text = text.replace(a, b)
    if text != old:
        path.write_text(text, encoding='utf-8')
        changed += 1

print(f'deferred java files: {sum(1 for _ in deferred.rglob("*.java"))}')
print(f'mechanical files changed: {changed}')
