#!/usr/bin/env python3
"""SelahMC v18.5 clean Companion controls.

Fixes the problems created by the earlier injected patches:
- removes the extra injected Companion launcher
- keeps Escape as the default, customizable overlay shortcut
- adds one Phone button with a QR code
- creates a phone page that reuses the real /play Companion overlay
- removes any leftover experimental v19 social-layer injection
- installs a persistent website installer hook

Run on the VPS:
  sudo python3 tools/patch-v18.5-clean-companion.py
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import re
import shutil
import stat
import sys

MARKER = "SELAHMC_CLEAN_COMPANION_V185"
HOOK_MARKER = "SELAHMC_CLEAN_COMPANION_INSTALL_HOOK_V185"

OLD_BLOCKS = [
    re.compile(
        r"\s*<!--\s*SELAHMC_OVERLAY_KEYBIND_V184\s*-->\s*"
        r"<script\s+id=[\"']selahmc-overlay-keybind-v184[\"'][^>]*>.*?</script>\s*",
        re.IGNORECASE | re.DOTALL,
    ),
    re.compile(
        r"\s*<!--\s*SELAHMC_SOCIAL_LAYER_V19\s*-->\s*"
        r"<style\s+id=[\"']selahmc-social-layer-v19-style[\"'][^>]*>.*?</style>\s*"
        r"<script\s+id=[\"']selahmc-social-layer-v19-script[\"'][^>]*>.*?</script>\s*",
        re.IGNORECASE | re.DOTALL,
    ),
    re.compile(
        r"\s*<!--\s*SELAHMC_CLEAN_COMPANION_V185\s*-->\s*"
        r"<script\s+id=[\"']selahmc-clean-companion-v185[\"'][^>]*>.*?</script>\s*",
        re.IGNORECASE | re.DOTALL,
    ),
]

BRIDGE = r'''<!-- SELAHMC_CLEAN_COMPANION_V185 -->
<script id="selahmc-clean-companion-v185">
(() => {
  if (window.__selahmcCleanCompanionV185) return;
  window.__selahmcCleanCompanionV185 = true;

  const STORAGE_KEY = "selahmc.companion.overlayKey";
  const DEFAULT_CODE = "Escape";
  const PHONE_PATH = "/client/companion-phone.html";
  const parentWindow = (() => {
    try { return window.parent && window.parent !== window ? window.parent : window; }
    catch { return window; }
  })();

  let captureNextKey = false;
  let lastToggleAt = 0;

  const store = {
    get() {
      try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_CODE; }
      catch { return DEFAULT_CODE; }
    },
    set(value) {
      try { localStorage.setItem(STORAGE_KEY, value); } catch {}
      try { parentWindow.localStorage.setItem(STORAGE_KEY, value); } catch {}
    },
  };

  const prettyKey = (code) => {
    const names = {
      Escape: "Esc", Space: "Space", Enter: "Enter", Backquote: "`",
      BracketLeft: "[", BracketRight: "]", Backslash: "\\", Semicolon: ";",
      Quote: "'", Comma: ",", Period: ".", Slash: "/", Minus: "-", Equal: "=",
      ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    };
    if (names[code]) return names[code];
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit[0-9]$/.test(code)) return code.slice(5);
    return String(code || DEFAULT_CODE).replace(/^Numpad/, "Num ");
  };

  const isEditable = (target) => target instanceof Element && Boolean(
    target.closest("input,textarea,select,[contenteditable='true'],[role='textbox']")
  );

  const removeOldControls = (doc) => {
    [
      "selahmc-overlay-controls-v184",
      "selah-overlay-controls-v184",
      "selahmc-overlay-open-v184",
      "selahmc-social-root-v19",
      "selah-overlay-tools-v185",
      "selah-phone-modal-v185",
    ].forEach((id) => doc.getElementById(id)?.remove());

    // Remove only launchers created by older patches, never the site's real button.
    doc.querySelectorAll("[data-selahmc-overlay-toggle][id*='v184'], [data-companion-overlay-toggle][id*='v184']")
      .forEach((node) => node.remove());
  };

  const findRealOverlayButton = (doc) => {
    const preferred = doc.querySelector(
      "[data-companion-overlay-toggle]:not([id*='v184'])," +
      "[data-selahmc-overlay-toggle]:not([id*='v184'])," +
      "button[aria-label*='Companion' i]:not([id*='v184'])," +
      "button[title*='Companion' i]:not([id*='v184'])"
    );
    if (preferred instanceof HTMLElement) return preferred;

    return [...doc.querySelectorAll("button")].find((button) => {
      if (button.closest("#selah-overlay-tools-v185,#selah-phone-modal-v185")) return false;
      const text = (button.textContent || "").replace(/\s+/g, " ").trim();
      return /^(open\s+)?(companion|party overlay|social overlay|game overlay)$/i.test(text);
    }) || null;
  };

  const sendToggle = () => {
    const now = performance.now();
    if (now - lastToggleAt < 280) return;
    lastToggleAt = now;

    try { document.exitPointerLock?.(); } catch {}
    try { parentWindow.document?.exitPointerLock?.(); } catch {}

    try {
      const doc = parentWindow.document;
      const realButton = findRealOverlayButton(doc);
      if (realButton) {
        realButton.click();
        return;
      }
    } catch {}

    // v18.3 listens for F8 internally; synthesize it only as a fallback.
    try {
      parentWindow.dispatchEvent(new KeyboardEvent("keydown", {
        key: "F8", code: "F8", bubbles: true, cancelable: true,
      }));
    } catch {}
  };

  const toast = (message) => {
    try {
      const doc = parentWindow.document;
      doc.getElementById("selah-key-toast-v185")?.remove();
      const el = doc.createElement("div");
      el.id = "selah-key-toast-v185";
      el.textContent = message;
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: "82px", zIndex: "2147483647",
        transform: "translate(-50%, 12px)", opacity: "0", maxWidth: "min(90vw,520px)",
        padding: "12px 16px", borderRadius: "16px", border: "1px solid rgba(255,255,255,.2)",
        background: "rgba(49,22,42,.95)", color: "white",
        boxShadow: "0 18px 55px rgba(45,9,34,.4)", backdropFilter: "blur(18px)",
        font: "700 13px/1.35 system-ui,sans-serif", textAlign: "center",
        transition: "opacity .18s ease,transform .18s ease", pointerEvents: "none",
      });
      doc.body.appendChild(el);
      requestAnimationFrame(() => { el.style.opacity = "1"; el.style.transform = "translate(-50%,0)"; });
      setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translate(-50%,8px)";
        setTimeout(() => el.remove(), 220);
      }, 2500);
    } catch {}
  };

  const buttonStyle = (button, secondary = false) => {
    Object.assign(button.style, {
      minHeight: "38px", padding: "0 13px", borderRadius: "999px",
      border: "1px solid rgba(255,255,255,.22)", color: "white",
      background: secondary ? "rgba(48,23,41,.88)" : "linear-gradient(135deg,#ff85bf,#dc4b99)",
      boxShadow: "0 12px 34px rgba(122,29,88,.28),inset 0 1px rgba(255,255,255,.28)",
      backdropFilter: "blur(18px)", font: "800 12px/1 system-ui,sans-serif",
      cursor: "pointer", whiteSpace: "nowrap", transition: "transform .16s ease,filter .16s ease",
    });
    button.addEventListener("mouseenter", () => { button.style.transform = "translateY(-2px)"; });
    button.addEventListener("mouseleave", () => { button.style.transform = "translateY(0)"; });
  };

  const refreshKeyLabel = () => {
    try {
      const doc = parentWindow.document;
      const label = doc.getElementById("selah-shortcut-label-v185");
      if (label) label.textContent = captureNextKey ? "Press any key…" : `Shortcut: ${prettyKey(store.get())}`;
    } catch {}
  };

  const showPhoneModal = () => {
    try {
      const doc = parentWindow.document;
      let modal = doc.getElementById("selah-phone-modal-v185");
      const url = new URL(PHONE_PATH, parentWindow.location.origin).href;
      if (!modal) {
        modal = doc.createElement("div");
        modal.id = "selah-phone-modal-v185";
        Object.assign(modal.style, {
          position: "fixed", inset: "0", zIndex: "2147483646", display: "grid",
          placeItems: "center", padding: "20px", background: "rgba(17,7,14,.64)",
          backdropFilter: "blur(12px)", pointerEvents: "auto",
        });
        modal.innerHTML = `
          <section style="width:min(430px,94vw);border-radius:28px;padding:20px;background:linear-gradient(145deg,rgba(57,26,48,.98),rgba(31,16,28,.98));border:1px solid rgba(255,255,255,.2);box-shadow:0 28px 90px rgba(24,5,19,.55);color:white;font-family:system-ui,sans-serif;text-align:center">
            <button id="selah-phone-close-v185" type="button" aria-label="Close" style="float:right;width:34px;height:34px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:white;font-size:20px;cursor:pointer">×</button>
            <div style="clear:both"></div>
            <div style="width:48px;height:48px;border-radius:17px;display:grid;place-items:center;margin:0 auto 10px;background:linear-gradient(135deg,#ff91c7,#d94a98);font-size:24px">⌁</div>
            <h2 style="margin:0;font-size:23px;letter-spacing:-.035em">Companion on your phone</h2>
            <p style="margin:8px auto 14px;max-width:340px;color:#e7bfd4;font-size:12px;line-height:1.55">This opens the same dark pink party overlay as /play—without the Minecraft screen.</p>
            <img id="selah-phone-qr-v185" alt="QR code for SelahMC phone Companion" style="display:block;width:230px;height:230px;max-width:100%;margin:0 auto 14px;padding:10px;border-radius:24px;background:white" />
            <div id="selah-phone-url-v185" style="padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.07);color:#f2d4e4;font-size:11px;word-break:break-all"></div>
            <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:13px">
              <button id="selah-phone-open-v185" type="button">Open phone view</button>
              <button id="selah-phone-copy-v185" type="button">Copy link</button>
            </div>
          </section>`;
        doc.body.appendChild(modal);
        buttonStyle(modal.querySelector("#selah-phone-open-v185"));
        buttonStyle(modal.querySelector("#selah-phone-copy-v185"), true);
        modal.querySelector("#selah-phone-close-v185").onclick = () => modal.remove();
        modal.addEventListener("pointerdown", (event) => { if (event.target === modal) modal.remove(); });
        modal.querySelector("#selah-phone-open-v185").onclick = () => parentWindow.open(url, "_blank", "noopener");
        modal.querySelector("#selah-phone-copy-v185").onclick = async () => {
          try { await parentWindow.navigator.clipboard.writeText(url); toast("Phone Companion link copied."); }
          catch { toast("Copy failed. Select the link manually."); }
        };
      }
      modal.querySelector("#selah-phone-url-v185").textContent = url;
      modal.querySelector("#selah-phone-qr-v185").src =
        `https://api.qrserver.com/v1/create-qr-code/?size=460x460&margin=12&data=${encodeURIComponent(url)}`;
    } catch {}
  };

  const ensureTools = () => {
    try {
      const doc = parentWindow.document;
      if (!doc?.body || !/\/play(?:\/|$)/.test(parentWindow.location.pathname)) return;
      removeOldControls(doc);
      if (doc.getElementById("selah-overlay-tools-v185")) return;

      const wrap = doc.createElement("div");
      wrap.id = "selah-overlay-tools-v185";
      Object.assign(wrap.style, {
        position: "fixed", right: "16px", bottom: "16px", zIndex: "2147483600",
        display: "flex", alignItems: "center", gap: "8px", pointerEvents: "auto",
      });

      const phone = doc.createElement("button");
      phone.type = "button";
      phone.textContent = "Phone / QR";
      phone.title = "Open SelahMC Companion on your phone";
      phone.id = "selah-phone-button-v185";
      buttonStyle(phone);
      phone.onclick = showPhoneModal;

      const key = doc.createElement("button");
      key.type = "button";
      key.id = "selah-shortcut-button-v185";
      key.innerHTML = `<span id="selah-shortcut-label-v185"></span>`;
      key.title = "Change the Companion overlay shortcut";
      buttonStyle(key, true);
      key.onclick = () => {
        captureNextKey = !captureNextKey;
        refreshKeyLabel();
        toast(captureNextKey ? "Press the key you want. Shift+Esc stays reserved for Minecraft pause." : "Key change cancelled.");
      };

      // Deliberately no injected Companion launcher. The site keeps its one real button.
      wrap.append(phone, key);
      doc.body.appendChild(wrap);
      refreshKeyLabel();
    } catch {}
  };

  const handleKey = (event) => {
    if (captureNextKey) {
      if (["ShiftLeft","ShiftRight","ControlLeft","ControlRight","AltLeft","AltRight","MetaLeft","MetaRight"].includes(event.code)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const code = event.code || event.key || DEFAULT_CODE;
      store.set(code);
      captureNextKey = false;
      refreshKeyLabel();
      toast(`Companion shortcut changed to ${prettyKey(code)}.`);
      return;
    }

    if (isEditable(event.target) || event.repeat) return;
    const configured = store.get();
    const matches = event.code === configured || event.key === configured || (configured === "Escape" && event.key === "Escape");
    if (!matches) return;
    if (configured === "Escape" && event.shiftKey) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    sendToggle();
  };

  window.addEventListener("keydown", handleKey, true);
  if (parentWindow !== window) parentWindow.addEventListener("keydown", handleKey, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureTools, { once: true });
  else ensureTools();
  setTimeout(ensureTools, 700);
  setInterval(ensureTools, 3500);
})();
</script>
'''

PHONE_HTML = r'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="theme-color" content="#301427" />
  <title>SelahMC Phone Companion</title>
  <style>
    *{box-sizing:border-box}html,body{height:100%;margin:0;background:#180c16;color:white;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}
    body{display:grid;grid-template-rows:auto 1fr;background:radial-gradient(circle at 12% 0%,rgba(255,110,180,.22),transparent 34%),linear-gradient(160deg,#35172d,#170c15 74%)}
    header{display:flex;align-items:center;gap:10px;padding:max(11px,env(safe-area-inset-top)) 12px 11px;background:rgba(42,18,35,.9);border-bottom:1px solid rgba(255,255,255,.15);box-shadow:0 13px 40px rgba(13,3,10,.34);backdrop-filter:blur(20px);z-index:3}
    .mark{width:36px;height:36px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,#ff91c7,#d94a98);box-shadow:0 9px 25px rgba(193,54,133,.32);font-size:19px}.title{min-width:0;flex:1}.title b{display:block;font-size:13px;letter-spacing:.01em}.title span{display:block;margin-top:2px;color:#e7bdd2;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    button{min-height:35px;border-radius:999px;border:1px solid rgba(255,255,255,.18);padding:0 10px;background:rgba(255,255,255,.08);color:white;font:800 10px/1 system-ui,sans-serif;cursor:pointer}.on{background:linear-gradient(135deg,#ff83bf,#d94a98)}
    main{position:relative;min-height:0}.frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#1c0e19}.loading{position:absolute;inset:0;display:grid;place-items:center;color:#e7bdd2;font-size:12px;pointer-events:none}.loading span{padding:12px 16px;border-radius:16px;background:rgba(45,20,38,.9);border:1px solid rgba(255,255,255,.14)}
    #note{position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom));z-index:5;transform:translate(-50%,10px);opacity:0;padding:10px 13px;border-radius:14px;background:rgba(45,20,38,.96);border:1px solid rgba(255,255,255,.16);box-shadow:0 13px 38px rgba(12,3,10,.35);font-size:11px;transition:.2s;pointer-events:none}#note.show{opacity:1;transform:translate(-50%,0)}
    @media(max-width:450px){header{gap:7px}.title span{display:none}button{padding:0 8px}}
  </style>
</head>
<body>
  <header>
    <div class="mark">✦</div>
    <div class="title"><b>SelahMC Companion</b><span>The same /play party overlay, fitted to your phone</span></div>
    <button id="wake">Keep awake</button>
    <button id="share">Share</button>
  </header>
  <main>
    <div class="loading" id="loading"><span>Opening Companion overlay…</span></div>
    <iframe class="frame" id="play" src="/play?overlay=1&phone=1" title="SelahMC Companion overlay"></iframe>
  </main>
  <div id="note"></div>
  <script>
    const frame=document.getElementById('play');const loading=document.getElementById('loading');const wakeButton=document.getElementById('wake');let wakeLock=null;
    const note=(text)=>{const el=document.getElementById('note');el.textContent=text;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2300)};
    function findOverlayButton(doc){return doc.querySelector('[data-companion-overlay-toggle],[data-selahmc-overlay-toggle],button[aria-label*="Companion" i],button[title*="Companion" i]')||[...doc.querySelectorAll('button')].find((button)=>/^(open\s+)?(companion|party overlay|game overlay)$/i.test((button.textContent||'').trim()));}
    function applyPhoneMode(){
      try{
        const doc=frame.contentDocument;if(!doc||!doc.body)return;
        let style=doc.getElementById('selah-phone-mode-v185');
        if(!style){style=doc.createElement('style');style.id='selah-phone-mode-v185';style.textContent=`
          html,body{width:100%!important;min-height:100%!important;overflow:hidden!important;background:#1b0e18!important}
          iframe[src*="/client/"]{display:none!important}
          #selah-overlay-tools-v185,#selahmc-overlay-controls-v184,#selah-key-toast-v185{display:none!important}
          [data-companion-overlay],[data-selahmc-overlay],aside[role="dialog"],[role="dialog"]{max-width:none!important;width:100vw!important;height:100vh!important;inset:0!important;border-radius:0!important}
          body>main,body>div:first-child{min-height:100vh!important}
        `;doc.head.appendChild(style)}
        doc.querySelectorAll('iframe').forEach((inner)=>{const src=inner.getAttribute('src')||'';if(src.includes('/client/'))inner.style.setProperty('display','none','important')});
        const hasOverlay=[...doc.querySelectorAll('body *')].some((el)=>{const text=(el.textContent||'').trim();return text.length<1000&&/party|friends|alerts|voice/i.test(text)&&getComputedStyle(el).position==='fixed'});
        if(!hasOverlay){const button=findOverlayButton(doc);if(button)button.click()}
        loading.style.display='none';
      }catch(error){loading.innerHTML='<span>Tap the page once, then press Companion.</span>'}
    }
    frame.addEventListener('load',()=>{applyPhoneMode();setTimeout(applyPhoneMode,600);setTimeout(applyPhoneMode,1600);try{const doc=frame.contentDocument;new MutationObserver(applyPhoneMode).observe(doc.documentElement,{childList:true,subtree:true})}catch{}});
    async function toggleWake(){if(wakeLock){await wakeLock.release();wakeLock=null;wakeButton.classList.remove('on');wakeButton.textContent='Keep awake';return}if(!('wakeLock'in navigator)){note('Screen wake lock is not supported here.');return}try{wakeLock=await navigator.wakeLock.request('screen');wakeButton.classList.add('on');wakeButton.textContent='Awake';wakeLock.addEventListener('release',()=>{wakeLock=null;wakeButton.classList.remove('on');wakeButton.textContent='Keep awake'})}catch{note('The browser did not allow wake lock.')}}
    wakeButton.onclick=toggleWake;document.getElementById('share').onclick=async()=>{if(navigator.share)await navigator.share({title:'SelahMC Companion',url:location.href});else{await navigator.clipboard.writeText(location.href);note('Link copied.')}};
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&wakeButton.classList.contains('on')&&!wakeLock)void toggleWake()});
  </script>
</body>
</html>
'''


def backup(path: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    target = path.with_name(f"{path.name}.backup-v185-{stamp}")
    shutil.copy2(path, target)
    return target


def clean_and_patch(path: Path) -> bool:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return False

    original = text
    for pattern in OLD_BLOCKS:
        text = pattern.sub("\n", text)

    # Remove accidental duplicated markers that may have survived malformed HTML.
    text = re.sub(r"<div[^>]+id=[\"']selahmc-overlay-controls-v184[\"'][^>]*>.*?</div>", "", text, flags=re.I | re.S)

    lowered = text.lower()
    if "</body>" in lowered:
        pos = lowered.rfind("</body>")
        text = text[:pos] + BRIDGE + "\n" + text[pos:]
    elif "</html>" in lowered:
        pos = lowered.rfind("</html>")
        text = text[:pos] + BRIDGE + "\n" + text[pos:]
    else:
        text += "\n" + BRIDGE + "\n"

    if text != original:
        print(f"Backup: {backup(path)}")
        path.write_text(text, encoding="utf-8")
    print(f"Installed clean Companion controls: {path}")
    return True


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


def write_phone_pages(indexes: list[Path]) -> None:
    targets = {index.parent / "companion-phone.html" for index in indexes}
    public_client = Path("/home/ubuntu/larptube/selahmc/website/public/client")
    if public_client.is_dir():
        targets.add(public_client / "companion-phone.html")

    for target in sorted(targets):
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            old = target.read_text(encoding="utf-8", errors="replace")
            if old == PHONE_HTML:
                print(f"Phone Companion already current: {target}")
                continue
            print(f"Backup: {backup(target)}")
        target.write_text(PHONE_HTML, encoding="utf-8")
        print(f"Wrote matching phone Companion: {target}")

    # Remove the visually unrelated experimental page when present.
    for index in indexes:
        old_page = index.parent / "second-screen.html"
        if old_page.exists() and "SelahMC Second Screen" in old_page.read_text(encoding="utf-8", errors="ignore"):
            old_page.unlink()
            print(f"Removed old unrelated second-screen page: {old_page}")


def install_persistent_copy(script_path: Path) -> None:
    website = Path("/home/ubuntu/larptube/selahmc/website")
    if not website.is_dir():
        return
    scripts = website / "scripts"
    scripts.mkdir(parents=True, exist_ok=True)
    target = scripts / "patch-clean-companion.py"
    if script_path.resolve() != target.resolve():
        shutil.copy2(script_path, target)
        target.chmod(target.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        print(f"Installed persistent patcher: {target}")

    install = website / "install.sh"
    if not install.is_file():
        return
    text = install.read_text(encoding="utf-8", errors="replace")

    # Delete obsolete installer hooks so they cannot recreate duplicate buttons or v19.
    text = re.sub(
        r"\n?#\s*SELAHMC_OVERLAY_KEYBIND_INSTALL_HOOK_V184.*?(?=\n#\s*[A-Z0-9_]+|\Z)",
        "\n", text, flags=re.I | re.S,
    )
    text = re.sub(
        r"\n?#\s*SELAHMC_SOCIAL_LAYER_INSTALL_HOOK_V19.*?(?=\n#\s*[A-Z0-9_]+|\Z)",
        "\n", text, flags=re.I | re.S,
    )
    text = re.sub(
        r"\n?#\s*SELAHMC_CLEAN_COMPANION_INSTALL_HOOK_V185.*?(?=\n#\s*[A-Z0-9_]+|\Z)",
        "\n", text, flags=re.I | re.S,
    )
    hook = f'''\n# {HOOK_MARKER}\nif [ -f "$(dirname "$0")/scripts/patch-clean-companion.py" ]; then\n  echo "Applying clean Companion shortcut and matching phone view..."\n  sudo python3 "$(dirname "$0")/scripts/patch-clean-companion.py" --client-only || true\nfi\n'''
    new_text = text.rstrip() + "\n" + hook
    if new_text != install.read_text(encoding="utf-8", errors="replace"):
        print(f"Backup: {backup(install)}")
        install.write_text(new_text, encoding="utf-8")
        print(f"Updated website installer hook: {install}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-only", action="store_true")
    args = parser.parse_args()

    indexes = candidate_indexes()
    if not indexes:
        print("ERROR: Could not find the served SelahMC client/index.html", file=sys.stderr)
        return 1

    successes = sum(1 for path in indexes if clean_and_patch(path))
    write_phone_pages(indexes)
    if not args.client_only:
        install_persistent_copy(Path(__file__))

    print()
    print(f"Patched {successes} client file(s).")
    print("Duplicate injected Companion launcher: removed")
    print("Remaining controls: Phone / QR and customizable Shortcut")
    print("Phone view: https://selahmc.me/client/companion-phone.html")
    print("Hard-refresh https://selahmc.me/play with Ctrl+Shift+R")
    return 0 if successes else 1


if __name__ == "__main__":
    raise SystemExit(main())
