#!/usr/bin/env python3
"""SelahMC v18.4 Companion overlay key patch.

Default: Escape toggles the Companion overlay on /play.
Shift+Escape remains available to Minecraft.
Players can click the small pink key control and press any key to remap it.

Run on the VPS:
  sudo python3 tools/patch-v18.4-overlay-keybind.py
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import stat
import sys
from datetime import datetime, timezone

MARKER = "SELAHMC_OVERLAY_KEYBIND_V184"

BRIDGE = r'''<!-- SELAHMC_OVERLAY_KEYBIND_V184 -->
<script id="selahmc-overlay-keybind-v184">
(() => {
  if (window.__selahmcOverlayKeybindV184) return;
  window.__selahmcOverlayKeybindV184 = true;

  const STORAGE_KEY = "selahmc.companion.overlayKey";
  const DEFAULT_CODE = "Escape";
  const parentWindow = (() => {
    try { return window.parent && window.parent !== window ? window.parent : window; }
    catch { return window; }
  })();

  let captureNextKey = false;
  let lastToggleAt = 0;

  const safeStorage = {
    get() {
      try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_CODE; }
      catch { return DEFAULT_CODE; }
    },
    set(value) {
      try { localStorage.setItem(STORAGE_KEY, value); } catch {}
    },
  };

  const prettyKey = (code) => {
    const names = {
      Escape: "Esc",
      Space: "Space",
      Enter: "Enter",
      Backquote: "`",
      BracketLeft: "[",
      BracketRight: "]",
      Backslash: "\\",
      Semicolon: ";",
      Quote: "'",
      Comma: ",",
      Period: ".",
      Slash: "/",
      Minus: "-",
      Equal: "=",
      ArrowUp: "↑",
      ArrowDown: "↓",
      ArrowLeft: "←",
      ArrowRight: "→",
    };
    if (names[code]) return names[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    return code.replace(/^Numpad/, "Num ").replace(/^F(\d+)$/, "F$1");
  };

  const isEditable = (target) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"));
  };

  const findCompanionButton = () => {
    try {
      const doc = parentWindow.document;
      const direct = doc.querySelector(
        "[data-selahmc-overlay-toggle], [data-companion-overlay-toggle], " +
        "button[aria-label*='Companion' i], button[title*='Companion' i]"
      );
      if (direct instanceof HTMLElement) return direct;
      return [...doc.querySelectorAll("button")].find((button) => {
        const text = (button.textContent || "").trim();
        return /^(open\s+)?companion|party\s+overlay|social\s+overlay/i.test(text);
      }) || null;
    } catch {
      return null;
    }
  };

  const dispatchExistingHotkey = () => {
    try {
      parentWindow.dispatchEvent(new KeyboardEvent("keydown", {
        key: "F8",
        code: "F8",
        bubbles: true,
        cancelable: true,
      }));
      return true;
    } catch {
      return false;
    }
  };

  const toggleOverlay = () => {
    const now = performance.now();
    if (now - lastToggleAt < 260) return;
    lastToggleAt = now;

    try { document.exitPointerLock?.(); } catch {}
    try { parentWindow.document?.exitPointerLock?.(); } catch {}

    try {
      parentWindow.postMessage({
        type: "selahmc-companion-hotkey",
        action: "toggle",
        source: "client-v18.4",
      }, location.origin);
    } catch {}

    // v18.3 already listens for F8. Dispatching it keeps this patch compatible
    // without depending on private React state or component names.
    const dispatched = dispatchExistingHotkey();
    if (!dispatched) findCompanionButton()?.click();
  };

  const toast = (message) => {
    try {
      const doc = parentWindow.document;
      const existing = doc.getElementById("selahmc-keybind-toast-v184");
      existing?.remove();
      const el = doc.createElement("div");
      el.id = "selahmc-keybind-toast-v184";
      el.textContent = message;
      Object.assign(el.style, {
        position: "fixed",
        left: "50%",
        bottom: "82px",
        zIndex: "2147483647",
        transform: "translate(-50%, 14px)",
        opacity: "0",
        maxWidth: "min(90vw, 520px)",
        padding: "12px 16px",
        borderRadius: "16px",
        border: "1px solid rgba(255,255,255,.22)",
        background: "rgba(54, 20, 42, .94)",
        color: "white",
        boxShadow: "0 16px 50px rgba(61, 18, 45, .38)",
        backdropFilter: "blur(18px)",
        font: "700 13px/1.35 system-ui, sans-serif",
        transition: "opacity .2s ease, transform .2s ease",
        pointerEvents: "none",
        textAlign: "center",
      });
      doc.body.appendChild(el);
      requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.transform = "translate(-50%, 0)";
      });
      setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translate(-50%, 10px)";
        setTimeout(() => el.remove(), 220);
      }, 2700);
    } catch {}
  };

  const refreshControl = () => {
    try {
      const doc = parentWindow.document;
      const label = doc.getElementById("selahmc-overlay-key-label-v184");
      if (label) label.textContent = captureNextKey ? "Press any key…" : prettyKey(safeStorage.get());
      const change = doc.getElementById("selahmc-overlay-key-change-v184");
      if (change) change.textContent = captureNextKey ? "Cancel" : "Change key";
    } catch {}
  };

  const saveKey = (code) => {
    safeStorage.set(code || DEFAULT_CODE);
    captureNextKey = false;
    refreshControl();
    toast(`Companion shortcut changed to ${prettyKey(code || DEFAULT_CODE)}.`);
    try {
      window.postMessage({ type: "selahmc-companion-keybind", code }, location.origin);
      parentWindow.postMessage({ type: "selahmc-companion-keybind", code }, location.origin);
    } catch {}
  };

  const handleKey = (event) => {
    if (event.defaultPrevented && !captureNextKey) return;

    if (captureNextKey) {
      if (event.key === "Escape" && safeStorage.get() !== "Escape") {
        captureNextKey = false;
        refreshControl();
        toast("Key change cancelled.");
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (["ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(event.code)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      saveKey(event.code || event.key || DEFAULT_CODE);
      return;
    }

    if (isEditable(event.target)) return;

    const configured = safeStorage.get();
    const matches = event.code === configured || event.key === configured ||
      (configured === "Escape" && event.key === "Escape");
    if (!matches) return;

    // Keep Shift+Escape as an escape hatch for Minecraft's own pause menu.
    if (configured === "Escape" && event.shiftKey) return;
    if (event.repeat) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    toggleOverlay();
  };

  const makeButton = (doc, text, title) => {
    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.title = title;
    Object.assign(button.style, {
      minHeight: "38px",
      border: "1px solid rgba(255,255,255,.24)",
      borderRadius: "999px",
      padding: "0 13px",
      background: "linear-gradient(135deg, rgba(255,120,190,.94), rgba(216,72,153,.94))",
      color: "white",
      boxShadow: "0 10px 30px rgba(147, 38, 104, .28), inset 0 1px rgba(255,255,255,.34)",
      backdropFilter: "blur(18px)",
      font: "800 12px/1 system-ui, sans-serif",
      letterSpacing: ".01em",
      cursor: "pointer",
      transition: "transform .16s ease, filter .16s ease, opacity .16s ease",
      whiteSpace: "nowrap",
    });
    button.addEventListener("mouseenter", () => { button.style.transform = "translateY(-2px)"; button.style.filter = "brightness(1.05)"; });
    button.addEventListener("mouseleave", () => { button.style.transform = "translateY(0)"; button.style.filter = "none"; });
    return button;
  };

  const ensureControls = () => {
    try {
      const doc = parentWindow.document;
      if (!doc?.body || !/\/play(?:\/|$)/.test(parentWindow.location.pathname)) return;
      if (doc.getElementById("selahmc-overlay-controls-v184")) return;

      const wrap = doc.createElement("div");
      wrap.id = "selahmc-overlay-controls-v184";
      Object.assign(wrap.style, {
        position: "fixed",
        right: "16px",
        bottom: "16px",
        zIndex: "2147483600",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        pointerEvents: "auto",
        fontFamily: "system-ui, sans-serif",
      });

      const open = makeButton(doc, "Companion", "Open or close SelahMC Companion");
      open.id = "selahmc-overlay-open-v184";
      open.dataset.selahmcOverlayToggle = "true";
      open.addEventListener("click", toggleOverlay);

      const key = makeButton(doc, "", "Change the Companion overlay shortcut");
      key.id = "selahmc-overlay-key-change-v184";
      key.style.background = "rgba(47, 23, 39, .86)";
      key.innerHTML = `Shortcut: <span id="selahmc-overlay-key-label-v184"></span>`;
      key.addEventListener("click", () => {
        captureNextKey = !captureNextKey;
        key.innerHTML = captureNextKey
          ? `Press any key… <span style="opacity:.72">(click to cancel)</span>`
          : `Shortcut: <span id="selahmc-overlay-key-label-v184"></span>`;
        refreshControl();
        if (captureNextKey) toast("Press the key you want to use. Shift+Esc is reserved for Minecraft pause.");
      });

      wrap.append(open, key);
      doc.body.appendChild(wrap);
      refreshControl();
    } catch {}
  };

  window.addEventListener("keydown", handleKey, true);
  if (parentWindow !== window) parentWindow.addEventListener("keydown", handleKey, true);

  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === "selahmc-companion-keybind" && event.data.code) {
      safeStorage.set(event.data.code);
      refreshControl();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureControls, { once: true });
  } else {
    ensureControls();
  }
  setTimeout(ensureControls, 900);
  setInterval(ensureControls, 4000);
})();
</script>
'''


def backup(path: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    destination = path.with_name(f"{path.name}.backup-v184-{stamp}")
    shutil.copy2(path, destination)
    return destination


def patch_html(path: Path) -> bool:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return False
    if MARKER in text:
        print(f"Already patched: {path}")
        return True
    backup_path = backup(path)
    lowered = text.lower()
    if "</body>" in lowered:
        index = lowered.rfind("</body>")
        text = text[:index] + BRIDGE + "\n" + text[index:]
    elif "</html>" in lowered:
        index = lowered.rfind("</html>")
        text = text[:index] + BRIDGE + "\n" + text[index:]
    else:
        text += "\n" + BRIDGE + "\n"
    path.write_text(text, encoding="utf-8")
    print(f"Patched: {path}")
    print(f"Backup:  {backup_path}")
    return True


def candidate_client_indexes() -> list[Path]:
    fixed = [
        Path("/srv/selahmc/client/index.html"),
        Path("/home/ubuntu/larptube/selahmc/client/index.html"),
        Path("/home/ubuntu/larptube/selahmc/website/public/client/index.html"),
        Path("/home/ubuntu/larptube/selahmc/website/client/index.html"),
    ]
    roots = [
        Path("/home/ubuntu/larptube/selahmc"),
        Path("/var/www"),
        Path("/srv/selahmc"),
    ]
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


def install_persistent_copy(script_path: Path) -> None:
    website = Path("/home/ubuntu/larptube/selahmc/website")
    scripts = website / "scripts"
    install = website / "install.sh"
    if not website.is_dir():
        return
    scripts.mkdir(parents=True, exist_ok=True)
    target = scripts / "patch-overlay-keybind.py"
    if script_path.resolve() != target.resolve():
        shutil.copy2(script_path, target)
        target.chmod(target.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        print(f"Installed persistent patcher: {target}")

    if install.is_file():
        text = install.read_text(encoding="utf-8", errors="replace")
        hook_marker = "SELAHMC_OVERLAY_KEYBIND_INSTALL_HOOK_V184"
        if hook_marker not in text:
            backup_path = backup(install)
            hook = f'''\n# {hook_marker}\nif [ -f "$(dirname "$0")/scripts/patch-overlay-keybind.py" ]; then\n  echo "Applying customizable Companion overlay shortcut..."\n  sudo python3 "$(dirname "$0")/scripts/patch-overlay-keybind.py" --client-only || true\nfi\n'''
            install.write_text(text.rstrip() + "\n" + hook, encoding="utf-8")
            print(f"Added installer hook: {install}")
            print(f"Backup: {backup_path}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-only", action="store_true")
    args = parser.parse_args()

    indexes = candidate_client_indexes()
    if not indexes:
        print("ERROR: Could not find a served SelahMC client/index.html", file=sys.stderr)
        print("Expected /srv/selahmc/client/index.html or a client/index.html under /home/ubuntu/larptube/selahmc", file=sys.stderr)
        return 1

    successes = sum(1 for path in indexes if patch_html(path))
    if not args.client_only:
        install_persistent_copy(Path(__file__))

    print()
    print(f"Patched {successes} client file(s).")
    print("Default Companion shortcut: Escape")
    print("Minecraft pause fallback: Shift+Escape")
    print("Open https://selahmc.me/play and hard-refresh with Ctrl+Shift+R")
    return 0 if successes else 1


if __name__ == "__main__":
    raise SystemExit(main())
