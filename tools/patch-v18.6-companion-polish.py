#!/usr/bin/env python3
"""SelahMC v18.6 Companion polish.

Changes:
- compacts the social text above players to one small translucent `♡ SOCIAL` label
- migrates the default Companion shortcut to Escape once, while still allowing remapping
- adds a prominent but dismissible recommendation to install the SelahMC app
- makes the real Companion overlay more translucent so Minecraft remains visible
- does not add another Companion launcher button

Run on the VPS:
  sudo python3 tools/patch-v18.6-companion-polish.py
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys

CLIENT_MARKER = "SELAHMC_COMPANION_POLISH_V186"
PLUGIN_MARKER = "SELAHMC_COMPACT_SOCIAL_V186"
INSTALL_MARKER = "SELAHMC_COMPANION_POLISH_INSTALL_HOOK_V186"

CLIENT_BRIDGE = r'''<!-- SELAHMC_COMPANION_POLISH_V186 -->
<style id="selahmc-companion-polish-v186-style">
  .selahmc-translucent-overlay-v186 {
    background: rgba(34, 16, 30, .72) !important;
    border-color: rgba(255,255,255,.17) !important;
    box-shadow: 0 26px 80px rgba(24, 5, 18, .34), inset 0 1px rgba(255,255,255,.09) !important;
    backdrop-filter: blur(18px) saturate(1.12) !important;
    -webkit-backdrop-filter: blur(18px) saturate(1.12) !important;
  }
  .selahmc-translucent-card-v186 {
    background-color: rgba(53, 27, 47, .52) !important;
    border-color: rgba(255,255,255,.12) !important;
    backdrop-filter: blur(10px) !important;
    -webkit-backdrop-filter: blur(10px) !important;
  }
  #selahmc-install-recommend-v186 {
    position: fixed;
    left: 18px;
    bottom: 18px;
    z-index: 2147483646;
    width: min(390px, calc(100vw - 36px));
    padding: 15px;
    border-radius: 20px;
    color: #fff;
    background: linear-gradient(145deg, rgba(55,25,47,.88), rgba(31,16,28,.82));
    border: 1px solid rgba(255,255,255,.18);
    box-shadow: 0 24px 70px rgba(24,5,18,.36), inset 0 1px rgba(255,255,255,.1);
    backdrop-filter: blur(20px) saturate(1.15);
    -webkit-backdrop-filter: blur(20px) saturate(1.15);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    opacity: 0;
    transform: translateY(18px) scale(.98);
    transition: opacity .22s ease, transform .22s ease;
  }
  #selahmc-install-recommend-v186[data-open="true"] { opacity: 1; transform: none; }
  #selahmc-install-recommend-v186 strong { display:block; font-size:14px; letter-spacing:-.01em; }
  #selahmc-install-recommend-v186 p { margin:6px 0 12px; color:#edc9dc; font-size:11px; line-height:1.45; }
  #selahmc-install-recommend-v186 .actions { display:flex; gap:7px; flex-wrap:wrap; }
  #selahmc-install-recommend-v186 button {
    min-height: 36px; padding:0 13px; border-radius:999px; cursor:pointer;
    border:1px solid rgba(255,255,255,.16); color:#fff; font:800 11px/1 system-ui,sans-serif;
    background:rgba(255,255,255,.08);
  }
  #selahmc-install-recommend-v186 button.primary {
    background:linear-gradient(135deg,#ff84bd,#d94b9a);
    box-shadow:0 10px 30px rgba(216,75,154,.25), inset 0 1px rgba(255,255,255,.28);
  }
  @media (max-width: 640px) {
    #selahmc-install-recommend-v186 { left:12px; right:12px; bottom:12px; width:auto; }
  }
</style>
<script id="selahmc-companion-polish-v186-script">
(() => {
  if (window.__selahmcCompanionPolishV186) return;
  window.__selahmcCompanionPolishV186 = true;

  const parentWindow = (() => {
    try { return window.parent && window.parent !== window ? window.parent : window; }
    catch { return window; }
  })();
  const parentDocument = (() => {
    try { return parentWindow.document; }
    catch { return document; }
  })();

  const migrateEscapeDefault = () => {
    try {
      const migration = "selahmc.companion.escapeDefaultV186";
      if (localStorage.getItem(migration) !== "done") {
        localStorage.setItem("selahmc.companion.overlayKey", "Escape");
        localStorage.setItem("selahmc_companion_overlay_key", "Escape");
        localStorage.setItem(migration, "done");
        try { parentWindow.localStorage.setItem("selahmc.companion.overlayKey", "Escape"); } catch {}
        try { parentWindow.localStorage.setItem("selahmc_companion_overlay_key", "Escape"); } catch {}
        try {
          parentWindow.dispatchEvent(new StorageEvent("storage", {
            key: "selahmc.companion.overlayKey",
            newValue: "Escape",
            storageArea: parentWindow.localStorage,
          }));
        } catch {}
      }
    } catch {}
  };

  const isOverlayCandidate = (element) => {
    if (!(element instanceof parentWindow.HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width < 260 || rect.height < 220 || rect.width > parentWindow.innerWidth * .95) return false;
    const style = parentWindow.getComputedStyle(element);
    if (!["fixed", "absolute", "sticky"].includes(style.position)) return false;
    const text = (element.innerText || "").replace(/\s+/g, " ").toLowerCase();
    return text.includes("companion") && ["party", "friends", "voice", "alerts", "profile"].some((word) => text.includes(word));
  };

  const makeOverlayTransparent = () => {
    try {
      const selectors = [
        "[role='dialog']", "aside", "[data-overlay]", "[data-companion-overlay]",
        "[class*='overlay' i]", "[class*='companion' i]", "[class*='drawer' i]"
      ];
      const candidates = [...parentDocument.querySelectorAll(selectors.join(","))];
      const overlay = candidates.find(isOverlayCandidate);
      if (!overlay) return;
      overlay.classList.add("selahmc-translucent-overlay-v186");
      const descendants = [...overlay.querySelectorAll("section, article, [class*='card' i], [class*='panel' i], [class*='surface' i]")].slice(0, 80);
      for (const child of descendants) {
        if (!(child instanceof parentWindow.HTMLElement)) continue;
        const rect = child.getBoundingClientRect();
        if (rect.width > 80 && rect.height > 36) child.classList.add("selahmc-translucent-card-v186");
      }
    } catch {}
  };

  let deferredInstallPrompt = null;
  const standalone = () => {
    try {
      return parentWindow.matchMedia("(display-mode: standalone)").matches ||
        parentWindow.navigator.standalone === true;
    } catch { return false; }
  };

  const installDismissedRecently = () => {
    try {
      const stamp = Number(parentWindow.localStorage.getItem("selahmc.installRecommend.dismissedV186") || 0);
      return Date.now() - stamp < 3 * 24 * 60 * 60 * 1000;
    } catch { return false; }
  };

  const dismissInstall = () => {
    try { parentWindow.localStorage.setItem("selahmc.installRecommend.dismissedV186", String(Date.now())); } catch {}
    const banner = parentDocument.getElementById("selahmc-install-recommend-v186");
    if (!banner) return;
    banner.dataset.open = "false";
    setTimeout(() => banner.remove(), 240);
  };

  const showInstallRecommendation = () => {
    try {
      if (standalone() || installDismissedRecently() || parentDocument.getElementById("selahmc-install-recommend-v186")) return;
      const banner = parentDocument.createElement("div");
      banner.id = "selahmc-install-recommend-v186";
      banner.innerHTML = `
        <strong>Highly recommended: install SelahMC</strong>
        <p>Get faster access to Companion, party voice, alerts, and the phone second-screen experience without keeping a normal browser tab open.</p>
        <div class="actions">
          <button type="button" class="primary" data-install>Install SelahMC</button>
          <button type="button" data-later>Maybe later</button>
        </div>`;
      parentDocument.body.appendChild(banner);
      requestAnimationFrame(() => banner.dataset.open = "true");
      banner.querySelector("[data-later]")?.addEventListener("click", dismissInstall);
      banner.querySelector("[data-install]")?.addEventListener("click", async () => {
        if (deferredInstallPrompt) {
          try {
            await deferredInstallPrompt.prompt();
            await deferredInstallPrompt.userChoice;
            deferredInstallPrompt = null;
            dismissInstall();
            return;
          } catch {}
        }
        parentWindow.location.href = "/app?install=1";
      });
    } catch {}
  };

  try {
    parentWindow.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      setTimeout(showInstallRecommendation, 1200);
    });
    parentWindow.addEventListener("appinstalled", () => {
      const banner = parentDocument.getElementById("selahmc-install-recommend-v186");
      banner?.remove();
    });
  } catch {}

  migrateEscapeDefault();
  makeOverlayTransparent();
  setTimeout(makeOverlayTransparent, 700);
  setTimeout(makeOverlayTransparent, 1800);
  setTimeout(showInstallRecommendation, 9000);

  try {
    const observer = new parentWindow.MutationObserver(() => makeOverlayTransparent());
    observer.observe(parentDocument.documentElement, { childList: true, subtree: true });
  } catch {}
})();
</script>
'''

COMPACT_CLASS_TEMPLATE = r'''package __PACKAGE__;

import java.util.Locale;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.Bukkit;
import org.bukkit.Color;
import org.bukkit.World;
import org.bukkit.entity.TextDisplay;
import org.bukkit.plugin.java.JavaPlugin;

/** SELAHMC_COMPACT_SOCIAL_V186 */
public final class CompactSocialUiV186 {
    private CompactSocialUiV186() {}

    public static void start(JavaPlugin plugin) {
        Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            for (World world : Bukkit.getWorlds()) {
                for (TextDisplay display : world.getEntitiesByClass(TextDisplay.class)) {
                    String plain = PlainTextComponentSerializer.plainText()
                        .serialize(display.text())
                        .toUpperCase(Locale.ROOT);
                    boolean social = plain.contains("ADD FRIEND")
                        || plain.contains("ACCEPT FRIEND")
                        || plain.contains("INVITE PARTY")
                        || plain.contains("REQUEST SENT")
                        || plain.contains("RIGHT-CLICK")
                        || plain.contains("RIGHT CLICK")
                        || (plain.contains("FRIEND") && plain.contains("WAVE"));
                    if (!social) continue;

                    display.text(Component.text("♡ SOCIAL", NamedTextColor.LIGHT_PURPLE));
                    display.setLineWidth(90);
                    display.setTextOpacity((byte) 220);
                    display.setBackgroundColor(Color.fromARGB(58, 255, 92, 178));
                    display.setShadowed(true);
                    display.setSeeThrough(false);
                }
            }
        }, 2L, 2L);
    }
}
'''


def timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def backup(path: Path) -> Path:
    destination = path.with_name(f"{path.name}.backup-v186-{timestamp()}")
    shutil.copy2(path, destination)
    return destination


def client_indexes() -> list[Path]:
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


def patch_client(path: Path) -> bool:
    text = path.read_text(encoding="utf-8", errors="replace")
    if CLIENT_MARKER in text:
        print(f"Client polish already current: {path}")
        return True
    print(f"Client backup: {backup(path)}")
    lowered = text.lower()
    if "</body>" in lowered:
        index = lowered.rfind("</body>")
        text = text[:index] + CLIENT_BRIDGE + "\n" + text[index:]
    elif "</html>" in lowered:
        index = lowered.rfind("</html>")
        text = text[:index] + CLIENT_BRIDGE + "\n" + text[index:]
    else:
        text += "\n" + CLIENT_BRIDGE + "\n"
    path.write_text(text, encoding="utf-8")
    print(f"Patched client polish: {path}")
    return True


def find_plugin_source() -> Path | None:
    preferred = Path("/home/ubuntu/larptube/selahmc/selahmc-companion-plugin")
    roots = [preferred, Path("/home/ubuntu/larptube/selahmc")]
    for root in roots:
        if not root.exists():
            continue
        for path in root.glob("**/src/main/java/**/*.java"):
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            if "extends JavaPlugin" in text:
                return path
    return None


def patch_plugin(main_source: Path) -> tuple[bool, Path]:
    text = main_source.read_text(encoding="utf-8", errors="replace")
    package_match = re.search(r"^\s*package\s+([\w.]+)\s*;", text, re.MULTILINE)
    if not package_match:
        raise RuntimeError(f"Could not determine Java package from {main_source}")
    package = package_match.group(1)
    helper = main_source.parent / "CompactSocialUiV186.java"
    helper_text = COMPACT_CLASS_TEMPLATE.replace("__PACKAGE__", package)
    if not helper.exists() or PLUGIN_MARKER not in helper.read_text(encoding="utf-8", errors="ignore"):
        if helper.exists():
            print(f"Helper backup: {backup(helper)}")
        helper.write_text(helper_text, encoding="utf-8")
        print(f"Wrote compact social helper: {helper}")

    if "CompactSocialUiV186.start(this);" not in text:
        pattern = re.compile(r"(public\s+void\s+onEnable\s*\(\s*\)\s*\{)")
        updated, count = pattern.subn(r"\1\n        CompactSocialUiV186.start(this); // SELAHMC_COMPACT_SOCIAL_V186", text, count=1)
        if not count:
            pattern = re.compile(r"(void\s+onEnable\s*\(\s*\)\s*\{)")
            updated, count = pattern.subn(r"\1\n        CompactSocialUiV186.start(this); // SELAHMC_COMPACT_SOCIAL_V186", text, count=1)
        if not count:
            raise RuntimeError(f"Could not find onEnable() in {main_source}")
        print(f"Plugin main backup: {backup(main_source)}")
        main_source.write_text(updated, encoding="utf-8")
        print(f"Registered compact social UI: {main_source}")
    else:
        print("Compact social UI is already registered.")
    return True, main_source.parents[4]


def install_persistent_hook(script_path: Path) -> None:
    website = Path("/home/ubuntu/larptube/selahmc/website")
    install = website / "install.sh"
    scripts = website / "scripts"
    if not website.is_dir():
        return
    scripts.mkdir(parents=True, exist_ok=True)
    target = scripts / "patch-companion-polish.py"
    if script_path.resolve() != target.resolve():
        shutil.copy2(script_path, target)
        target.chmod(target.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        print(f"Installed persistent patcher: {target}")
    if install.is_file():
        text = install.read_text(encoding="utf-8", errors="replace")
        if INSTALL_MARKER not in text:
            print(f"Website installer backup: {backup(install)}")
            hook = f'''\n# {INSTALL_MARKER}\nif [ -f "$(dirname "$0")/scripts/patch-companion-polish.py" ]; then\n  echo "Applying SelahMC Companion v18.6 polish..."\n  sudo python3 "$(dirname "$0")/scripts/patch-companion-polish.py" --client-only --no-build || true\nfi\n'''
            install.write_text(text.rstrip() + "\n" + hook, encoding="utf-8")
            print(f"Added persistent website hook: {install}")


def run_plugin_install(plugin_root: Path) -> None:
    install = plugin_root / "install.sh"
    if not install.is_file():
        print(f"WARNING: plugin install.sh not found at {install}; source was patched but not rebuilt.")
        return
    install.chmod(install.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    print("Rebuilding and installing the Companion plugin...")
    subprocess.run([str(install)], cwd=plugin_root, check=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-only", action="store_true")
    parser.add_argument("--no-build", action="store_true")
    args = parser.parse_args()

    indexes = client_indexes()
    if not indexes:
        print("ERROR: Could not find a served SelahMC client/index.html", file=sys.stderr)
        return 1
    for index in indexes:
        patch_client(index)

    plugin_root: Path | None = None
    if not args.client_only:
        main_source = find_plugin_source()
        if not main_source:
            print("WARNING: Companion plugin Java source was not found; web polish was still installed.")
        else:
            _, plugin_root = patch_plugin(main_source)
        install_persistent_hook(Path(__file__))

    if plugin_root and not args.no_build:
        run_plugin_install(plugin_root)

    print()
    print("SelahMC Companion v18.6 polish installed.")
    print("Above-player text: one compact translucent `♡ SOCIAL` label")
    print("Default Companion key: Escape (one-time migration; still remappable)")
    print("Overlay background: translucent glass so Minecraft remains visible")
    print("Install recommendation: prominent, dismissible, and uses the native PWA prompt when available")
    print("Duplicate Companion launchers added: none")
    print("Hard-refresh https://selahmc.me/play with Ctrl+Shift+R")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
