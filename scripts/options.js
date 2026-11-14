/* The options a narration can have, and a function that makes sure a set of
   options is complete and valid before it is used. */

import { isTheme } from "./themes.js";

export const POSITIONS = { top: "Top", center: "Center", bottom: "Bottom" };
export const SIZES = { small: "Small", medium: "Medium", large: "Large" };
export const EFFECTS = { typewriter: "Typewriter", words: "Word by word", fade: "Fade in" };
export const SPEEDS = { slow: "Slow", normal: "Normal", fast: "Fast" };

// Used whenever an option is missing or not recognised.
export const FALLBACK = {
  theme: "classic",
  position: "center",
  textSize: "medium",
  effect: "typewriter",
  speed: "normal",
  dim: true,
  holdSeconds: 3,
  manual: false // true = each line waits until the GM presses Next
};

export function normalizeOptions(raw = {}) {
  const pick = (value, choices, fallback) => (value in choices ? value : fallback);
  const seconds = Number(raw.holdSeconds);

  return {
    theme: isTheme(raw.theme) ? raw.theme : FALLBACK.theme,
    position: pick(raw.position, POSITIONS, FALLBACK.position),
    textSize: pick(raw.textSize, SIZES, FALLBACK.textSize),
    effect: pick(raw.effect, EFFECTS, FALLBACK.effect),
    speed: pick(raw.speed, SPEEDS, FALLBACK.speed),
    dim: raw.dim === undefined ? FALLBACK.dim : Boolean(raw.dim),
    holdSeconds: Number.isFinite(seconds) ? Math.min(Math.max(seconds, 1), 60) : FALLBACK.holdSeconds,
    manual: Boolean(raw.manual)
  };
}
