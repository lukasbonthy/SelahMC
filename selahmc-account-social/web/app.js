(() => {
  const API = "/auth-api";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = {
    account: null,
    csrf: "",
    panel: "people",
    peoplePage: 1,
    peopleQuery: "",
    peopleDone: false,
    friends: [],
    dmTarget: null,
    installPrompt: null,
    codeExpiresAt: 0,
    codeTimer: 0,
    polling: 0,
  };

  const panels = {
    people: ["Community directory", "Find people"],
    friends: ["Your circle", "Friends"],
    messages: ["Private conversations", "Messages"],
    "friends-feed": ["Your circle", "Friends chat"],
    global: ["Whole server", "SelahMC community"],
    minecraft: ["Secure server access", "Minecraft login"],
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function initials(name) {
    return String(name || "?").slice(0, 2).toUpperCase();
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function toast(title, message, error = false) {
    const element = document.createElement("div");
    element.className = `toast${error ? " error" : ""}`;
    element.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
    $("#toastStack").appendChild(element);
    setTimeout(() => {
      element.style.opacity = "0";
      element.style.transform = "translateX(12px)";
      setTimeout(() => element.remove(), 220);
    }, 4300);
  }

  async function api(path, options = {}) {
    const method = options.method || "GET";
    const headers = { ...(options.headers || {}) };
    if (options.body && typeof options.body !== "string") {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    if (!["GET", "HEAD"].includes(method.toUpperCase()) && state.csrf) headers["X-CSRF-Token"] = state.csrf;
    const response = await fetch(`${API}${path}`, {
      credentials: "include",
      cache: "no-store",
      ...options,
      method,
      headers,
    });
    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const message = payload.error || `Request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      if (response.status === 401 && state.account) showAuth("login");
      throw error;
    }
    return payload;
  }

  function showAuth(mode = "login") {
    state.account = null;
    state.csrf = "";
    $("#appView").classList.add("hidden");
    $("#authView").classList.remove("hidden");
    switchAuth(mode);
    stopPolling();
  }

  function showApp(payload) {
    state.account = payload.account;
    state.csrf = payload.csrf;
    $("#authView").classList.add("hidden");
    $("#appView").classList.remove("hidden");
    $("#profileName").textContent = state.account.username;
    $("#profileAvatar").textContent = initials(state.account.username);
    $("#minecraftUsername").textContent = state.account.username;
    switchPanel(state.panel);
    refreshEverything();
    startPolling();
  }

  function switchAuth(mode) {
    const signup = mode === "signup";
    $("#loginForm").classList.toggle("hidden", signup);
    $("#signupForm").classList.toggle("hidden", !signup);
    $$('[data-auth-mode]').forEach(button => button.classList.toggle("active", button.dataset.authMode === mode));
    $("#authError").classList.add("hidden");
    const url = new URL(location.href);
    if (signup) url.searchParams.set("mode", "signup"); else url.searchParams.delete("mode");
    history.replaceState(null, "", url);
  }

  function authError(message) {
    const element = $("#authError");
    element.textContent = message;
    element.classList.remove("hidden");
  }

  function switchPanel(panel) {
    state.panel = panel;
    $$(".panel").forEach(element => element.classList.toggle("active", element.id === `panel-${panel}`));
    $$("#navigation [data-panel]").forEach(button => button.classList.toggle("active", button.dataset.panel === panel));
    $("#panelEyebrow").textContent = panels[panel]?.[0] || "SelahMC";
    $("#panelTitle").textContent = panels[panel]?.[1] || "Companion";
    if (panel === "people") loadPeople(true);
    if (panel === "friends") loadFriends(true);
    if (panel === "messages") loadFriends(true);
    if (panel === "friends-feed") loadFriendsFeed();
    if (panel === "global") loadGlobal();
  }

  async function loadPeople(reset = false) {
    if (!state.account) return;
    if (reset) {
      state.peoplePage = 1;
      state.peopleDone = false;
      $("#peopleList").innerHTML = "";
    }
    if (state.peopleDone) return;
    try {
      const payload = await api(`/social/users?q=${encodeURIComponent(state.peopleQuery)}&page=${state.peoplePage}&limit=40`);
      renderPeople(payload.users, !reset);
      state.peopleDone = payload.users.length < payload.limit;
      $("#loadMorePeople").classList.toggle("hidden", state.peopleDone);
      if (!state.peopleDone) state.peoplePage += 1;
    } catch (error) {
      toast("Could not load people", error.message, true);
    }
  }

  function personCard(user) {
    let actions = "";
    if (user.friendship === "friends") {
      actions = `<button class="button primary" data-person-action="message" data-username="${escapeHtml(user.username)}">Message</button><button class="button ghost" data-person-action="remove" data-username="${escapeHtml(user.username)}">Remove</button>`;
    } else if (user.friendship === "incoming") {
      actions = `<button class="button primary" data-person-action="accept" data-username="${escapeHtml(user.username)}">Accept</button><button class="button ghost" data-person-action="decline" data-username="${escapeHtml(user.username)}">Decline</button>`;
    } else if (user.friendship === "outgoing") {
      actions = `<button class="button ghost" disabled>Request sent</button>`;
    } else {
      actions = `<button class="button primary" data-person-action="add" data-username="${escapeHtml(user.username)}">Add friend</button>`;
    }
    return `<article class="person-card glass">
      <div class="avatar">${escapeHtml(initials(user.username))}</div>
      <div class="person-main"><strong>${escapeHtml(user.username)}</strong><span><i class="status-dot ${user.online ? "online" : ""}"></i>${user.online ? "Online now" : "Offline"}</span></div>
      <div class="person-actions">${actions}</div>
    </article>`;
  }

  function renderPeople(users, append = false) {
    const list = $("#peopleList");
    if (!append) list.innerHTML = "";
    if (!users.length && !append) {
      list.innerHTML = `<div class="empty-state glass"><b>No players found</b><span>Try a different search or invite someone to create a SelahMC account.</span></div>`;
      return;
    }
    list.insertAdjacentHTML("beforeend", users.map(personCard).join(""));
  }

  async function personAction(action, username) {
    try {
      if (action === "message") {
        await loadFriends(true);
        selectDm(username);
        switchPanel("messages");
        return;
      }
      const path = action === "add" ? "/social/friend-request"
        : action === "remove" ? "/social/friend-remove"
        : "/social/friend-respond";
      const body = action === "accept" || action === "decline"
        ? { username, action }
        : { username };
      await api(path, { method: "POST", body });
      toast("Friends updated", action === "add" ? `Friend request sent to ${username}.` : action === "accept" ? `You and ${username} are now friends.` : action === "decline" ? "Request declined." : `${username} was removed.`);
      await Promise.all([loadPeople(true), loadFriends(true)]);
    } catch (error) {
      if (error.payload?.incoming) {
        toast("Request already waiting", error.message, true);
      } else {
        toast("Could not update friends", error.message, true);
      }
    }
  }

  async function loadFriends(render = true) {
    if (!state.account) return;
    try {
      const payload = await api("/social/friends");
      state.friends = payload.friends || [];
      if (render) {
        renderFriendsGrid();
        renderConversationFriends();
      }
      return state.friends;
    } catch (error) {
      toast("Could not load friends", error.message, true);
      return [];
    }
  }

  function renderFriendsGrid() {
    const list = $("#friendsList");
    if (!state.friends.length) {
      list.innerHTML = `<div class="empty-state glass"><b>Your friends list is waiting</b><span>Find registered players and send your first request.</span></div>`;
      return;
    }
    list.innerHTML = state.friends.map(personCard).join("");
  }

  function renderConversationFriends() {
    const query = $("#friendSearch").value.trim().toLowerCase();
    const friends = state.friends.filter(friend => friend.username.toLowerCase().includes(query));
    const list = $("#conversationFriends");
    if (!friends.length) {
      list.innerHTML = `<div class="empty-state"><b>No friends found</b><span>Add someone from Find people.</span></div>`;
      return;
    }
    list.innerHTML = friends.map(friend => `<button class="conversation-person ${state.dmTarget?.username === friend.username ? "active" : ""}" data-dm-user="${escapeHtml(friend.username)}"><div class="avatar">${escapeHtml(initials(friend.username))}</div><div><strong>${escapeHtml(friend.username)}</strong><span>${friend.online ? "Online now" : "Offline"}</span></div></button>`).join("");
  }

  async function selectDm(username) {
    const friend = state.friends.find(item => item.username.toLowerCase() === username.toLowerCase());
    if (!friend) return;
    state.dmTarget = friend;
    $("#dmAvatar").textContent = initials(friend.username);
    $("#dmTitle").textContent = friend.username;
    $("#dmSubtitle").textContent = friend.online ? "Online now" : "Private friend-to-friend messages";
    $("#dmInput").disabled = false;
    $("#dmForm button").disabled = false;
    renderConversationFriends();
    await loadDm();
  }

  async function loadDm() {
    if (!state.dmTarget || !state.account) return;
    try {
      const payload = await api(`/social/messages?with=${encodeURIComponent(state.dmTarget.username)}&after=0`);
      renderMessages($("#dmMessages"), payload.messages || []);
    } catch (error) {
      toast("Could not load messages", error.message, true);
    }
  }

  function renderMessages(container, messages) {
    if (!messages.length) {
      container.classList.add("empty-chat");
      container.innerHTML = `<div><b>No messages yet</b><span>Start the conversation with kindness.</span></div>`;
      return;
    }
    container.classList.remove("empty-chat");
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    container.innerHTML = messages.map(message => {
      const self = message.senderId === state.account.id;
      return `<div class="message ${self ? "self" : ""}"><div class="message-bubble"><div class="message-meta"><b>${escapeHtml(message.sender)}</b><span>${escapeHtml(formatTime(message.createdAt))}</span></div><div class="message-body">${escapeHtml(message.body)}</div></div></div>`;
    }).join("");
    if (nearBottom) container.scrollTop = container.scrollHeight;
  }

  async function sendDm(message) {
    if (!state.dmTarget) return;
    const payload = await api("/social/messages", { method: "POST", body: { username: state.dmTarget.username, message } });
    await loadDm();
    return payload;
  }

  async function loadFriendsFeed() {
    if (!state.account) return;
    try {
      const payload = await api("/social/friends-feed?after=0");
      renderMessages($("#friendsMessages"), payload.messages || []);
    } catch (error) {
      toast("Could not load friends chat", error.message, true);
    }
  }

  async function loadGlobal() {
    if (!state.account) return;
    try {
      const payload = await api("/social/global?after=0");
      renderMessages($("#globalMessages"), payload.messages || []);
    } catch (error) {
      toast("Could not load community chat", error.message, true);
    }
  }

  async function sendFeed(path, message, reload) {
    await api(path, { method: "POST", body: { message } });
    await reload();
  }

  async function generateMinecraftCode() {
    const button = $("#generateCode");
    button.disabled = true;
    button.textContent = "Generating…";
    try {
      const payload = await api("/auth/minecraft-code", { method: "POST", body: {} });
      $("#loginCommand").textContent = payload.command;
      $("#codeResult").classList.remove("hidden");
      state.codeExpiresAt = payload.expiresAt;
      updateCodeTimer();
      clearInterval(state.codeTimer);
      state.codeTimer = setInterval(updateCodeTimer, 1000);
      toast("Minecraft code ready", "Join with the same username, then run the command shown.");
    } catch (error) {
      toast("Could not generate code", error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = "Generate a new Minecraft login code";
    }
  }

  function updateCodeTimer() {
    const remaining = Math.max(0, state.codeExpiresAt - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    $("#codeTimer").textContent = remaining ? `Expires in ${minutes}:${String(seconds).padStart(2, "0")}` : "Expired — generate a new code";
    if (!remaining) clearInterval(state.codeTimer);
  }

  async function refreshEverything() {
    if (!state.account) return;
    const tasks = [loadFriends(true)];
    if (state.panel === "people") tasks.push(loadPeople(true));
    if (state.panel === "messages" && state.dmTarget) tasks.push(loadDm());
    if (state.panel === "friends-feed") tasks.push(loadFriendsFeed());
    if (state.panel === "global") tasks.push(loadGlobal());
    await Promise.allSettled(tasks);
  }

  function startPolling() {
    stopPolling();
    state.polling = setInterval(() => {
      if (document.hidden || !state.account) return;
      if (state.panel === "messages" && state.dmTarget) loadDm();
      else if (state.panel === "friends-feed") loadFriendsFeed();
      else if (state.panel === "global") loadGlobal();
      if (["friends", "messages"].includes(state.panel)) loadFriends(true);
    }, 3500);
  }

  function stopPolling() {
    clearInterval(state.polling);
    state.polling = 0;
  }

  function setupInstallPrompt() {
    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    const dismissed = localStorage.getItem("selahmc.install.dismissed") === "1";
    if (!standalone && !dismissed) $("#installBanner").classList.remove("hidden");
    window.addEventListener("beforeinstallprompt", event => {
      event.preventDefault();
      state.installPrompt = event;
      if (!dismissed) $("#installBanner").classList.remove("hidden");
    });
    $("#installButton").addEventListener("click", async () => {
      if (state.installPrompt) {
        state.installPrompt.prompt();
        await state.installPrompt.userChoice;
        state.installPrompt = null;
        $("#installBanner").classList.add("hidden");
      } else {
        toast("Install SelahMC", "Open your browser menu and choose Install app or Add to Home screen.");
      }
    });
    $("#dismissInstall").addEventListener("click", () => {
      localStorage.setItem("selahmc.install.dismissed", "1");
      $("#installBanner").classList.add("hidden");
    });
  }

  function wireEvents() {
    $$('[data-auth-mode]').forEach(button => button.addEventListener("click", () => switchAuth(button.dataset.authMode)));

    $("#loginForm").addEventListener("submit", async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const submit = event.currentTarget.querySelector("button[type=submit]");
      submit.disabled = true;
      try {
        const payload = await api("/auth/login", { method: "POST", body: { username: form.get("username"), password: form.get("password") } });
        event.currentTarget.reset();
        showApp(payload);
      } catch (error) { authError(error.message); }
      finally { submit.disabled = false; }
    });

    $("#signupForm").addEventListener("submit", async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      if (form.get("password") !== form.get("confirm")) { authError("Passwords do not match."); return; }
      const submit = event.currentTarget.querySelector("button[type=submit]");
      submit.disabled = true;
      try {
        const payload = await api("/auth/signup", { method: "POST", body: { username: form.get("username"), password: form.get("password") } });
        event.currentTarget.reset();
        showApp(payload);
        switchPanel("minecraft");
        toast("Account created", "Generate your one-time Minecraft login code next.");
      } catch (error) { authError(error.message); }
      finally { submit.disabled = false; }
    });

    $("#logoutButton").addEventListener("click", async () => {
      try { await api("/auth/logout", { method: "POST", body: {} }); } catch {}
      showAuth("login");
      toast("Logged out", "Your website session has ended.");
    });

    $("#navigation").addEventListener("click", event => {
      const button = event.target.closest("[data-panel]");
      if (button) switchPanel(button.dataset.panel);
    });
    document.addEventListener("click", event => {
      const jump = event.target.closest("[data-jump]");
      if (jump) switchPanel(jump.dataset.jump);
      const action = event.target.closest("[data-person-action]");
      if (action) personAction(action.dataset.personAction, action.dataset.username);
      const dm = event.target.closest("[data-dm-user]");
      if (dm) selectDm(dm.dataset.dmUser);
    });

    let searchTimer;
    $("#peopleSearch").addEventListener("input", event => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.peopleQuery = event.target.value.trim();
        loadPeople(true);
      }, 250);
    });
    $("#loadMorePeople").addEventListener("click", () => loadPeople(false));
    $("#friendSearch").addEventListener("input", renderConversationFriends);
    $("#refreshButton").addEventListener("click", refreshEverything);

    $("#dmForm").addEventListener("submit", async event => {
      event.preventDefault();
      const input = $("#dmInput");
      const message = input.value.trim();
      if (!message) return;
      input.value = "";
      try { await sendDm(message); }
      catch (error) { input.value = message; toast("Message not sent", error.message, true); }
    });
    $("#friendsForm").addEventListener("submit", async event => {
      event.preventDefault();
      const input = $("#friendsInput");
      const message = input.value.trim();
      if (!message) return;
      input.value = "";
      try { await sendFeed("/social/friends-feed", message, loadFriendsFeed); }
      catch (error) { input.value = message; toast("Message not sent", error.message, true); }
    });
    $("#globalForm").addEventListener("submit", async event => {
      event.preventDefault();
      const input = $("#globalInput");
      const message = input.value.trim();
      if (!message) return;
      input.value = "";
      try { await sendFeed("/social/global", message, loadGlobal); }
      catch (error) { input.value = message; toast("Message not sent", error.message, true); }
    });

    $("#generateCode").addEventListener("click", generateMinecraftCode);
    $("#copyCommand").addEventListener("click", async () => {
      const command = $("#loginCommand").textContent;
      try { await navigator.clipboard.writeText(command); toast("Copied", command); }
      catch { toast("Copy this command", command); }
    });
  }

  async function init() {
    setupInstallPrompt();
    wireEvents();
    try {
      const payload = await api("/auth/me");
      showApp(payload);
    } catch {
      const mode = new URL(location.href).searchParams.get("mode") === "signup" ? "signup" : "login";
      showAuth(mode);
    }
  }

  init();
})();
