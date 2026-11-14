# Ordy's Narration Helper

A FoundryVTT module that shows narration text on every player's screen, for dramatic moments. It comes with 14 themes and a GM window for writing and sending narration.

## Install

Paste this manifest link into Foundry's "Install Module" box (or the Forge Bazaar's "Install From Manifest"):

```
https://raw.githubusercontent.com/OrdeliaLys/Ordy-s-Narration-Helper/main/module.json
```

## The narration window (GM only)

Open it any of these ways:

- type `/narrate` in chat
- click the feather button in the token tools on the left
- run a macro: `game.modules.get("ordelia-narration").api.toggle();`
- assign a hotkey under Configure Controls

In the window you type the narration (each line is shown on its own), pick a theme, and choose the effect, speed, position, size, whether the screen darkens, how long each line stays, and who sees it.

| Button | What it does |
|---|---|
| Narrate | Shows the text to the chosen players (Ctrl+Enter also works) |
| Preview | Shows it on your screen only |
| Next | Finishes typing the current line, or moves to the next one |
| Stop | Clears the screen for everyone |

"Wait for Next" keeps each line up until you press Next, instead of timing out.

### Headings

Put `::` between a small heading and the main text to make a title card:

```
Chapter 8 :: The Decaying Gardens
```

"Chapter 8" appears in small letters above "The Decaying Gardens". This works everywhere: the window, `/narrate`, saved narrations and macros.

### Saved narrations

Type a narration, choose its look, and press **Save current**. It joins the Saved narrations list and keeps the look it was saved with. Each row has four buttons:

| Button | What it does |
|---|---|
| The narration itself | Sends it right away |
| ✎ | Loads it into the text box so you can change it (saving the same text again replaces it) |
| ⊞ | Adds a one-click button for it to your macro bar |
| × | Removes it |

Saved narrations are stored in the world, so they are there on any computer you GM from.

## Chat commands (GM only)

| Type in chat | What happens |
|---|---|
| `/narrate` | Opens the narration window |
| `/narrate The gates groan open.` | Shows that line with the default look |
| `/narrate First line. \| Second line.` | Shows the lines one after another |
| `/narrate [gauntlight] The light pulses.` | Shows the line in a chosen theme |
| `/narrate Chapter 8 :: The Decaying Gardens` | Shows a small heading above the line |
| `/narrate-next` | Same as the Next button |
| `/narrate-stop` | Same as the Stop button |

## Themes

Made for Abomination Vaults: `gauntlight`, `vaults`, `emptydeath`, `belcorra`, `otari`

General: `classic`, `parchment`, `cinematic`, `dread`, `arcane`, `divine`, `wild`, `infernal`, `dream`

## Settings

Under Configure Settings. The world settings are the defaults; the narration window can override them for each narration.

- **World (GM):** default theme, position, size, effect, typing speed, darken the screen, seconds per line, wait for Next by default, also post to chat, narrator name in chat
- **Per person:** reduce motion (simple fade, no animation), and for the GM, don't darken my screen

## Macros

```js
const narration = game.modules.get("ordelia-narration").api;

narration.toggle();                                  // open or close the window
narration.narrate("Your text here");                 // default look
narration.narrate("Your text", { theme: "dread", position: "bottom" });
narration.narrate("A private vision.", {}, ["USER_ID"]);  // chosen players only
narration.next();
narration.stop();
```

Options you can pass: `theme`, `position` (top, center, bottom), `textSize` (small, medium, large), `effect` (typewriter, words, fade), `speed` (slow, normal, fast), `dim` (true/false), `holdSeconds`, `manual` (true = wait for Next).

## Files

| File | What it holds |
|---|---|
| `scripts/narration.js` | Main file: settings, chat commands, sending and receiving |
| `scripts/display.js` | Puts the text on screen and animates it |
| `scripts/panel.js` | The narration window |
| `scripts/themes.js` | The list of themes |
| `scripts/options.js` | The list of options and their allowed values |
| `styles/themes.css` | How each theme looks |
| `styles/narration.css` | Layout of the on-screen text |
| `styles/panel.css` | How the narration window looks |

To add a theme, add a line to `scripts/themes.js` and a matching block to `styles/themes.css`.

## Releasing an update

Foundry installs from `module.zip`, not from the loose files, so an update needs all three steps:

1. Change the files.
2. Raise `"version"` in `module.json`.
3. Rebuild `module.zip` so it contains `module.json`, `scripts/` and `styles/` at its top level.
