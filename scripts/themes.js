/* The list of narration themes.
   Each theme's look lives in styles/themes.css under [data-on-theme="<id>"].
   To add a theme: add a line here, then add a matching block in themes.css.
   "decoration" switches on something drawn by a script (see vines.js). */

export const THEMES = [
  // Made for Abomination Vaults
  { id: "gauntlight", label: "Gauntlight", group: "Abomination Vaults" },
  { id: "vaults", label: "The Vaults", group: "Abomination Vaults" },
  { id: "emptydeath", label: "Empty Death", group: "Abomination Vaults" },
  { id: "belcorra", label: "Belcorra", group: "Abomination Vaults" },
  { id: "otari", label: "Otari", group: "Abomination Vaults" },
  { id: "overgrown", label: "Overgrown", group: "Abomination Vaults", decoration: "vines" },

  // General use
  { id: "classic", label: "Classic", group: "General" },
  { id: "parchment", label: "Parchment", group: "General" },
  { id: "cinematic", label: "Cinematic", group: "General" },
  { id: "dread", label: "Dread", group: "General" },
  { id: "arcane", label: "Arcane", group: "General" },
  { id: "divine", label: "Divine", group: "General" },
  { id: "wild", label: "Wild", group: "General" },
  { id: "infernal", label: "Infernal", group: "General" },
  { id: "dream", label: "Dream", group: "General" }
];

export function isTheme(id) {
  return THEMES.some((theme) => theme.id === id);
}

// Which scripted decoration a theme uses, if any (currently only "vines").
export function themeDecoration(id) {
  return THEMES.find((theme) => theme.id === id)?.decoration ?? null;
}

// For the settings dropdown: { gauntlight: "Abomination Vaults: Gauntlight", ... }
export function themeChoices() {
  const choices = {};
  for (const theme of THEMES) choices[theme.id] = `${theme.group}: ${theme.label}`;
  return choices;
}
