// The Origami plugin API, loaded before a plugin's own script. Plugins run in
// a sandboxed frame with no network and no access to the app; everything goes
// through these calls, which Origami answers if the reader allowed it.
(function () {
  "use strict";
  let next = 1;
  const waiting = new Map();
  const handlers = new Map();
  const listeners = { theme: [], note: [] };
  function post(message) {
    window.parent.postMessage(message, "*");
  }
  function call(method, params) {
    const id = next++;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      post({ type: "request", id, method, params: params || {} });
    });
  }
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const m = event.data || {};
    if (m.type === "response" && waiting.has(m.id)) {
      const w = waiting.get(m.id);
      waiting.delete(m.id);
      if (m.error) w.reject(new Error(m.error));
      else w.resolve(m.result);
    } else if (m.type === "command" && handlers.has(m.command)) {
      Promise.resolve()
        .then(() => handlers.get(m.command)(m.context || {}))
        .catch((err) => call("ui.notify", { text: String((err && err.message) || err) }));
    } else if (m.type === "theme") {
      document.documentElement.dataset.theme = m.dark ? "dark" : "light";
      listeners.theme.forEach((fn) => fn(Boolean(m.dark)));
    } else if (m.type === "note") {
      listeners.note.forEach((fn) => fn(m.id || null));
    }
  });
  // A block inside a note runs the plugin with ?block=<type>.
  const params = new URLSearchParams(location.search);
  const blockType = params.get("block");
  window.origami = Object.freeze({
    version: 1,
    blocks: {
      // Adds a block type to the note's / menu; each block runs the plugin
      // again in its own frame, with origami.block set.
      register(type, label) {
        post({ type: "block", id: String(type), label: String(label) });
      },
    },
    block: blockType
      ? {
          type: blockType,
          // The block's own saved data (any JSON, up to 64 KB), or null.
          get: () => call("block.get"),
          save: (data) => call("block.save", { data }),
          // The block's height in pixels, as shown in the note.
          resize: (height) => post({ type: "resize", height: Number(height) }),
        }
      : null,
    commands: {
      // Adds a command to Search (Ctrl+K) and the note's / menu.
      register(id, label, run) {
        handlers.set(String(id), run);
        post({ type: "command", id: String(id), label: String(label) });
      },
    },
    notes: {
      list: () => call("notes.list"),
      get: (id) => call("notes.get", { id }),
      current: () => call("notes.current"),
      create: (title, html) => call("notes.create", { title, html }),
      append: (id, html) => call("notes.append", { id, html }),
      replace: (id, html) => call("notes.replace", { id, html }),
      // Called with the id of the note that opens (or null when none is open).
      onOpen: (fn) => listeners.note.push(fn),
    },
    editor: {
      insert: (html) => call("editor.insert", { html }),
      selection: () => call("editor.selection"),
    },
    cards: {
      list: () => call("cards.list"),
      create: (front, back) => call("cards.create", { front, back }),
    },
    ui: {
      notify: (text) => call("ui.notify", { text }),
      close: () => call("ui.close"),
      onTheme: (fn) => listeners.theme.push(fn),
    },
    storage: {
      get: (key) => call("storage.get", { key }),
      set: (key, value) => call("storage.set", { key, value }),
    },
  });
  window.addEventListener("load", () => post({ type: "ready" }));
})();
