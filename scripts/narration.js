/* ==========================================================================
   Ordy's Narration Helper
   Shows narration text on every connected player's screen.

   How to use (GM only):
     /narrate The gates groan open.            -> one line
     /narrate First line. | Second line.       -> several lines, one after another
     /narrate                                  -> opens a box to type into
     /narrate-stop                             -> clears the screen right away

   From a macro:
     game.modules.get("ordelia-narration").api.narrate("Your text here");
     game.modules.get("ordelia-narration").api.open();
     game.modules.get("ordelia-narration").api.stop();
   ========================================================================== */

const MODULE_ID = "ordelia-narration";

// Every module gets one socket "channel", always named module.<module id>.
const SOCKET_NAME = `module.${MODULE_ID}`;

// Timing, in milliseconds. Change these to taste.
const FADE_MS = 800;        // how long text takes to fade in and out
const TYPE_MS = 35;         // typewriter: delay between letters
const EXTRA_MS_PER_CHAR = 30; // long lines stay on screen a little longer


/* --------------------------------------------------------------------------
   1. SETUP - runs when Foundry starts
   -------------------------------------------------------------------------- */

// "init" fires early, before the world has loaded. Settings go here.
Hooks.once("init", () => {
  registerSettings();

  // An optional hotkey. No key is assigned by default: pick one under
  // Configure Controls if you want it.
  game.keybindings.register(MODULE_ID, "open", {
    name: "Open narration box",
    hint: "Opens the box where the GM types narration.",
    editable: [],
    restricted: true, // GM only
    onDown: () => {
      openDialog();
      return true;
    }
  });

  // Make the functions reachable from macros.
  game.modules.get(MODULE_ID).api = { narrate, open: openDialog, stop };
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
  const match = text.match(/^\/narrate(-stop)?(?:\s+([\s\S]+))?$/i);
  if (!match) return; // not our command, let Foundry carry on as normal

  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM can narrate.");
    return false;
  }

  const isStop = Boolean(match[1]);
  const narration = match[2];

  if (isStop) stop();
  else if (narration) narrate(narration);
  else openDialog();
  return false;
});


/* --------------------------------------------------------------------------
   2. SETTINGS - appear under Configure Settings > Ordy's Narration Helper
   -------------------------------------------------------------------------- */

