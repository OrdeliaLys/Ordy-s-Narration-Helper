/* Grows vines over a line of narration (used by the Overgrown theme).

   How it works: measure where every letter sits on screen, then draw curvy
   lines that climb up beside letters, run across their tops and dip into the
   gaps between them. Each line is "grown" by animating how much of it is
   drawn, and leaves pop out along it as the tip passes.

   The vines follow the letters' boxes (left edge, top, gaps), not the exact
   curves of each letter: browsers don't provide letter outlines to trace. */

const SVG_NS = "http://www.w3.org/2000/svg";
const LEAF_COLOURS = ["#4f8f2f", "#6fae45", "#3d7a2a", "#8fc25a", "#5c9a3a", "#9a8a3c", "#7a6a2e"];
const LEAF_SHAPE = "M0,0 C3,-5.5 9,-5.5 13,0 C9,5.5 3,5.5 0,0 Z";

// textEl:   the .on-text element holding the letters (.on-ch spans)
// duration: roughly how long the text takes to appear, so the vines keep pace
// instant:  true = draw everything fully grown, no animation (reduce motion)
export async function growVines(textEl, { duration = 3000, instant = false } = {}) {
  const letters = [...textEl.querySelectorAll(".on-ch")];
  if (letters.length === 0) return;

  // Wait briefly for the theme's font, so measurements match what is shown.
  const style = getComputedStyle(textEl);
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  try {
    await Promise.race([document.fonts.load(font), new Promise((done) => setTimeout(done, 300))]);
  } catch (error) {
    // No font loading support: carry on with what we have.
  }
  if (!letters[0].isConnected) return; // the line changed while we waited

  const origin = textEl.getBoundingClientRect();
  if (origin.width === 0) return;

  const size = parseFloat(style.fontSize) || 32;
  const unit = size / 40; // every length below scales with the text size
  // The empty space after each letter. Stems climb in the middle of it.
  const gap = Math.max(parseFloat(style.letterSpacing) || 0, unit * 2);
  const metrics = measureFont(font, size);
  const random = seededRandom(textEl.textContent);

  // Where each letter is, relative to the text element.
  const boxes = letters
    .map((letter) => {
      const box = letter.getBoundingClientRect();
      return { left: box.left - origin.left, top: box.top - origin.top, width: box.width };
    })
    .filter((box) => box.width > 0);
  if (boxes.length === 0) return;

  // Group letters into rows (a long line wraps onto several rows).
  const rows = [];
  for (const box of boxes) {
    let row = rows.find((candidate) => Math.abs(candidate.top - box.top) < size * 0.5);
    if (!row) {
      row = { top: box.top, boxes: [] };
      rows.push(row);
    }
    row.boxes.push(box);
  }

  // Two drawing layers: one behind the letters, one in front.
  const back = makeLayer("on-vines on-vines-back", instant);
  const front = makeLayer("on-vines on-vines-front", instant);
  textEl.prepend(back);
  textEl.append(front);

  const totalWidth = Math.max(...boxes.map((box) => box.left + box.width)) || 1;

  for (const row of rows) {
    const baseline = row.top + metrics.ascent;       // where letters stand
    const capTop = baseline - metrics.capHeight;     // top of capital letters
    const cap = metrics.capHeight;
    const first = row.boxes[0];
    const last = row.boxes[row.boxes.length - 1];
    const rowLeft = first.left;
    const rowRight = last.left + last.width;

    // Leaves in front of the text must not sit on top of a letter's body,
    // or the words get hard to read. This says whether a spot is "on a letter".
    const onLetter = (x, y) =>
      y > capTop - cap * 0.1 &&
      y < baseline - cap * 0.04 &&
      row.boxes.some((box) => x > box.left + unit && x < box.left + box.width - unit);
    const startDelay = (rowLeft / totalWidth) * duration * 0.3;

    // 1. A creeper running under the whole row.
    const creeper = [{ x: rowLeft - cap * 0.9, y: baseline + cap * 0.55 }];
    for (let x = rowLeft - cap * 0.3; x < rowRight + cap * 0.3; x += cap * 0.9) {
      creeper.push({ x, y: baseline + cap * (0.16 + random() * 0.16) });
    }
    creeper.push(...curl({ x: rowRight + cap * 0.45, y: baseline + cap * 0.1 }, cap * 0.3, 1));
    drawVine(front, creeper, {
      width: 2.6 * unit, unit, random, cap, keepClear: onLetter,
      delay: startDelay, growTime: Math.max(duration * 0.9, 1800), leafEvery: cap * 0.55
    });

    // 2. Climbers: up beside a letter, over the tops, dipping into the gaps.
    let index = Math.floor(random() * 2);
    let goRight = true;
    while (index < row.boxes.length) {
      const reach = 2 + Math.floor(random() * 4); // how many letters it crosses
      const span = goRight
        ? row.boxes.slice(index, index + reach)
        : row.boxes.slice(Math.max(index - reach + 1, 0), index + 1).reverse();
      const direction = goRight ? 1 : -1;
      const start = span[0];
      // The middle of the empty space this climber starts in: just before
      // its first letter when heading right, just after it when heading left.
      const edge = goRight ? start.left - gap / 2 : start.left + start.width - gap / 2;

      const points = [
        { x: edge - direction * unit, y: baseline + cap * 0.3 },
        { x: edge, y: baseline - cap * 0.4 },
        { x: edge + direction * unit, y: capTop - cap * 0.16 }
      ];
      for (const box of span) {
        const middle = box.left + (box.width - gap) / 2;
        const nextGap = goRight ? box.left + box.width - gap / 2 : box.left - gap / 2;
        points.push({ x: middle, y: capTop - cap * (0.2 + random() * 0.14) });   // over the top
        points.push({ x: nextGap, y: capTop + cap * (random() * 0.18) });         // dip into the gap
      }
      const tip = points.pop();
      points.push(...curl({ x: tip.x, y: tip.y - cap * 0.1 }, cap * (0.24 + random() * 0.12), direction));

      const layer = random() < 0.3 ? back : front;
      drawVine(layer, points, {
        width: 2 * unit, unit, random, cap, keepClear: layer === front ? onLetter : null,
        delay: startDelay + (start.left / totalWidth) * duration * 0.8 + random() * 250,
        growTime: 1500 + reach * 320, leafEvery: cap * 0.5
      });

      index += reach + 1 + Math.floor(random() * 3);
      goRight = !goRight;
    }

    // 3. A weaver passing behind the letters, seen through their gaps.
    const weaver = [{ x: rowLeft - cap * 0.6, y: baseline + cap * 0.4 }];
    let high = random() < 0.5;
    for (let x = rowLeft; x < rowRight + cap * 0.4; x += cap * 1.25) {
      weaver.push({ x, y: high ? capTop + cap * 0.22 : baseline - cap * 0.18 });
      high = !high;
    }
    drawVine(back, weaver, {
      width: 2.2 * unit, unit, random, cap,
      delay: startDelay + 300, growTime: Math.max(duration, 2200), leafEvery: cap * 0.7
    });
  }
}

