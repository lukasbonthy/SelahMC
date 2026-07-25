#!/usr/bin/env python3
"""Fix SelahMC social login/signup crash after successful API response.

The old handlers accessed event.currentTarget after awaiting fetch(). Event.currentTarget
is null once event dispatch has finished, so calling reset() crashed. This patch stores the
HTMLFormElement before the first await and uses that stable reference afterward.

It patches both the source copy and the deployed static copy, then cache-busts app.js.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import re
import shutil
import sys

APP_CANDIDATES = [
    Path("/home/ubuntu/larptube/selahmc/selahmc-account-social/web/app.js"),
    Path("/srv/selahmc/social/app.js"),
]
INDEX_CANDIDATES = [
    Path("/home/ubuntu/larptube/selahmc/selahmc-account-social/web/index.html"),
    Path("/srv/selahmc/social/index.html"),
]


def backup(path: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    destination = path.with_name(f"{path.name}.backup-form-reset-{stamp}")
    shutil.copy2(path, destination)
    return destination


def patch_app(path: Path) -> bool:
    if not path.is_file():
        return False

    text = path.read_text(encoding="utf-8")
    original = text

    text = text.replace(
        '      const form = new FormData(event.currentTarget);\n'
        '      const submit = event.currentTarget.querySelector("button[type=submit]");',
        '      const formElement = event.currentTarget;\n'
        '      const form = new FormData(formElement);\n'
        '      const submit = formElement.querySelector("button[type=submit]");',
    )
    text = text.replace('        event.currentTarget.reset();', '        formElement.reset();')

    if text == original:
        if 'const formElement = event.currentTarget;' in text and 'formElement.reset();' in text:
            print(f"Already fixed: {path}")
            return True
        raise RuntimeError(f"Expected login/signup form code was not found in {path}")

    saved = backup(path)
    path.write_text(text, encoding="utf-8")
    print(f"Fixed async form reset: {path}")
    print(f"Backup: {saved}")
    return True


def patch_index(path: Path) -> bool:
    if not path.is_file():
        return False

    text = path.read_text(encoding="utf-8")
    new_text = re.sub(
        r'(<script\s+src=["\']/social/app\.js)(?:\?v=[^"\']*)?(["\'])',
        r'\1?v=3.1.1\2',
        text,
        count=1,
    )

    if new_text == text:
        if '/social/app.js?v=3.1.1' in text:
            print(f"Cache bust already current: {path}")
            return True
        raise RuntimeError(f"Could not find /social/app.js script tag in {path}")

    saved = backup(path)
    path.write_text(new_text, encoding="utf-8")
    print(f"Updated app.js cache version: {path}")
    print(f"Backup: {saved}")
    return True


def main() -> int:
    app_count = 0
    index_count = 0

    for path in APP_CANDIDATES:
        if patch_app(path):
            app_count += 1

    for path in INDEX_CANDIDATES:
        if patch_index(path):
            index_count += 1

    if app_count == 0:
        print("ERROR: No SelahMC social app.js file was found.", file=sys.stderr)
        return 1

    print()
    print(f"Patched {app_count} app.js file(s) and {index_count} index file(s).")
    print("Login and signup now keep a stable form reference across await.")
    print("Hard-refresh https://selahmc.me/social/ with Ctrl+Shift+R.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
