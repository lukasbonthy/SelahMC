#!/usr/bin/env python3
"""Remove the experimental SelahMC v19 browser social layer safely.

This keeps the earlier Companion/Escape keybind patch, restores the newest pre-v19
client backup when available, removes the generated second-screen page, and deletes
the persistent installer hook.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import re
import shutil
import sys

MARKER = "SELAHMC_SOCIAL_LAYER_V19"
HOOK = "SELAHMC_SOCIAL_LAYER_INSTALL_HOOK_V19"


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def safety_backup(path: Path) -> Path:
    dest = path.with_name(f"{path.name}.before-v19-rollback-{stamp()}")
    shutil.copy2(path, dest)
    return dest


def candidate_indexes() -> list[Path]:
    fixed = [
        Path("/srv/selahmc/client/index.html"),
        Path("/home/ubuntu/larptube/selahmc/client/index.html"),
        Path("/home/ubuntu/larptube/selahmc/website/public/client/index.html"),
        Path("/home/ubuntu/larptube/selahmc/website/client/index.html"),
    ]
    roots = [Path("/home/ubuntu/larptube/selahmc"), Path("/srv/selahmc"), Path("/var/www")]
    found: list[Path] = []
    for path in fixed:
        if path.is_file() and path not in found:
            found.append(path)
    for root in roots:
        if not root.exists():
            continue
        try:
            for path in root.glob("**/client/index.html"):
                if path.is_file() and path not in found:
                    found.append(path)
        except PermissionError:
            pass
    return found


def restore_index(path: Path) -> bool:
    text = path.read_text(encoding="utf-8", errors="replace")
    if MARKER not in text:
        print(f"No v19 marker: {path}")
        return False

    before = safety_backup(path)
    backups = sorted(path.parent.glob(f"{path.name}.backup-v19-*"), key=lambda p: p.stat().st_mtime, reverse=True)
    for backup in backups:
        backup_text = backup.read_text(encoding="utf-8", errors="replace")
        if MARKER not in backup_text:
            shutil.copy2(backup, path)
            print(f"Restored pre-v19 client: {path}")
            print(f"Source backup: {backup}")
            print(f"Safety backup: {before}")
            return True

    cleaned = re.sub(
        r"\s*<!-- SELAHMC_SOCIAL_LAYER_V19 -->.*?<script id=\"selahmc-social-layer-v19-script\">.*?</script>\s*",
        "\n",
        text,
        count=1,
        flags=re.DOTALL,
    )
    if cleaned == text:
        print(f"WARNING: marker found but automatic block removal failed: {path}", file=sys.stderr)
        return False
    path.write_text(cleaned, encoding="utf-8")
    print(f"Removed v19 block directly: {path}")
    print(f"Safety backup: {before}")
    return True


def remove_second_screen(indexes: list[Path]) -> None:
    targets = {index.parent / "second-screen.html" for index in indexes}
    targets.add(Path("/home/ubuntu/larptube/selahmc/website/public/second-screen.html"))
    for target in targets:
        if not target.is_file():
            continue
        text = target.read_text(encoding="utf-8", errors="replace")
        if "SelahMC Second Screen" not in text:
            continue
        backup = safety_backup(target)
        target.unlink()
        print(f"Removed generated second screen: {target}")
        print(f"Safety backup: {backup}")


def remove_installer_hook() -> None:
    install = Path("/home/ubuntu/larptube/selahmc/website/install.sh")
    if install.is_file():
        text = install.read_text(encoding="utf-8", errors="replace")
        if HOOK in text:
            backup = safety_backup(install)
            cleaned = re.sub(
                r"\n?# SELAHMC_SOCIAL_LAYER_INSTALL_HOOK_V19\nif \[ -f .*?patch-social-layer\.py.*?\nfi\n?",
                "\n",
                text,
                count=1,
                flags=re.DOTALL,
            )
            install.write_text(cleaned.rstrip() + "\n", encoding="utf-8")
            print(f"Removed v19 installer hook: {install}")
            print(f"Safety backup: {backup}")

    patcher = Path("/home/ubuntu/larptube/selahmc/website/scripts/patch-social-layer.py")
    if patcher.is_file():
        backup = safety_backup(patcher)
        patcher.unlink()
        print(f"Removed persistent v19 patcher: {patcher}")
        print(f"Safety backup: {backup}")


def main() -> int:
    indexes = candidate_indexes()
    if not indexes:
        print("ERROR: Could not find any SelahMC client/index.html", file=sys.stderr)
        return 1

    changed = sum(1 for path in indexes if restore_index(path))
    remove_second_screen(indexes)
    remove_installer_hook()

    print()
    print(f"Rolled back v19 from {changed} client file(s).")
    print("The earlier Companion overlay and customizable Escape shortcut were left intact.")
    print("Reload Caddy, then hard-refresh /play.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