/* ---- Drawing one vine ---- */

function drawVine(layer, points, { width, unit, random, cap, delay, growTime, leafEvery, keepClear = null }) {
  const stem = document.createElementNS(SVG_NS, "path");
  stem.setAttribute("class", "on-vine");
  stem.setAttribute("d", smoothPath(points));
  stem.setAttribute("stroke-width", width.toFixed(2));
  layer.append(stem);

  // Start with none of the line drawn, then animate it to fully drawn.
  const length = stem.getTotalLength();
  stem.style.strokeDasharray = `${length}`;
  stem.style.strokeDashoffset = `${length}`;
  stem.style.animationDelay = `${Math.round(delay)}ms`;
  stem.style.animationDuration = `${Math.round(growTime)}ms`;

  // Leaves along the stem, alternating sides, each appearing as the tip passes.
  let side = random() < 0.5 ? 1 : -1;
  for (let at = leafEvery * (0.5 + random() * 0.5); at < length - cap * 0.25; at += leafEvery * (0.7 + random() * 0.6)) {
    const here = stem.getPointAtLength(at);
    const ahead = stem.getPointAtLength(Math.min(at + 1, length));
    const heading = (Math.atan2(ahead.y - here.y, ahead.x - here.x) * 180) / Math.PI;
    const angle = heading + side * (40 + random() * 35);
    const leafSize = (cap / 13) * (0.34 + random() * 0.2); // LEAF_SHAPE is 13 units long
    side = -side;

    // Skip this leaf if its base or its tip would cover part of a letter.
    if (keepClear) {
      const reach = 13 * leafSize;
      const tipX = here.x + reach * Math.cos((angle * Math.PI) / 180);
      const tipY = here.y + reach * Math.sin((angle * Math.PI) / 180);
      if (keepClear(here.x, here.y) || keepClear(tipX, tipY)) continue;
    }

    const holder = document.createElementNS(SVG_NS, "g");
    holder.setAttribute(
      "transform",
      `translate(${here.x.toFixed(1)} ${here.y.toFixed(1)}) rotate(${angle.toFixed(0)}) scale(${leafSize.toFixed(3)})`
    );
    const leaf = document.createElementNS(SVG_NS, "path");
    leaf.setAttribute("class", "on-leaf");
    leaf.setAttribute("d", LEAF_SHAPE);
    leaf.setAttribute("fill", LEAF_COLOURS[Math.floor(random() * LEAF_COLOURS.length)]);
    leaf.style.animationDelay = `${Math.round(delay + (at / length) * growTime)}ms`;
    holder.append(leaf);
    layer.append(holder);
  }
}

