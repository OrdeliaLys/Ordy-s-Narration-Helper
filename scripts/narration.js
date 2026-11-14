/* ==========================================================================
   Ordy's Narration Helper
   Shows narration text on every connected player's screen.

   This is the main file. It talks to Foundry (settings, chat, sockets) and
   hands the actual drawing to display.js and the GM window to panel.js.

   How to use (GM only):
     /narrate                                   -> opens the narration window
     /narrate The gates groan open.             -> one line, default look
     /narrate First line. | Second line.        -> several lines, one after another
     /narrate [gauntlight] The light pulses.    -> one line in a chosen theme
     /narrate-next                              -> finish typing / go to next line
     /narrate-stop                              -> clear the screen right away

   From a macro:
     const narration = game.modules.get("ordelia-narration").api;
     narration.toggle();                               // open or close the window
     narration.narrate("Your text here");
     narration.narrate("Your text", { theme: "dread", position: "bottom" });
     narration.next();
     narration.stop();
   ========================================================================== */

import { THEMES, themeChoices, isTheme } from "./themes.js";
import { POSITIONS, SIZES, EFFECTS, SPEEDS, FALLBACK, normalizeOptions } from "./options.js";
import { showNarration, clearNarration, currentLine, finishReveal, advanceLine } from "./display.js";
import { createPanel } from "./panel.js";

const MODULE_ID = "ordelia-narration";

// Every module gets one socket "channel", always named module.<module id>.
const SOCKET_NAME = `module.${MODULE_ID}`;

let panel = null; // the narration window, created the first time it is opened


/* --------------------------------------------------------------------------
   1. SETUP - runs when Foundry starts
   -------------------------------------------------------------------------- */

// "init" fires early, before the world has loaded. Settings go here.
Hooks.once("init", () => {
  registerSettings();

  // An optional hotkey. No key is assigned by default: pick one under
  // Configure Controls if you want it.
  game.keybindings.register(MODULE_ID, "open", {
    name: "Open or close the narration window",
    editable: [],
    restricted: true, // GM only
    onDown: () => {
      togglePanel();
      return true;
    }
  });

  // Make the functions reachable from macros.
  game.modules.get(MODULE_ID).api = {
    narrate,
    preview,
    next,
    stop,
    open: openPanel,
    close: () => panel?.close(),
    toggle: togglePanel,
    themes: THEMES.map((theme) => theme.id)
  };
});

// "ready" fires once everything has loaded. Start listening for messages
// from the GM's browser.
Hooks.once("ready", () => {
  game.socket.on(SOCKET_NAME, handleSocketMessage);
});

// Fires whenever someone sends a chat message. Returning false tells Foundry
// "I handled this, don't post it to chat".
Hooks.on("chatMessage", (chatLog, message) => {
  const text = toPlainText(message);
  const match = text.match(/^\/narrate(?:-(stop|next))?(?:\s+([\s\S]+))?$/i);
  if (!match) return; // not our command, let Foundry carry on as normal

  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM can narrate.");
    return false;
  }

  const command = match[1]?.toLowerCase();
  let narration = match[2];

  if (command === "stop") stop();
  else if (command === "next") next();
  else if (narration) {
    // Optional theme in square brackets at the start: /narrate [dread] text
    const overrides = {};
    const themed = narration.match(/^\[([a-z]+)\]\s*([\s\S]*)$/i);
    if (themed && isTheme(themed[1].toLowerCase())) {
      overrides.theme = themed[1].toLowerCase();
      narration = themed[2];
    }
    narrate(narration, overrides);
  } else openPanel();
  return false;
});

