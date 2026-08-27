(function(global) {
  "use strict";

  var armed = false;
  var history = [];
  var maxHistory = 40;
  var maxPayload = 12000;

  function describe(value) {
    try {
      if(value && typeof value.stack === "string") {
        return value.stack;
      }
      if(typeof value === "string") {
        return value;
      }
      if(value && typeof value === "object") {
        return JSON.stringify(value);
      }
      return String(value);
    }catch(ignore) {
      return "[unprintable value]";
    }
  }

  function clean(value) {
    return describe(value).replace(/[\r\n]+/g, "\\n").slice(0, maxPayload);
  }

  function post(kind, values) {
    var parts = [new Date().toISOString(), kind];
    for(var i = 0; i < values.length; ++i) {
      parts.push(clean(values[i]));
    }
    var body = parts.join(" | ").slice(0, maxPayload);
    try {
      global.fetch("/__selah_diag", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: body,
        keepalive: true
      }).catch(function() {});
    }catch(ignore) {}
  }

  function remember(method, args) {
    var values = [];
    for(var i = 0; i < args.length; ++i) {
      values.push(describe(args[i]));
    }
    var line = method + " | " + values.join(" ");
    history.push(clean(line));
    if(history.length > maxHistory) {
      history.shift();
    }

    if(line.indexOf("resources from EPKs") !== -1 ||
        line.indexOf("Reloading ResourceManager") !== -1) {
      if(!armed) {
        armed = true;
        post("console.context", [history.join(" || ")]);
      }
    }
    if(armed || method === "warn" || method === "error") {
      post("console." + method, values);
    }
  }

  ["log", "info", "warn", "error", "debug"].forEach(function(method) {
    var original = global.console && global.console[method];
    if(typeof original !== "function") {
      return;
    }
    global.console[method] = function() {
      remember(method, arguments);
      return original.apply(global.console, arguments);
    };
  });

  global.addEventListener("error", function(event) {
    post("window.error", [
      event.message || "unknown error",
      (event.filename || "unknown") + ":" + (event.lineno || 0) + ":" + (event.colno || 0),
      event.error || ""
    ]);
  });

  global.addEventListener("unhandledrejection", function(event) {
    post("unhandledrejection", [event.reason || "unknown rejection"]);
  });

  post("session.start", [
    global.navigator && global.navigator.userAgent || "unknown user agent",
    global.location && global.location.href || "unknown location"
  ]);
})(window);
