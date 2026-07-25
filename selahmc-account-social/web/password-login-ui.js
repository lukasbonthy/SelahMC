(() => {
  const PASSWORD_GUIDANCE = "Join with this exact Minecraft username, then type /login followed by the password you created on this website.";

  function repairVisibleCopy(root = document) {
    const replacements = [
      ["Generate your one-time Minecraft login code next.", PASSWORD_GUIDANCE],
      ["Generate a one-time code after you join.", "Join with the exact same Minecraft username."],
      ["Use /login 12345678 and start playing.", "Use /login <website-password> and start playing."],
      ["generate a Minecraft code", "use your website password"],
      ["generate a code", "use your website password"],
      ["temporary code", "website password"],
      ["one-time code", "website password"],
    ];

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      let value = node.nodeValue || "";
      let next = value;
      for (const [from, to] of replacements) next = next.replaceAll(from, to);
      if (next !== value) node.nodeValue = next;
    }
  }

  function disableLegacyCodeUi() {
    const button = document.getElementById("generateCode");
    const result = document.getElementById("codeResult");
    if (button) {
      button.hidden = true;
      button.disabled = true;
      button.setAttribute("aria-hidden", "true");
    }
    if (result) {
      result.hidden = true;
      result.classList.add("hidden");
      result.setAttribute("aria-hidden", "true");
    }
  }

  function init() {
    disableLegacyCodeUi();
    repairVisibleCopy();
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) repairVisibleCopy(node);
          else if (node.nodeType === Node.TEXT_NODE) repairVisibleCopy(node.parentNode || document);
        }
      }
      disableLegacyCodeUi();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