// Adds a feather button to the token tools on the left of the screen.
// Foundry changed how this list is shaped in version 13, so both shapes are
// handled, and any surprise is ignored so it can never break the rest.
Hooks.on("getSceneControlButtons", (controls) => {
  try {
    if (!game.user?.isGM) return;
    const tool = {
      name: MODULE_ID,
      title: "Narration window",
      icon: "fa-solid fa-feather",
      button: true,
      visible: true
    };
    if (Array.isArray(controls)) {
      const tokenTools = controls.find((control) => control.name === "token");
      tokenTools?.tools.push({ ...tool, onClick: () => togglePanel() });
    } else {
      const tokenTools = controls.tokens ?? controls.token;
      if (!tokenTools?.tools) return;
      tokenTools.tools[MODULE_ID] = {
        ...tool,
        order: Object.keys(tokenTools.tools).length,
        onChange: () => togglePanel()
      };
    }
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not add the toolbar button.`, error);
  }
});


/* --------------------------------------------------------------------------
   2. SETTINGS - appear under Configure Settings > Ordy's Narration Helper
   -------------------------------------------------------------------------- */

function registerSettings() {
  // ---- World settings: the GM sets these, they apply to everyone ----
  // These are the DEFAULTS. The narration window can override them per line.

  game.settings.register(MODULE_ID, "theme", {
    name: "Default theme",
    hint: "The look used by /narrate and as the starting choice in the narration window.",
    scope: "world",
    config: true,
    type: String,
    choices: themeChoices(),
    default: FALLBACK.theme
  });

  game.settings.register(MODULE_ID, "position", {
    name: "Default text position",
    scope: "world",
    config: true,
    type: String,
    choices: POSITIONS,
    default: FALLBACK.position
  });

  game.settings.register(MODULE_ID, "textSize", {
    name: "Default text size",
    scope: "world",
    config: true,
    type: String,
    choices: SIZES,
    default: FALLBACK.textSize
  });

  game.settings.register(MODULE_ID, "effect", {
    name: "Default text effect",
    hint: "How each line appears: letter by letter, word by word, or all at once.",
    scope: "world",
    config: true,
    type: String,
    choices: EFFECTS,
    default: FALLBACK.effect
  });

  game.settings.register(MODULE_ID, "speed", {
    name: "Default typing speed",
    scope: "world",
    config: true,
    type: String,
    choices: SPEEDS,
    default: FALLBACK.speed
  });

  game.settings.register(MODULE_ID, "dim", {
    name: "Darken the screen",
    hint: "Fades the map and sheets behind the text. Each theme has its own backdrop.",
    scope: "world",
    config: true,
    type: Boolean,
    default: FALLBACK.dim
  });

  game.settings.register(MODULE_ID, "holdSeconds", {
    name: "Seconds each line stays on screen",
    hint: "Long lines automatically stay a little longer than this.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 1, max: 15, step: 0.5 },
    default: FALLBACK.holdSeconds
  });

  game.settings.register(MODULE_ID, "manual", {
    name: "Wait for Next by default",
    hint: "Each line stays until you press Next (or type /narrate-next) instead of timing out.",
    scope: "world",
    config: true,
    type: Boolean,
    default: FALLBACK.manual
  });

  game.settings.register(MODULE_ID, "postToChat", {
    name: "Also post to chat",
    hint: "Keeps a copy of each narration in the chat log. Narration sent to chosen players is whispered to them.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "narratorName", {
    name: "Narrator name in chat",
    hint: "The speaker name used when narration is posted to chat.",
    scope: "world",
    config: true,
    type: String,
    default: "Narrator"
  });

  // ---- Client settings: each person sets these for their own screen ----

  game.settings.register(MODULE_ID, "reduceMotion", {
    name: "Reduce motion (my screen only)",
    hint: "Shows narration with a simple fade: no typing effect, flicker or drifting.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "gmNoDim", {
    name: "GM: don't darken my screen",
    hint: "As GM you still see the text, but your map stays fully visible so you can keep working.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
}

// The default look, read from the world settings.
function defaultOptions() {
  const read = (key) => game.settings.get(MODULE_ID, key);
  return normalizeOptions({
    theme: read("theme"),
    position: read("position"),
    textSize: read("textSize"),
    effect: read("effect"),
    speed: read("speed"),
    dim: read("dim"),
    holdSeconds: read("holdSeconds"),
    manual: read("manual")
  });
}

// This browser's own preferences.
function localPreferences() {
  return {
    reduceMotion: game.settings.get(MODULE_ID, "reduceMotion"),
    noDim: game.user.isGM && game.settings.get(MODULE_ID, "gmNoDim")
  };
}


/* --------------------------------------------------------------------------
   3. SENDING - what the GM's browser does
   -------------------------------------------------------------------------- */

// text:      the narration. Line breaks or | split it into separate lines.
// overrides: any options that should differ from the defaults, e.g. { theme: "dread" }
// playerIds: user ids to show it to. Leave empty for everyone.
function narrate(text, overrides = {}, playerIds = []) {
  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM can narrate.");
    return;
  }
  const lines = splitLines(text);
  if (lines.length === 0) return;

  const options = normalizeOptions({ ...defaultOptions(), ...overrides });
  const to = Array.isArray(playerIds) && playerIds.length > 0 ? playerIds : null;
  const batch = newBatchId();
  const message = { action: "show", lines, options, to, batch, sender: game.user.id };

  // The sender does NOT receive its own socket message, so show it here
  // ourselves, then send it to everyone else.
  showNarration(lines, options, localPreferences(), batch);
  game.socket.emit(SOCKET_NAME, message);

  if (game.settings.get(MODULE_ID, "postToChat")) {
    const content = lines.map((line) => `<p><em>${escapeHtml(line)}</em></p>`).join("");
    const alias = game.settings.get(MODULE_ID, "narratorName") || "Narrator";
    ChatMessage.create({ content, speaker: { alias }, whisper: to ?? [] });
  }
}

// Show narration on the GM's own screen only, to try out a look.
function preview(text, overrides = {}) {
  if (!game.user.isGM) return;
  const lines = splitLines(text);
  if (lines.length === 0) return;
  clearNarration();
  const options = normalizeOptions({ ...defaultOptions(), ...overrides });
  showNarration(lines, options, localPreferences(), newBatchId());
}

// "Next": if the line on screen is still being typed, finish it at once.
// If it is already complete, take it away and move on.
// The message names the exact line, so every browser does the same thing
// even if one of them is running a little ahead or behind.
function next() {
  if (!game.user.isGM) return;
  const line = currentLine();
  if (!line) return;

  if (line.phase === "reveal") {
    finishReveal(line.key);
    game.socket.emit(SOCKET_NAME, { action: "reveal", key: line.key, sender: game.user.id });
  } else {
    advanceLine(line.key);
    game.socket.emit(SOCKET_NAME, { action: "advance", key: line.key, sender: game.user.id });
  }
}

function stop() {
  if (!game.user.isGM) return;
  clearNarration();
  game.socket.emit(SOCKET_NAME, { action: "stop", sender: game.user.id });
}

function openPanel() {
  if (!game.user.isGM) return;
  getPanel().open();
}

function togglePanel() {
  if (!game.user.isGM) return;
  getPanel().toggle();
}

function getPanel() {
  panel ??= createPanel({
    getDefaults: defaultOptions,
    getPlayers: () =>
      game.users
        .filter((user) => user.active && !user.isGM)
        .map((user) => ({ id: user.id, name: user.name })),
    onNarrate: narrate,
    onPreview: preview,
    onNext: next,
    onStop: stop
  });
  return panel;
}


/* --------------------------------------------------------------------------
   4. RECEIVING - what every other browser does when the GM narrates
   -------------------------------------------------------------------------- */

function handleSocketMessage(message) {
  // Ignore anything that didn't come from a GM.
  const sender = game.users.get(message?.sender);
  if (!sender?.isGM) return;

  if (message.action === "show") {
    // Narration for chosen players only: skip it if we aren't one of them.
    if (Array.isArray(message.to) && !message.to.includes(game.user.id)) return;
    if (!Array.isArray(message.lines)) return;
    showNarration(message.lines, message.options, localPreferences(), String(message.batch ?? "gm"));
  } else if (message.action === "reveal") finishReveal(String(message.key));
  else if (message.action === "advance") advanceLine(String(message.key));
  else if (message.action === "stop") clearNarration();
}


/* --------------------------------------------------------------------------
   5. SMALL HELPERS
   -------------------------------------------------------------------------- */

// A short random name for one group of lines, e.g. "m3k9x2a7".
function newBatchId() {
  return Math.random().toString(36).slice(2, 10);
}

// Split into separate lines on line breaks or the | character.
function splitLines(text) {
  return String(text ?? "")
    .split(/\n|\|/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// Newer Foundry versions hand chat text over as HTML (<p>like this</p>),
// older ones as plain text. This turns either into plain text.
function toPlainText(message) {
  const raw = String(message ?? "");
  if (!/^\s*<[a-z][^>]*>/i.test(raw)) return raw.trim();

  const withBreaks = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n");
  const doc = new DOMParser().parseFromString(withBreaks, "text/html");
  return doc.body.textContent.trim();
}

// Make text safe to put inside a chat message.
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
