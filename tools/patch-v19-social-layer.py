#!/usr/bin/env python3
"""SelahMC v19 social layer patch.

Adds four browser-client features to /play without replacing the Minecraft client:
- compact live party HUD
- phone/second-screen launcher with screen wake lock
- hold-right-click player social wheel
- party ping/waypoint wheel

The script patches the served Eaglercraft client, writes a phone second-screen page,
and adds a persistent hook to the SelahMC website installer.

Run on the VPS:
  sudo python3 tools/patch-v19-social-layer.py
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
import shutil
import stat
import sys

MARKER = "SELAHMC_SOCIAL_LAYER_V19"
HOOK_MARKER = "SELAHMC_SOCIAL_LAYER_INSTALL_HOOK_V19"

SOCIAL_BRIDGE = r'''<!-- SELAHMC_SOCIAL_LAYER_V19 -->
<style id="selahmc-social-layer-v19-style">
  :root {
    --selah-pink: #ff77b8;
    --selah-pink-2: #e24d9b;
    --selah-deep: #2f1728;
    --selah-panel: rgba(42, 20, 36, .91);
    --selah-line: rgba(255, 255, 255, .18);
  }
  #selah-social-root-v19, #selah-social-root-v19 * { box-sizing: border-box; }
  #selah-social-root-v19 {
    position: fixed; inset: 0; z-index: 2147483500; pointer-events: none;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #fff;
  }
  .selah-v19-glass {
    background: linear-gradient(145deg, rgba(53, 24, 45, .94), rgba(29, 15, 27, .91));
    border: 1px solid var(--selah-line);
    box-shadow: 0 22px 70px rgba(31, 8, 25, .42), inset 0 1px rgba(255,255,255,.1);
    backdrop-filter: blur(22px) saturate(1.25);
  }
  #selah-party-hud-v19 {
    position: absolute; left: 14px; top: 14px; width: min(300px, calc(100vw - 28px));
    border-radius: 22px; overflow: hidden; pointer-events: auto;
    transform-origin: top left; transition: opacity .2s ease, transform .2s ease;
  }
  #selah-party-hud-v19[data-collapsed="true"] .selah-v19-body { display: none; }
  .selah-v19-hud-head { display:flex; align-items:center; gap:10px; padding:11px 12px; }
  .selah-v19-brand-dot { width:11px; height:11px; border-radius:50%; background:var(--selah-pink); box-shadow:0 0 16px var(--selah-pink); }
  .selah-v19-title { min-width:0; flex:1; }
  .selah-v19-title strong { display:block; font-size:12px; letter-spacing:.09em; text-transform:uppercase; }
  .selah-v19-title span { display:block; margin-top:2px; color:#e7bdd3; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .selah-v19-icon-btn, .selah-v19-chip, .selah-v19-action {
    appearance:none; border:1px solid rgba(255,255,255,.16); color:#fff; cursor:pointer;
    background:rgba(255,255,255,.08); font:700 12px/1 system-ui,sans-serif;
    transition:transform .15s ease, background .15s ease, border-color .15s ease;
  }
  .selah-v19-icon-btn:hover, .selah-v19-chip:hover, .selah-v19-action:hover { transform:translateY(-1px); background:rgba(255,119,184,.18); border-color:rgba(255,135,193,.55); }
  .selah-v19-icon-btn { width:32px; height:32px; border-radius:11px; display:grid; place-items:center; }
  .selah-v19-body { padding:0 12px 12px; }
  .selah-v19-members { display:grid; gap:6px; max-height:180px; overflow:auto; }
  .selah-v19-member { display:grid; grid-template-columns:30px minmax(0,1fr) auto; align-items:center; gap:8px; padding:7px 8px; border-radius:13px; background:rgba(255,255,255,.055); }
  .selah-v19-avatar { width:30px; height:30px; border-radius:10px; display:grid; place-items:center; font-weight:900; background:linear-gradient(145deg,#ff9cca,#d64b9a); box-shadow:inset 0 1px rgba(255,255,255,.3); }
  .selah-v19-member-name { min-width:0; font-size:12px; font-weight:800; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .selah-v19-member-meta { color:#d9b4c8; font-size:10px; margin-top:2px; }
  .selah-v19-online { width:8px; height:8px; border-radius:50%; background:#69e39a; box-shadow:0 0 10px rgba(105,227,154,.75); }
  .selah-v19-offline { background:#8f7885; box-shadow:none; }
  .selah-v19-toolbar { display:flex; flex-wrap:wrap; gap:6px; margin-top:9px; }
  .selah-v19-chip { min-height:32px; padding:0 10px; border-radius:999px; }
  .selah-v19-empty { padding:14px 10px; text-align:center; color:#dcb8ca; font-size:11px; line-height:1.45; }
  #selah-ping-card-v19 { margin-top:8px; padding:9px 10px; border-radius:14px; background:linear-gradient(135deg,rgba(255,112,181,.16),rgba(255,255,255,.05)); border:1px solid rgba(255,127,187,.24); font-size:11px; }
  #selah-ping-card-v19[hidden] { display:none; }
  .selah-v19-modal {
    position:absolute; inset:0; display:grid; place-items:center; padding:20px; pointer-events:auto;
    background:radial-gradient(circle at center, rgba(66,24,51,.2), rgba(9,5,9,.65));
    opacity:0; visibility:hidden; transition:opacity .16s ease, visibility .16s ease;
  }
  .selah-v19-modal[data-open="true"] { opacity:1; visibility:visible; }
  .selah-v19-wheel { position:relative; width:min(430px,92vw); aspect-ratio:1; border-radius:50%; }
  .selah-v19-wheel-center {
    position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:142px; height:142px;
    border-radius:50%; display:grid; place-items:center; text-align:center; padding:14px;
    background:radial-gradient(circle at 35% 25%,rgba(255,154,207,.36),rgba(47,20,40,.96) 65%);
    border:1px solid rgba(255,255,255,.25); box-shadow:0 20px 55px rgba(24,5,18,.45),inset 0 1px rgba(255,255,255,.16);
  }
  .selah-v19-wheel-center strong { font-size:15px; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .selah-v19-wheel-center span { color:#edbfd5; font-size:10px; line-height:1.35; margin-top:5px; }
  .selah-v19-action {
    position:absolute; left:50%; top:50%; width:108px; min-height:62px; padding:9px 8px; border-radius:18px;
    transform:translate(-50%,-50%) rotate(var(--a)) translateY(-155px) rotate(calc(-1 * var(--a)));
    background:linear-gradient(145deg,rgba(70,31,58,.96),rgba(40,20,35,.94)); text-align:center;
  }
  .selah-v19-action:hover { transform:translate(-50%,-50%) rotate(var(--a)) translateY(-160px) rotate(calc(-1 * var(--a))) scale(1.04); }
  .selah-v19-action b { display:block; font-size:18px; margin-bottom:5px; }
  .selah-v19-action span { display:block; font-size:10px; line-height:1.2; }
  .selah-v19-target-nav { position:absolute; left:50%; top:50%; width:230px; display:flex; justify-content:space-between; transform:translate(-50%,-50%); pointer-events:none; }
  .selah-v19-target-nav button { pointer-events:auto; }
  .selah-v19-panel { width:min(440px,94vw); max-height:min(720px,90vh); overflow:auto; border-radius:28px; padding:18px; }
  .selah-v19-panel h2 { margin:0; font-size:22px; letter-spacing:-.03em; }
  .selah-v19-panel p { color:#e1b9cd; font-size:12px; line-height:1.55; }
  .selah-v19-ping-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; margin-top:14px; }
  .selah-v19-ping-grid button { min-height:78px; border-radius:18px; }
  #selah-phone-panel-v19 img { display:block; width:220px; height:220px; max-width:100%; margin:15px auto; padding:10px; border-radius:22px; background:white; }
  .selah-v19-linkbox { word-break:break-all; padding:10px; border-radius:14px; background:rgba(255,255,255,.07); color:#f6d8e7; font-size:11px; }
  #selah-toast-stack-v19 { position:absolute; right:14px; top:14px; width:min(330px,calc(100vw - 28px)); display:grid; gap:8px; pointer-events:none; }
  .selah-v19-toast { pointer-events:auto; padding:12px 13px; border-radius:17px; animation:selahToastIn .22s ease both; }
  .selah-v19-toast strong { display:block; font-size:12px; }
  .selah-v19-toast span { display:block; color:#e8bfd3; font-size:11px; margin-top:4px; line-height:1.4; }
  @keyframes selahToastIn { from { opacity:0; transform:translateX(20px) scale(.97) } to { opacity:1; transform:none } }
  @media (max-width:700px) {
    #selah-party-hud-v19 { width:245px; }
    .selah-v19-wheel { transform:scale(.82); }
    .selah-v19-action { transform:translate(-50%,-50%) rotate(var(--a)) translateY(-142px) rotate(calc(-1 * var(--a))); }
    .selah-v19-action:hover { transform:translate(-50%,-50%) rotate(var(--a)) translateY(-146px) rotate(calc(-1 * var(--a))) scale(1.03); }
  }
</style>
<script id="selahmc-social-layer-v19-script">
(() => {
  if (window.__selahSocialLayerV19) return;
  window.__selahSocialLayerV19 = true;

  const API_ROOT = "/voice-api";
  const SECOND_SCREEN = "/client/second-screen.html";
  const PING_PREFIX = "[SELAH-PING:v1]";
  const STATE_KEY = "selahmc.social.v19";
  const endpointHints = {
    party: ["/companion/party", "/companion/state", "/companion/home", "/companion/snapshot"],
    people: ["/companion/people", "/companion/friends", "/companion/online"],
    chat: ["/companion/party/chat", "/companion/chat"],
    waypoint: ["/companion/party/waypoint", "/companion/party/ping", "/companion/waypoint"],
    friend: ["/companion/friend/request", "/companion/friends/request", "/companion/friend"],
    invite: ["/companion/party/invite", "/companion/invite"],
  };
  const state = {
    token: "", partyName: "Party", me: null, members: [], people: [], pings: [],
    selected: 0, lastPingIds: new Set(), discovered: new Set(), busy: false,
  };

  const esc = (value) => String(value ?? "").replace(/[&<>\"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const isNum = (value) => value !== "" && Number.isFinite(Number(value));
  const bool = (value) => /^(1|true|yes|online|on)$/i.test(String(value || ""));
  const rows = (text) => String(text || "").trim().split(/\r?\n/).filter(Boolean).map((line) => line.split("\t"));
  const distance = (a, b) => a && b && a.world === b.world ? Math.round(Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z)) : null;
  const initials = (name) => String(name || "?").slice(0, 2).toUpperCase();

  function findToken() {
    const preferred = ["selahmc.companion.token", "selahmc_companion_token", "selahmc-companion-token", "companionToken", "selahToken"];
    for (const key of preferred) {
      try { const value = localStorage.getItem(key); if (value && value.length > 12) return value; } catch {}
    }
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i) || "";
        const value = localStorage.getItem(key) || "";
        if (/companion|selah.*token|session/i.test(key) && value.length > 12 && value.length < 600) return value;
      }
    } catch {}
    return "";
  }

  async function discoverEndpoints() {
    if (state.discovered.size) return;
    try {
      const html = await fetch("/app", { cache: "no-store" }).then((r) => r.text());
      const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => new URL(m[1], location.origin).href).slice(0, 18);
      for (const src of scripts) {
        try {
          const code = await fetch(src, { cache: "force-cache" }).then((r) => r.text());
          for (const match of code.matchAll(/(?:\/voice-api)?(\/companion\/[a-z0-9_\-/]+)/gi)) state.discovered.add(match[1]);
        } catch {}
      }
    } catch {}
  }

  function candidates(kind) {
    const hints = endpointHints[kind] || [];
    const words = kind === "friend" ? ["friend"] : kind === "invite" ? ["invite"] : kind === "waypoint" ? ["waypoint", "ping"] : [kind];
    const found = [...state.discovered].filter((path) => words.some((word) => path.includes(word)));
    return [...new Set([...hints, ...found])];
  }

  async function callOne(path, method = "GET", fields = {}) {
    state.token ||= findToken();
    if (!state.token) return null;
    const data = new URLSearchParams();
    data.set("token", state.token); data.set("session", state.token); data.set("auth", state.token);
    Object.entries(fields).forEach(([key, value]) => value != null && data.set(key, String(value)));
    let url = `${API_ROOT}${path}`;
    const options = {
      method,
      cache: "no-store",
      headers: { "Authorization": `Bearer ${state.token}`, "X-Selah-Token": state.token, "X-Companion-Token": state.token },
    };
    if (method === "GET") url += `?${data.toString()}`;
    else {
      options.headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
      options.body = data.toString();
    }
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      if (!response.ok) return null;
      return { path, status: response.status, text, rows: rows(text) };
    } catch { return null; }
  }

  async function request(kind, method = "GET", variants = [{}]) {
    await discoverEndpoints();
    for (const path of candidates(kind)) {
      for (const fields of variants) {
        const result = await callOne(path, method, fields);
        if (result) return result;
      }
    }
    return null;
  }

  function findCoords(row) {
    for (let i = 0; i <= row.length - 3; i++) {
      if (isNum(row[i]) && isNum(row[i+1]) && isNum(row[i+2])) {
        const before = row[i-1] || ""; const after = row[i+3] || "";
        return { x:Number(row[i]), y:Number(row[i+1]), z:Number(row[i+2]), world: /world|nether|end|survival/i.test(before) ? before : (/world|nether|end|survival/i.test(after) ? after : "world") };
      }
    }
    return null;
  }

  function parsePing(message, author = "Party") {
    const text = String(message || "");
    const index = text.indexOf(PING_PREFIX);
    if (index < 0) return null;
    const parts = text.slice(index + PING_PREFIX.length).replace(/^\|/, "").split("|");
    const [type="here", label="Party ping", x="", y="", z="", world="world", stamp="0"] = parts;
    return { id:`${author}:${stamp}:${type}`, author, type, label, coords:isNum(x)&&isNum(y)&&isNum(z)?{x:Number(x),y:Number(y),z:Number(z),world}:null, stamp:Number(stamp)||Date.now() };
  }

  function absorb(result) {
    if (!result) return;
    const members = []; const people = []; const pings = [];
    for (const row of result.rows) {
      const key = String(row[0] || "").toLowerCase();
      const values = row.slice(1).filter((value) => value !== "");
      if (!values.length) continue;
      const name = values.find((value) => /^[A-Za-z0-9_]{2,20}$/.test(value));
      const coords = findCoords(row);
      if (/^(me|profile|self|player)$/.test(key) || key.includes("profile")) {
        state.me = { name:name || state.me?.name || "You", online:true, coords:coords || state.me?.coords || null };
      }
      if (key.includes("party") && !key.includes("invite") && values[0] && !isNum(values[0]) && values[0].length < 60) state.partyName = values[0];
      if (key.includes("member") || key.includes("party_player") || key === "player") {
        if (name) members.push({ name, online: row.some(bool), coords });
      }
      if (key.includes("person") || key.includes("friend") || key.includes("nearby") || key.includes("online_player")) {
        if (name) people.push({ name, online: !row.some((value) => /offline/i.test(value)), coords });
      }
      if (key.includes("message") || key.includes("chat") || key.includes("notification")) {
        const body = values[values.length-1] || "";
        const author = name || values[0] || "Party";
        const ping = parsePing(body, author); if (ping) pings.push(ping);
      }
      for (const value of row) { const ping = parsePing(value, name || "Party"); if (ping) pings.push(ping); }
    }
    if (members.length) state.members = dedupe(members);
    if (people.length) state.people = dedupe([...people, ...state.members]);
    if (pings.length) {
      state.pings = dedupePings([...pings, ...state.pings]).filter((ping) => Date.now() - ping.stamp < 30 * 60_000).slice(0, 15);
      for (const ping of pings) if (!state.lastPingIds.has(ping.id)) { state.lastPingIds.add(ping.id); toast(`${ping.author}: ${ping.label}`, "Party ping"); }
    }
  }

  const dedupe = (items) => [...new Map(items.filter((item) => item.name).map((item) => [item.name.toLowerCase(), item])).values()];
  const dedupePings = (items) => [...new Map(items.map((item) => [item.id, item])).values()].sort((a,b) => b.stamp-a.stamp);

  function root() {
    let node = document.getElementById("selah-social-root-v19");
    if (node) return node;
    node = document.createElement("div"); node.id = "selah-social-root-v19";
    node.innerHTML = `
      <section id="selah-party-hud-v19" class="selah-v19-glass" data-collapsed="false">
        <div class="selah-v19-hud-head"><i class="selah-v19-brand-dot"></i><div class="selah-v19-title"><strong>Selah Party</strong><span id="selah-party-sub-v19">Connecting to Companion…</span></div><button class="selah-v19-icon-btn" data-act="collapse" title="Collapse">−</button></div>
        <div class="selah-v19-body"><div class="selah-v19-members" id="selah-members-v19"></div><div id="selah-ping-card-v19" hidden></div><div class="selah-v19-toolbar"><button class="selah-v19-chip" data-act="players">People</button><button class="selah-v19-chip" data-act="pings">Ping</button><button class="selah-v19-chip" data-act="phone">Phone</button><button class="selah-v19-chip" data-act="app">App</button></div></div>
      </section>
      <div id="selah-toast-stack-v19"></div>
      <div id="selah-player-modal-v19" class="selah-v19-modal"><div id="selah-player-wheel-v19" class="selah-v19-wheel"></div></div>
      <div id="selah-ping-modal-v19" class="selah-v19-modal"><div class="selah-v19-panel selah-v19-glass"><button class="selah-v19-icon-btn" style="float:right" data-act="close">×</button><h2>Party ping</h2><p>Drop a quick waypoint for everyone in your party. Coordinates are included when Companion exposes your live location.</p><div class="selah-v19-ping-grid" id="selah-ping-grid-v19"></div></div></div>
      <div id="selah-phone-modal-v19" class="selah-v19-modal"><div id="selah-phone-panel-v19" class="selah-v19-panel selah-v19-glass"><button class="selah-v19-icon-btn" style="float:right" data-act="close">×</button><h2>Phone second screen</h2><p>Scan this with your phone, link the same Minecraft account there, then keep party chat, alerts, waypoints, and voice controls beside you.</p><img alt="QR code for SelahMC second screen" /><div class="selah-v19-linkbox"></div><div class="selah-v19-toolbar"><button class="selah-v19-chip" data-act="copy-phone">Copy link</button><button class="selah-v19-chip" data-act="share-phone">Share</button><button class="selah-v19-chip" data-act="open-phone">Open here</button></div></div></div>`;
    document.body.appendChild(node);
    wireUi(node); render();
    return node;
  }

  function toast(message, title = "SelahMC") {
    root(); const stack = document.getElementById("selah-toast-stack-v19");
    const item = document.createElement("div"); item.className = "selah-v19-toast selah-v19-glass";
    item.innerHTML = `<strong>${esc(title)}</strong><span>${esc(message)}</span>`; stack.appendChild(item);
    setTimeout(() => { item.style.opacity="0"; item.style.transform="translateX(15px)"; setTimeout(() => item.remove(),220); }, 5200);
  }

  function render() {
    root(); const sub = document.getElementById("selah-party-sub-v19"); const list = document.getElementById("selah-members-v19");
    if (!state.token) {
      sub.textContent = "Link Companion to activate";
      list.innerHTML = `<div class="selah-v19-empty">Open the Companion app and link Minecraft once. This HUD will then appear automatically.</div>`;
    } else {
      sub.textContent = state.members.length ? `${state.partyName || "Party"} · ${state.members.filter((m)=>m.online).length}/${state.members.length} online` : "No active party";
      list.innerHTML = state.members.length ? state.members.map((member) => {
        const d = distance(state.me?.coords, member.coords); return `<div class="selah-v19-member"><div class="selah-v19-avatar">${esc(initials(member.name))}</div><div><div class="selah-v19-member-name">${esc(member.name)}</div><div class="selah-v19-member-meta">${d == null ? (member.online ? "Online" : "Offline") : `${d}m away`}</div></div><i class="selah-v19-online ${member.online ? "" : "selah-v19-offline"}"></i></div>`;
      }).join("") : `<div class="selah-v19-empty">Create or join a party in Companion. Your members and distance will show here.</div>`;
    }
    const latest = state.pings[0]; const card = document.getElementById("selah-ping-card-v19");
    if (latest) { const d = distance(state.me?.coords, latest.coords); card.hidden=false; card.innerHTML=`<b>📍 ${esc(latest.label)}</b><div style="margin-top:4px;color:#edc8da">${esc(latest.author)}${d == null ? "" : ` · ${d}m away`}</div>`; }
    else card.hidden=true;
  }

  function selectedTarget() {
    const candidates = dedupe([...state.people, ...state.members]).filter((person) => !state.me || person.name.toLowerCase() !== state.me.name.toLowerCase());
    if (!candidates.length) return null; state.selected = ((state.selected % candidates.length) + candidates.length) % candidates.length; return { target:candidates[state.selected], all:candidates };
  }

  function openPlayerWheel() {
    root(); const data = selectedTarget(); if (!data) { toast("No linked players were found yet. Open Companion or stand near another linked player.", "Social wheel"); return; }
    const { target, all } = data; const wheel = document.getElementById("selah-player-wheel-v19");
    const actions = [
      ["♡","Add friend","friend"],["✦","Invite party","invite"],["☄","Ping here","ping"],["👋","Wave","wave"],["◉","View profile","profile"],["✕","Close","close"]
    ];
    wheel.innerHTML = `<div class="selah-v19-wheel-center"><div><strong>${esc(target.name)}</strong><span>${target.online ? "Online in SelahMC" : "Linked player"}<br>${all.length > 1 ? `${state.selected+1} of ${all.length}` : "Hold right-click to open"}</span></div></div><div class="selah-v19-target-nav"><button class="selah-v19-icon-btn" data-wheel="prev">‹</button><button class="selah-v19-icon-btn" data-wheel="next">›</button></div>` + actions.map((item,index)=>`<button class="selah-v19-action" style="--a:${index*60}deg" data-wheel="${item[2]}"><b>${item[0]}</b><span>${item[1]}</span></button>`).join("");
    wheel.onclick = async (event) => { const button = event.target.closest("[data-wheel]"); if (!button) return; const action=button.dataset.wheel; if(action==="prev"||action==="next"){state.selected += action==="next"?1:-1;openPlayerWheel();return;} if(action==="close"){closeModals();return;} await playerAction(action,target); };
    document.getElementById("selah-player-modal-v19").dataset.open="true";
    try { document.exitPointerLock?.(); } catch {}
  }

  async function playerAction(action, target) {
    if (action === "profile") { window.open(`/app?tab=profile&player=${encodeURIComponent(target.name)}`, "_blank", "noopener"); closeModals(); return; }
    if (action === "ping") { closeModals(); openPingWheel(target.name); return; }
    if (action === "wave") {
      const message = `👋 ${state.me?.name || "A party member"} waved to ${target.name}.`;
      const result = await request("chat", "POST", [{message,text:message,body:message}]);
      toast(result ? `You waved to ${target.name}.` : `Wave shown locally for ${target.name}.`, "Social wheel"); closeModals(); return;
    }
    const variants = [{name:target.name,target:target.name,player:target.name,username:target.name}];
    const result = await request(action === "friend" ? "friend" : "invite", "POST", variants);
    toast(result ? (action === "friend" ? `Friend request sent to ${target.name}.` : `Party invite sent to ${target.name}.`) : `Open Companion to finish the ${action === "friend" ? "friend request" : "party invite"}.`, "Social wheel");
    if (!result) window.open(`/app?tab=${action === "friend" ? "friends" : "party"}&player=${encodeURIComponent(target.name)}`, "_blank", "noopener");
    closeModals(); setTimeout(refresh,600);
  }

  const pingKinds = [
    ["here","📍","Go here"],["danger","⚠","Danger"],["help","♡","Need help"],["meet","✦","Meet here"],["church","✝","Church event"],["found","◇","Found something"]
  ];
  function openPingWheel(targetName="") {
    root(); const grid=document.getElementById("selah-ping-grid-v19");
    grid.innerHTML=pingKinds.map(([type,icon,label])=>`<button class="selah-v19-action" style="position:static;transform:none;width:auto" data-ping="${type}" data-label="${label}"><b>${icon}</b><span>${label}${targetName ? ` · ${esc(targetName)}` : ""}</span></button>`).join("");
    grid.onclick=(event)=>{const button=event.target.closest("[data-ping]");if(button) void sendPing(button.dataset.ping,button.dataset.label,targetName);};
    document.getElementById("selah-ping-modal-v19").dataset.open="true";
    try { document.exitPointerLock?.(); } catch {}
  }

  async function sendPing(type,label,targetName="") {
    const pos=state.me?.coords; const stamp=Date.now(); const finalLabel=targetName ? `${label}: ${targetName}` : label;
    const structured=`${PING_PREFIX}|${type}|${finalLabel}|${pos?.x ?? ""}|${pos?.y ?? ""}|${pos?.z ?? ""}|${pos?.world ?? "world"}|${stamp}`;
    const waypointFields={type,label:finalLabel,x:pos?.x,y:pos?.y,z:pos?.z,world:pos?.world,message:structured,text:structured};
    let result=await request("waypoint","POST",[waypointFields]);
    if(!result) result=await request("chat","POST",[{message:structured,text:structured,body:structured,type:"ping"}]);
    const ping={id:`local:${stamp}:${type}`,author:state.me?.name||"You",type,label:finalLabel,coords:pos||null,stamp}; state.pings.unshift(ping); state.lastPingIds.add(ping.id);
    toast(result ? `${finalLabel} sent to your party.` : `${finalLabel} saved locally. Open Companion if the party API is not linked.`,"Party ping"); closeModals(); render();
  }

  function openPhone() {
    root(); const url=new URL(SECOND_SCREEN,location.origin).href; const panel=document.getElementById("selah-phone-panel-v19");
    panel.querySelector("img").src=`https://api.qrserver.com/v1/create-qr-code/?size=440x440&margin=12&data=${encodeURIComponent(url)}`;
    panel.querySelector(".selah-v19-linkbox").textContent=url; document.getElementById("selah-phone-modal-v19").dataset.open="true";
  }
  function closeModals(){ document.querySelectorAll(".selah-v19-modal").forEach((modal)=>modal.dataset.open="false"); try{document.querySelector("canvas")?.focus();}catch{} }

  function wireUi(node) {
    node.addEventListener("click", async (event) => {
      const action=event.target.closest("[data-act]")?.dataset.act; if(!action) return;
      if(action==="collapse"){const hud=document.getElementById("selah-party-hud-v19");hud.dataset.collapsed=String(hud.dataset.collapsed!=="true");event.target.textContent=hud.dataset.collapsed==="true"?"+":"−";}
      else if(action==="players") openPlayerWheel(); else if(action==="pings") openPingWheel(); else if(action==="phone") openPhone();
      else if(action==="app") window.open("/app","_blank","noopener"); else if(action==="close") closeModals();
      else if(action==="copy-phone"){await navigator.clipboard?.writeText(new URL(SECOND_SCREEN,location.origin).href);toast("Second-screen link copied.");}
      else if(action==="share-phone"){const url=new URL(SECOND_SCREEN,location.origin).href;if(navigator.share) await navigator.share({title:"SelahMC second screen",url});else{await navigator.clipboard?.writeText(url);toast("Link copied instead.");}}
      else if(action==="open-phone") window.open(SECOND_SCREEN,"_blank","noopener");
    });
    node.querySelectorAll(".selah-v19-modal").forEach((modal)=>modal.addEventListener("pointerdown",(event)=>{if(event.target===modal)closeModals();}));
  }

  let holdTimer=0; let wheelOpened=false;
  document.addEventListener("pointerdown",(event)=>{
    if(event.button!==2||event.target.closest?.("#selah-social-root-v19"))return; wheelOpened=false; holdTimer=window.setTimeout(()=>{wheelOpened=true;openPlayerWheel();},520);
  },true);
  document.addEventListener("pointerup",()=>{clearTimeout(holdTimer);},true);
  document.addEventListener("pointercancel",()=>clearTimeout(holdTimer),true);
  document.addEventListener("contextmenu",(event)=>{if(wheelOpened||document.querySelector(".selah-v19-modal[data-open='true']")){event.preventDefault();event.stopPropagation();}},true);
  window.addEventListener("keydown",(event)=>{
    if(event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable='true']"))return;
    if(event.code==="KeyG"&&!event.repeat){event.preventDefault();openPlayerWheel();}
    if(event.code==="KeyP"&&!event.repeat){event.preventDefault();openPingWheel();}
    if(event.code==="Escape"&&document.querySelector(".selah-v19-modal[data-open='true']")){event.preventDefault();event.stopImmediatePropagation();closeModals();}
  },true);

  async function refresh() {
    if(state.busy)return; state.busy=true; state.token=findToken();
    try {
      if(state.token){absorb(await request("party"));absorb(await request("people"));}
      render();
    } finally { state.busy=false; }
  }

  root(); void refresh(); setInterval(refresh,4000);
})();
</script>
'''

SECOND_SCREEN_HTML = r'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <meta name="theme-color" content="#35172d" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <title>SelahMC Second Screen</title>
  <style>
    *{box-sizing:border-box}html,body{height:100%;margin:0;background:#1e101b;color:white;font-family:Inter,system-ui,sans-serif}body{display:grid;grid-template-rows:auto 1fr;overflow:hidden}.bar{display:flex;align-items:center;gap:9px;padding:max(10px,env(safe-area-inset-top)) 12px 10px;background:linear-gradient(135deg,#4a203d,#281523);border-bottom:1px solid rgba(255,255,255,.14);box-shadow:0 10px 35px rgba(0,0,0,.24);z-index:2}.dot{width:11px;height:11px;border-radius:50%;background:#ff77b8;box-shadow:0 0 16px #ff77b8}.title{flex:1;min-width:0}.title b{display:block;font-size:13px}.title span{display:block;color:#e3b9cf;font-size:10px;margin-top:2px}.btn{border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(255,255,255,.08);color:white;padding:9px 11px;font-weight:800;font-size:11px;cursor:pointer}.btn.on{background:linear-gradient(135deg,#ff77b8,#d84a98)}iframe{width:100%;height:100%;border:0;background:#fdf8fb}.notice{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);padding:10px 13px;border-radius:14px;background:rgba(44,20,37,.94);border:1px solid rgba(255,255,255,.16);font-size:11px;opacity:0;pointer-events:none;transition:.2s;z-index:5}.notice.show{opacity:1;transform:translate(-50%,-4px)}@media(max-width:520px){.title span{display:none}.btn{padding:8px 9px}}
  </style>
</head>
<body>
  <header class="bar"><i class="dot"></i><div class="title"><b>SelahMC Second Screen</b><span>Party · alerts · waypoints · voice</span></div><button class="btn" id="wake">Keep awake</button><button class="btn" id="share">Share</button><button class="btn" id="full">Full app</button></header>
  <iframe src="/app?second=1" title="SelahMC Companion"></iframe><div class="notice" id="notice"></div>
  <script>
    let wake=null;const button=document.getElementById('wake');const note=(text)=>{const n=document.getElementById('notice');n.textContent=text;n.classList.add('show');setTimeout(()=>n.classList.remove('show'),2400)};
    async function toggleWake(){if(wake){await wake.release();wake=null;button.classList.remove('on');button.textContent='Keep awake';return}if(!('wakeLock'in navigator)){note('Wake lock is not supported on this browser.');return}try{wake=await navigator.wakeLock.request('screen');button.classList.add('on');button.textContent='Awake';wake.addEventListener('release',()=>{wake=null;button.classList.remove('on');button.textContent='Keep awake'})}catch(error){note('Your phone did not allow the screen wake lock.')}}
    button.onclick=toggleWake;document.getElementById('full').onclick=()=>location.href='/app?second=1';document.getElementById('share').onclick=async()=>{const url=location.href;if(navigator.share)await navigator.share({title:'SelahMC Second Screen',url});else{await navigator.clipboard.writeText(url);note('Link copied.')}};
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&button.classList.contains('on')&&!wake)void toggleWake()});
  </script>
</body>
</html>
'''


def backup(path: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    destination = path.with_name(f"{path.name}.backup-v19-{stamp}")
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
        text = text[:index] + SOCIAL_BRIDGE + "\n" + text[index:]
    elif "</html>" in lowered:
        index = lowered.rfind("</html>")
        text = text[:index] + SOCIAL_BRIDGE + "\n" + text[index:]
    else:
        text += "\n" + SOCIAL_BRIDGE + "\n"
    path.write_text(text, encoding="utf-8")
    print(f"Patched social layer: {path}")
    print(f"Backup: {backup_path}")
    return True


def candidate_client_indexes() -> list[Path]:
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


def write_second_screen(indexes: list[Path]) -> None:
    targets: list[Path] = []
    for index in indexes:
        targets.append(index.parent / "second-screen.html")
    public = Path("/home/ubuntu/larptube/selahmc/website/public")
    if public.is_dir():
        targets.append(public / "second-screen.html")
    seen: set[Path] = set()
    for target in targets:
        if target in seen:
            continue
        seen.add(target)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and "SelahMC Second Screen" in target.read_text(encoding="utf-8", errors="ignore"):
            print(f"Second screen already current: {target}")
            continue
        if target.exists():
            print(f"Backup: {backup(target)}")
        target.write_text(SECOND_SCREEN_HTML, encoding="utf-8")
        print(f"Wrote phone second screen: {target}")


def install_persistent_copy(script_path: Path) -> None:
    website = Path("/home/ubuntu/larptube/selahmc/website")
    scripts = website / "scripts"
    install = website / "install.sh"
    if not website.is_dir():
        return
    scripts.mkdir(parents=True, exist_ok=True)
    target = scripts / "patch-social-layer.py"
    if script_path.resolve() != target.resolve():
        shutil.copy2(script_path, target)
        target.chmod(target.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        print(f"Installed persistent patcher: {target}")
    if install.is_file():
        text = install.read_text(encoding="utf-8", errors="replace")
        if HOOK_MARKER not in text:
            backup_path = backup(install)
            hook = f'''\n# {HOOK_MARKER}\nif [ -f "$(dirname "$0")/scripts/patch-social-layer.py" ]; then\n  echo "Applying SelahMC v19 party HUD, second screen, wheels, and pings..."\n  sudo python3 "$(dirname "$0")/scripts/patch-social-layer.py" --client-only || true\nfi\n'''
            install.write_text(text.rstrip() + "\n" + hook, encoding="utf-8")
            print(f"Added persistent website installer hook: {install}")
            print(f"Backup: {backup_path}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--client-only", action="store_true")
    args = parser.parse_args()
    indexes = candidate_client_indexes()
    if not indexes:
        print("ERROR: Could not find SelahMC client/index.html", file=sys.stderr)
        return 1
    successes = sum(1 for path in indexes if patch_html(path))
    write_second_screen(indexes)
    if not args.client_only:
        install_persistent_copy(Path(__file__))
    print()
    print(f"Patched {successes} browser client file(s).")
    print("Party HUD: top-left")
    print("Player social wheel: hold right-click, or press G")
    print("Party ping wheel: press P, or use the HUD Ping button")
    print("Phone second screen: https://selahmc.me/client/second-screen.html")
    print("Hard-refresh https://selahmc.me/play with Ctrl+Shift+R")
    return 0 if successes else 1


if __name__ == "__main__":
    raise SystemExit(main())