function registerSettings() {
  game.settings.register(MODULE_ID, "position", {
    name: "Text position",
    hint: "Where on the screen the narration appears.",
    scope: "world",
    config: true,
    type: String,
    choices: { top: "Top", center: "Center", bottom: "Bottom" },
    default: "center"
  });

  game.settings.register(MODULE_ID, "textSize", {
    name: "Text size",
    scope: "world",
    config: true,
    type: String,
    choices: { small: "Small", medium: "Medium", large: "Large" },
    default: "medium"
  });

  game.settings.register(MODULE_ID, "dim", {
    name: "Darken the screen",
    hint: "Fades the map and sheets behind the text so it stands out.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "typewriter", {
    name: "Typewriter effect",
    hint: "Reveal the text letter by letter. Turn off to fade the whole line in at once.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "holdSeconds", {
    name: "Seconds each line stays on screen",
    hint: "Long lines automatically stay a little longer than this.",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 1, max: 15, step: 0.5 },
    default: 3
  });

  game.settings.register(MODULE_ID, "postToChat", {
    name: "Also post to chat",
    hint: "Keeps a copy of each narration in the chat log.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
}

// Collect the current settings into one object. The GM's browser sends this
// along with the text, so every player sees it the same way.
function readOptions() {
  return {
    position: game.settings.get(MODULE_ID, "position"),
    textSize: game.settings.get(MODULE_ID, "textSize"),
    dim: game.settings.get(MODULE_ID, "dim"),
    typewriter: game.settings.get(MODULE_ID, "typewriter"),
    holdSeconds: game.settings.get(MODULE_ID, "holdSeconds")
  };
}


/* --------------------------------------------------------------------------
   3. SENDING - what the GM's browser does
   -------------------------------------------------------------------------- */

function narrate(text) {
  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM can narrate.");
    return;
  }

  // Split into separate lines on line breaks or the | character.
  const lines = String(text ?? "")
    .split(/\n|\|/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return;

  const message = { action: "show", lines, options: readOptions(), sender: game.user.id };

  // The sender does NOT receive its own socket message, so show it here
  // ourselves, then send it to everyone else.
  showNarration(message);
  game.socket.emit(SOCKET_NAME, message);

  if (game.settings.get(MODULE_ID, "postToChat")) {
    const content = lines.map((line) => `<p><em>${escapeHtml(line)}</em></p>`).join("");
    ChatMessage.create({ content, speaker: { alias: "Narrator" } });
  }
}

function stop() {
  if (!game.user.isGM) return;
  clearNarration();
  game.socket.emit(SOCKET_NAME, { action: "stop", sender: game.user.id });
}

async function openDialog() {
  if (!game.user.isGM) return;
  let text = null;
  try {
    text = await foundry.applications.api.DialogV2.prompt({
      window: { title: "Narration" },
      content: `
        <p>Each line is shown on its own, one after another.</p>
        <textarea name="narration" rows="6" style="width: 100%; resize: vertical;" autofocus></textarea>
      `,
      ok: {
        label: "Narrate",
        callback: (event, button) => button.form.elements.narration.value
      },
      rejectClose: false
    });
  } catch (error) {
    return; // the box was closed without sending
  }
  if (text) narrate(text);
}


/* --------------------------------------------------------------------------
   4. RECEIVING - what every other browser does when the GM narrates
   -------------------------------------------------------------------------- */

function handleSocketMessage(message) {
  // Ignore anything that didn't come from a GM.
  const sender = game.users.get(message?.sender);
  if (!sender?.isGM) return;

  if (message.action === "show") showNarration(message);
  else if (message.action === "stop") clearNarration();
}


/* --------------------------------------------------------------------------
   5. DISPLAY - putting the text on screen (runs on every browser)
   -------------------------------------------------------------------------- */

const queue = [];     // lines waiting to be shown
let playing = false;  // is a line on screen right now?
let runId = 0;        // goes up by one on every stop, so old timers know to quit
let overlay = null;   // the full-screen element holding the text

function showNarration(message) {
  for (const line of message.lines) queue.push({ line, options: message.options });
  if (!playing) playQueue();
}

function clearNarration() {
  runId += 1;
  queue.length = 0;
  playing = false;
  overlay?.classList.remove("active");
}

async function playQueue() {
  playing = true;
  const myRun = runId;
  const element = getOverlay();

  while (queue.length > 0 && myRun === runId) {
    const { line, options } = queue.shift();
    await playLine(element, line, options, myRun);
  }

  // Only tidy up if nobody pressed stop in the meantime.
  if (myRun === runId) {
    element.classList.remove("active");
    playing = false;
  }
}

async function playLine(element, line, options, myRun) {
  const stopped = () => myRun !== runId;
  const textEl = element.querySelector(".on-text");
  const shownEl = element.querySelector(".on-shown");
  const hiddenEl = element.querySelector(".on-hidden");

  // Apply the look the GM chose.
  element.dataset.position = options.position;
  element.dataset.size = options.textSize;
  element.classList.toggle("dim", Boolean(options.dim));
  element.classList.add("active");

  if (options.typewriter) {
    // The whole line is in place from the start (so it never jumps around),
    // but the part not yet "typed" is invisible.
    const letters = Array.from(line);
    shownEl.textContent = "";
    hiddenEl.textContent = line;
    textEl.classList.add("visible");

    for (let i = 0; i < letters.length; i++) {
      shownEl.textContent = letters.slice(0, i + 1).join("");
      hiddenEl.textContent = letters.slice(i + 1).join("");
      await wait(TYPE_MS * pauseFor(letters[i]));
      if (stopped()) return;
    }
  } else {
    shownEl.textContent = line;
    hiddenEl.textContent = "";
    textEl.classList.add("visible");
    await wait(FADE_MS);
    if (stopped()) return;
  }

  // Leave it up long enough to read.
  await wait(options.holdSeconds * 1000 + line.length * EXTRA_MS_PER_CHAR);
  if (stopped()) return;

  // Fade the line out before the next one.
  textEl.classList.remove("visible");
  await wait(FADE_MS);
}

// Build the overlay the first time it's needed, then reuse it.
function getOverlay() {
  if (overlay?.isConnected) return overlay;

  overlay = document.createElement("div");
  overlay.id = "ordelia-narration";
  overlay.style.setProperty("--on-fade", `${FADE_MS}ms`);

  const text = document.createElement("p");
  text.className = "on-text";

  const shown = document.createElement("span");
  shown.className = "on-shown";
  const hidden = document.createElement("span");
  hidden.className = "on-hidden";

  text.append(shown, hidden);
  overlay.append(text);
  document.body.append(overlay);

  // Reading this forces the browser to draw the hidden state first, so the
  // very first fade-in animates instead of popping in.
  void overlay.offsetWidth;
  return overlay;
}


/* --------------------------------------------------------------------------
   6. SMALL HELPERS
   -------------------------------------------------------------------------- */

// Pause for a number of milliseconds.
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Typewriter rhythm: linger after punctuation.
function pauseFor(letter) {
  if (/[.!?…]/.test(letter)) return 10;
  if (/[,;:—–]/.test(letter)) return 5;
  return 1;
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
