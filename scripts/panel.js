/* The narration window: a small draggable panel where the GM types narration
   and picks how it looks. It is plain HTML built here, not a Foundry sheet,
   so it stays on top of the narration and keeps working while text is showing. */

import { THEMES } from "./themes.js";
import { POSITIONS, SIZES, EFFECTS, SPEEDS, normalizeOptions } from "./options.js";

const STORAGE_KEY = "ordelia-narration.panel";

/* config = {
     getDefaults()  -> options from the world settings
     getPlayers()   -> [{ id, name }] of connected players
     getSaved()     -> [{ id, text, options }] saved narrations
     setSaved(list) -> stores the saved narrations
     onHotbar(entry) -> makes a macro-bar button for a saved narration
     onNarrate(text, options, playerIds), onPreview(text, options), onNext(), onStop()
   } */
export function createPanel(config) {
  let root = null;       // the panel element, built the first time it opens
  let parts = {};        // handy references to pieces of the panel
  const remembered = loadRemembered();
  let options = normalizeOptions({ ...config.getDefaults(), ...remembered.options });
  let audience = [];     // player ids; empty means everyone
  let draft = remembered.draft ?? "";
  let position = remembered.position ?? null;

  /* ---- Opening and closing ---- */

  function open() {
    if (!root) build();
    if (!root.isConnected) document.body.append(root);
    root.hidden = false;
    refresh();
    refreshSaved();
    placePanel();
    parts.text.focus();
  }

  function close() {
    if (root) root.hidden = true;
  }

  function toggle() {
    if (root && !root.hidden && root.isConnected) close();
    else open();
  }

  /* ---- Building the panel ---- */

  function build() {
    root = make("div", { id: "ordelia-narration-panel" });
    root.hidden = true;

    // Title bar (drag it to move the window)
    const title = make("div", { className: "onp-title" }, [
      make("span", { textContent: "Narration" }),
      button("×", "onp-close", close, "Close")
    ]);
    enableDragging(title);

    // Text box
    parts.text = make("textarea", {
      className: "onp-text",
      rows: 3,
      placeholder: "Type narration here. Each line is shown on its own."
    });
    parts.text.value = draft;
    parts.text.addEventListener("input", () => {
      draft = parts.text.value;
      remember();
    });
    parts.text.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        send();
      }
    });

    const hint = make("div", {
      className: "onp-hint",
      textContent: "Small heading above a line:  Chapter 8 :: The Decaying Gardens"
    });

    // Action buttons
    const actions = make("div", { className: "onp-actions" }, [
      button("Narrate", "onp-primary", send, "Show to players (Ctrl+Enter)"),
      button("Preview", "onp-action", preview, "Show only on your screen"),
      button("Next", "onp-action", () => config.onNext(), "Finish typing, or go to the next line"),
      button("Stop", "onp-action onp-stop", () => config.onStop(), "Clear the screen")
    ]);

    parts.status = make("div", { className: "onp-status" });

    // Saved narrations: one click sends them
    const savedHeader = make("div", { className: "onp-row" }, [
      make("span", { className: "onp-label", textContent: "Saved narrations" }),
      button("Save current", "onp-save", saveCurrent, "Save the text above, with the look chosen below")
    ]);
    parts.saved = make("div", { className: "onp-saved" });

    // Theme picker: one button per theme, grouped
    const themeArea = make("div", { className: "onp-themes" });
    parts.themeButtons = [];
    for (const group of [...new Set(THEMES.map((theme) => theme.group))]) {
      themeArea.append(make("div", { className: "onp-label", textContent: group }));
      const grid = make("div", { className: "onp-grid" });
      for (const theme of THEMES.filter((entry) => entry.group === group)) {
        const chip = button(theme.label, "onp-chip", () => setOption("theme", theme.id));
        chip.dataset.onTheme = theme.id; // lets themes.css colour the button
        chip.dataset.value = theme.id;
        parts.themeButtons.push(chip);
        grid.append(chip);
      }
      themeArea.append(grid);
    }

    // Option rows
    parts.segments = {};
    const optionRows = make("div", { className: "onp-options" }, [
      segmented("Effect", "effect", EFFECTS),
      segmented("Speed", "speed", SPEEDS),
      segmented("Position", "position", POSITIONS),
      segmented("Size", "textSize", SIZES)
    ]);

    // Darken + timing
    parts.dim = button("Darken screen", "onp-toggle", () => setOption("dim", !options.dim));
    parts.manual = button("Wait for Next", "onp-toggle", () => setOption("manual", !options.manual));
    parts.holdValue = make("span", { className: "onp-hold-value" });
    parts.holdMinus = button("−", "onp-step", () => changeHold(-0.5), "Shorter");
    parts.holdPlus = button("+", "onp-step", () => changeHold(0.5), "Longer");
    const timing = make("div", { className: "onp-row" }, [
      parts.dim,
      parts.manual,
      make("span", { className: "onp-hold" }, [parts.holdMinus, parts.holdValue, parts.holdPlus])
    ]);

    // Who sees it
    parts.audience = make("div", { className: "onp-audience" });

    root.append(
      title,
      make("div", { className: "onp-body" }, [
        parts.text,
        hint,
        actions,
        parts.status,
        savedHeader,
        parts.saved,
        themeArea,
        optionRows,
        timing,
        make("div", { className: "onp-label", textContent: "Shown to" }),
        parts.audience
      ])
    );

    // Keep typing in the window from triggering Foundry's keyboard shortcuts.
    root.addEventListener("keydown", (event) => event.stopPropagation());
  }

  // A row of buttons where exactly one is selected, e.g. Top / Center / Bottom.
  function segmented(label, key, choices) {
    const buttons = Object.entries(choices).map(([value, text]) => {
      const choice = button(text, "onp-seg", () => setOption(key, value));
      choice.dataset.value = value;
      return choice;
    });
    parts.segments[key] = buttons;
    return make("div", { className: "onp-row" }, [
      make("span", { className: "onp-row-label", textContent: label }),
      make("span", { className: "onp-seg-group" }, buttons)
    ]);
  }

  /* ---- Keeping the panel in step with the chosen options ---- */

  function setOption(key, value) {
    options = normalizeOptions({ ...options, [key]: value });
    remember();
    refresh();
  }

  function changeHold(amount) {
    const next = Math.min(Math.max(options.holdSeconds + amount, 1), 15);
    setOption("holdSeconds", next);
  }

  function refresh() {
    if (!root) return;
    for (const chip of parts.themeButtons) press(chip, chip.dataset.value === options.theme);
    for (const [key, buttons] of Object.entries(parts.segments)) {
      for (const choice of buttons) press(choice, choice.dataset.value === options[key]);
    }
    press(parts.dim, options.dim);
    press(parts.manual, options.manual);
    parts.holdValue.textContent = options.manual ? "until Next" : `stays ${options.holdSeconds}s`;
    parts.holdMinus.disabled = options.manual;
    parts.holdPlus.disabled = options.manual;
    refreshAudience();
  }

  function refreshAudience() {
    const players = config.getPlayers();
    // Forget chosen players who have left.
    audience = audience.filter((id) => players.some((player) => player.id === id));

    const everyone = button("Everyone", "onp-seg", () => {
      audience = [];
      refreshAudience();
    });
    press(everyone, audience.length === 0);

    const chips = players.map((player) => {
      const chip = button(player.name, "onp-seg", () => {
        audience = audience.includes(player.id)
          ? audience.filter((id) => id !== player.id)
          : [...audience, player.id];
        refreshAudience();
      });
      press(chip, audience.includes(player.id));
      return chip;
    });

    parts.audience.replaceChildren(everyone, ...chips);
  }

  /* ---- Saved narrations ---- */

  // Draw the list. Each row is: [the narration, click to send] [edit] [macro bar] [remove]
  function refreshSaved() {
    if (!root) return;
    const entries = config.getSaved();

    if (entries.length === 0) {
      parts.saved.replaceChildren(
        make("div", { className: "onp-hint", textContent: "Nothing saved yet. Type a line and press Save current." })
      );
      return;
    }

    const rows = entries.map((entry) => {
      const look = normalizeOptions({ ...config.getDefaults(), ...entry.options });
      const label = entry.text.replace(/\s*::\s*/g, " · ").replace(/\s*[\n|]\s*/g, " / ");

      const sendButton = button(label, "onp-saved-send", () => {
        config.onNarrate(entry.text, { ...entry.options }, [...audience]);
        say(`Sent: ${label}`);
      }, `Send now: ${entry.text}`);
      sendButton.dataset.onTheme = look.theme; // colours the button like its theme

      const editButton = button("✎", "onp-mini", () => {
        parts.text.value = entry.text;
        draft = entry.text;
        options = look;
        remember();
        refresh();
        parts.text.focus();
        say("Loaded into the text box, with its look.");
      }, "Load into the text box to change it");

      const barButton = button("⊞", "onp-mini", async () => {
        try {
          const name = await config.onHotbar(entry);
          say(`Added to your macro bar: ${name}`);
        } catch (error) {
          console.error(error);
          say("Couldn't add it to the macro bar.");
        }
      }, "Add a one-click button to your macro bar");

      const removeButton = button("×", "onp-mini", async () => {
        const stored = await storeSaved(config.getSaved().filter((other) => other.id !== entry.id));
        if (stored) say("Removed from saved.");
      }, "Remove");

      return make("div", { className: "onp-saved-row" }, [sendButton, editButton, barButton, removeButton]);
    });

    parts.saved.replaceChildren(...rows);
  }

  async function saveCurrent() {
    const text = parts.text.value.trim();
    if (!text) return say("Type the narration to save first.");

    // Saving the same text again replaces the old entry (so you can change its look).
    const others = config.getSaved().filter((entry) => entry.text !== text);
    const entry = { id: Math.random().toString(36).slice(2, 10), text, options: { ...options } };
    const stored = await storeSaved([...others, entry]);
    if (stored) say("Saved. Click it in the list to send it any time.");
  }

  async function storeSaved(list) {
    try {
      await config.setSaved(list);
      refreshSaved();
      placePanel();
      return true;
    } catch (error) {
      console.error(error);
      say("Couldn't store the saved narrations.");
      return false;
    }
  }

  /* ---- Actions ---- */

  function send() {
    const text = parts.text.value.trim();
    if (!text) return say("Type some narration first.");
    config.onNarrate(text, { ...options }, [...audience]);
    say(audience.length === 0 ? "Sent to everyone." : `Sent to ${audience.length} chosen player(s).`);
    parts.text.value = "";
    draft = "";
    remember();
    parts.text.focus();
  }

  function preview() {
    const text = parts.text.value.trim();
    if (!text) return say("Type some narration first.");
    config.onPreview(text, { ...options });
    say("Preview: only you can see this.");
  }

  function say(message) {
    parts.status.textContent = message;
  }

  /* ---- Moving the window ---- */

  function enableDragging(handle) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      const box = root.getBoundingClientRect();
      const offsetX = event.clientX - box.left;
      const offsetY = event.clientY - box.top;

      const move = (moveEvent) => {
        position = { left: moveEvent.clientX - offsetX, top: moveEvent.clientY - offsetY };
        placePanel();
      };
      const drop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", drop);
        remember();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", drop);
      event.preventDefault();
    });
  }

  // Put the panel at its remembered spot, nudged back inside the screen if needed.
  function placePanel() {
    const box = root.getBoundingClientRect();
    const width = Math.ceil(box.width) || 380;
    const height = Math.ceil(box.height) || 500;
    const wanted = position ?? { left: window.innerWidth - width - 330, top: 70 };
    const left = Math.min(Math.max(wanted.left, 0), Math.max(window.innerWidth - width, 0));
    const top = Math.min(Math.max(wanted.top, 0), Math.max(window.innerHeight - height, 0));
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
  }

  /* ---- Remembering choices between sessions (in this browser) ---- */

  function remember() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ options, draft, position }));
    } catch (error) {
      // Storage unavailable: the panel still works, it just won't remember.
    }
  }

  function loadRemembered() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
    } catch (error) {
      return {};
    }
  }

  return { open, close, toggle };
}

/* ---- Small helpers for building HTML ---- */

function make(tag, properties = {}, children = []) {
  const element = document.createElement(tag);
  Object.assign(element, properties);
  element.append(...children);
  return element;
}

function button(text, className, onClick, tooltip) {
  const element = make("button", { type: "button", className, textContent: text });
  if (tooltip) element.title = tooltip;
  element.addEventListener("click", (event) => {
    onClick(event);
    // Drop keyboard focus so a later press of Space or Enter (Foundry
    // shortcuts) doesn't press this button again by accident.
    if (document.activeElement === element) element.blur();
  });
  return element;
}

function press(element, isPressed) {
  element.classList.toggle("on", isPressed);
  element.setAttribute("aria-pressed", String(isPressed));
}