function makeLayer(className, instant) {
  const layer = document.createElementNS(SVG_NS, "svg");
  layer.setAttribute("class", instant ? `${className} instant` : className);
  layer.setAttribute("aria-hidden", "true");
  return layer;
}

/* ---- Geometry helpers ---- */

// A spiral that ends a vine in a curl.
function curl(from, radius, direction) {
  const centre = { x: from.x + direction * radius * 0.2, y: from.y - radius };
  const points = [];
  for (let step = 0; step <= 9; step++) {
    const turn = step / 9;
    const angle = Math.PI / 2 - direction * turn * Math.PI * 2.9;
    const reach = radius * (1 - 0.8 * turn);
    points.push({ x: centre.x + reach * Math.cos(angle), y: centre.y + reach * Math.sin(angle) });
  }
  return points;
}

// Turn a list of points into one smooth curve passing through all of them.
function smoothPath(points) {
  const number = (value) => value.toFixed(1);
  let path = `M${number(points[0].x)},${number(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const before = points[i - 1] ?? points[i];
    const from = points[i];
    const to = points[i + 1];
    const after = points[i + 2] ?? to;
    const c1 = { x: from.x + (to.x - before.x) / 6, y: from.y + (to.y - before.y) / 6 };
    const c2 = { x: to.x - (after.x - from.x) / 6, y: to.y - (after.y - from.y) / 6 };
    path += ` C${number(c1.x)},${number(c1.y)} ${number(c2.x)},${number(c2.y)} ${number(to.x)},${number(to.y)}`;
  }
  return path;
}

// How tall capital letters are in this font, and how far the baseline sits
// below the top of a letter's box.
function measureFont(font, size) {
  try {
    const context = document.createElement("canvas").getContext("2d");
    context.font = font;
    const measured = context.measureText("H");
    const ascent = measured.fontBoundingBoxAscent;
    const capHeight = measured.actualBoundingBoxAscent;
    if (ascent > 0 && capHeight > 0) return { ascent, capHeight };
  } catch (error) {
    // Fall through to typical proportions.
  }
  return { ascent: size * 0.9, capHeight: size * 0.7 };
}

// Random numbers that come out the same for the same text, so every player
// sees the same vines.
function seededRandom(text) {
  let seed = 2166136261;
  for (const character of String(text)) {
    seed ^= character.codePointAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
