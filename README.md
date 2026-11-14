# Ordy's Narration Helper

A small FoundryVTT module that shows narration text on every player's screen, for dramatic moments.

## Install

Paste this manifest link into Foundry's "Install Module" box (or the Forge Bazaar's "Install From Manifest"):

```
https://raw.githubusercontent.com/OrdeliaLys/Ordy-s-Narration-Helper/main/module.json
```

## Use (GM only)

| Type in chat | What happens |
|---|---|
| `/narrate The gates groan open.` | Shows that line on everyone's screen |
| `/narrate First line. \| Second line.` | Shows the lines one after another |
| `/narrate` | Opens a box to type into (each line plays separately) |
| `/narrate-stop` | Clears the screen right away |

From a macro:

```js
game.modules.get("ordelia-narration").api.open();
game.modules.get("ordelia-narration").api.narrate("Your text here");
game.modules.get("ordelia-narration").api.stop();
```

Position, text size, screen dimming, the typewriter effect and timing are under Configure Settings.

## Releasing an update

Foundry installs from `module.zip`, not from the loose files, so an update needs all three steps:

1. Change the files (`scripts/narration.js`, `styles/narration.css`).
2. Raise `"version"` in `module.json`.
3. Rebuild `module.zip` so it contains `module.json`, `scripts/` and `styles/` at its top level.
