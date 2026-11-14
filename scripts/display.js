/* Puts narration text on screen. This part runs in every browser (GM and
   players) and knows nothing about Foundry: it only builds and animates HTML. */

import { normalizeOptions } from "./options.js";

// Timing, in milliseconds. Change these to taste.
const FADE_MS = 800;           // fade in/out of a whole line
const INTRO_MS = 400;          // short pause before typing starts
const EXTRA_MS_PER_CHAR = 30;  // long lines stay on screen a little longer
const CHAR_MS = { slow: 60, normal: 35, fast: 18 };     // typewriter: per letter
const WORD_MS = { slow: 320, normal: 200, fast: 120 };  // word by word: per word

const queue = [];     // lines waiting to be shown
let playing = false;  // is the queue being played right now?
let runId = 0;        // goes up by one on every stop, so old timers know to quit
let overlay = null;   // the full-screen element holding the text
let current = null;   // the line on screen: { key, phase, finishReveal(), end() }


/* --------------------------------------------------------------------------
   What other files can ask for
   -------------------------------------------------------------------------- */

// Add lines to the queue and start playing if nothing is on screen.
//   local:   this browser's own preferences: { reduceMotion, noDim }
//   batchId: a name for this group of lines. Each line gets the key
//            "<batchId>:<number>", so the GM can say exactly which line
//            "Next" applies to and every browser agrees.
export function showNarration(lines, rawOptions, local = {}, batchId = "local") {
  const options = normalizeOptions(rawOptions);
  lines.forEach((line, index) => {
    queue.push({ line: String(line), options, local, key: `${batchId}:${index}` });
  });
  if (!playing) playQueue();
}

// Clear everything right away.
export function clearNarration() {
  runId += 1;
  queue.length = 0;
  playing = false;
  overlay?.classList.remove("active");
  const line = current;
  current = null;
  line?.end(); // wakes a line that is waiting, so it can notice the stop
}

// Which line is on screen, and is it still being typed ("reveal") or
// complete and waiting ("hold")? Returns null when nothing is showing.
export function currentLine() {
  return current ? { key: current.key, phase: current.phase } : null;
}

// "Chapter 8 :: The Decaying Gardens" -> { heading: "Chapter 8", main: "The Decaying Gardens" }
// A line without :: (or with nothing on one side of it) has no heading.
export function splitHeading(line) {
  const text = String(line);
  const marker = text.indexOf("::");
  if (marker < 0) return { heading: "", main: text.trim() };

  const before = text.slice(0, marker).trim();
  const after = text.slice(marker + 2).trim();
  if (before && after) return { heading: before, main: after };
  return { heading: "", main: before || after };
}

// Finish typing the given line at once.
export function finishReveal(key) {
  if (current?.key === key) current.finishReveal();
}

// Take the given line off the screen now and move on. If this browser hasn't
// reached that line yet, drop it from the queue instead.
export function advanceLine(key) {
  if (current?.key === key) {
    current.end();
    return;
  }
  const waiting = queue.findIndex((item) => item.key === key);
  if (waiting >= 0) queue.splice(waiting, 1);
}


/* --------------------------------------------------------------------------
   Playback
   -------------------------------------------------------------------------- */

async function playQueue() {
  playing = true;
  const myRun = runId;
  const element = getOverlay();

  while (queue.length > 0 && myRun === runId) {
    await playLine(element, queue.shift(), myRun);
  }

  // Only tidy up if nobody pressed stop in the meantime.
  if (myRun === runId) {
    element.classList.remove("active");
    playing = false;
  }
}

async function playLine(element, item, myRun) {
  const { line, options, local, key } = item;
  const stopped = () => myRun !== runId;
  const textEl = element.querySelector(".on-text");

  // A pause that can be cut short: wake() ends it early.
  // pause(null) waits until someone calls wake().
  let wake = null;
  const pause = (ms) =>
    new Promise((resolve) => {
      const timer = ms === null ? null : setTimeout(finish, ms);
      function finish() {
        clearTimeout(timer);
        wake = null;
        resolve();
      }
      wake = finish;
    });

  // Register this line as the one on screen.
  const state = { key, phase: "hold", ended: false, finishReveal: () => {}, end: () => {} };
  state.end = () => {
    state.ended = true;
    wake?.();
  };
  current = state;
  const over = () => stopped() || state.ended;

  // Apply the look.
  element.dataset.onTheme = options.theme;
  element.dataset.position = options.position;
  element.dataset.size = options.textSize;
  element.classList.toggle("dim", options.dim && !local.noDim);
  element.classList.toggle("reduced", Boolean(local.reduceMotion));
  element.classList.add("active");

  const effect = local.reduceMotion ? "fade" : options.effect;
  const { heading, main } = splitHeading(line);
  const words = buildLine(textEl, heading, main);
  const letters = words.flat();
  const revealAll = () => letters.forEach((letter) => letter.classList.add("on"));

  if (effect === "fade") {
    // Whole line fades in together.
    textEl.classList.add("instant");
    revealAll();
    textEl.style.transitionDuration = `${FADE_MS}ms`;
    textEl.classList.add("visible");
    await pause(FADE_MS);
  } else {
    // The line is fully laid out from the start (so it never jumps around),
    // but each letter is invisible until it is "typed".
    let skipTyping = false;
    state.phase = "reveal";
    state.finishReveal = () => {
      skipTyping = true;
      revealAll();
      wake?.();
    };

    textEl.classList.remove("instant");
    textEl.style.transitionDuration = `${INTRO_MS}ms`;
    textEl.classList.add("visible");
    await pause(INTRO_MS);

    if (effect === "typewriter") {
      for (const letter of letters) {
        if (skipTyping || over()) break;
        letter.classList.add("on");
        await pause(CHAR_MS[options.speed] * pauseFor(letter.textContent));
      }
    } else {
      for (const word of words) {
        if (skipTyping || over()) break;
        word.forEach((letter) => letter.classList.add("on"));
        const lastLetter = word[word.length - 1].textContent;
        await pause(WORD_MS[options.speed] * Math.min(pauseFor(lastLetter), 3));
      }
    }

    if (stopped()) return;
    revealAll();
    state.phase = "hold";
    state.finishReveal = () => {};
  }
  if (stopped()) return;

  // Leave it up: either for a set time, or until the GM presses Next.
  if (!state.ended) {
    const readingTime = options.holdSeconds * 1000 + line.length * EXTRA_MS_PER_CHAR;
    await pause(options.manual ? null : readingTime);
  }
  if (stopped()) return;

  // Fade the line out before the next one.
  current = null;
  textEl.style.transitionDuration = `${FADE_MS}ms`;
  textEl.classList.remove("visible");
  await wait(FADE_MS);
}


/* --------------------------------------------------------------------------
   Building the HTML
   -------------------------------------------------------------------------- */

// Turn "Two words" into: <span class="on-word"><span class="on-ch">T</span>...</span> ...
// Returns the letters grouped by word, so they can be revealed one by one.
// A heading, if there is one, goes on its own smaller row above. It is not
// typed out: it appears first, then the main text is revealed under it.
function buildLine(textEl, heading, main) {
  textEl.replaceChildren();
  const words = [];

  if (heading) {
    const headingEl = document.createElement("span");
    headingEl.className = "on-heading";
    headingEl.textContent = heading;
    textEl.append(headingEl);
  }

  for (const piece of main.split(/(\s+)/)) {
    if (piece === "") continue;
    if (/^\s+$/.test(piece)) {
      textEl.append(" ");
      continue;
    }
    const wordEl = document.createElement("span");
    wordEl.className = "on-word";
    const letters = Array.from(piece).map((character) => {
      const letterEl = document.createElement("span");
      letterEl.className = "on-ch";
      letterEl.textContent = character;
      return letterEl;
    });
    wordEl.append(...letters);
    textEl.append(wordEl);
    words.push(letters);
  }
  return words;
}

// Build the overlay the first time it's needed, then reuse it.
function getOverlay() {
  if (overlay?.isConnected) return overlay;

  overlay = document.createElement("div");
  overlay.id = "ordelia-narration";
  overlay.dataset.onTheme = "classic";
  overlay.style.setProperty("--on-fade", `${FADE_MS}ms`);

  const text = document.createElement("p");
  text.className = "on-text";
  overlay.append(text);
  document.body.append(overlay);

  // Reading this forces the browser to draw the hidden state first, so the
  // very first fade-in animates instead of popping in.
  void overlay.offsetWidth;
  return overlay;
}


/* --------------------------------------------------------------------------
   Small helpers
   -------------------------------------------------------------------------- */

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Rhythm: linger after punctuation.
function pauseFor(letter) {
  if (/[.!?…]/.test(letter)) return 10;
  if (/[,;:—–]/.test(letter)) return 5;
  return 1;
}
