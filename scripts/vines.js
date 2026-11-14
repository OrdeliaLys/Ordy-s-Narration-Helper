/* Grows vines over a line of narration (used by the Overgrown and Blighted themes).

   How it works: measure where every letter sits on screen, then draw curvy
   lines that climb up beside letters, run across their tops and dip into the
   gaps between them. Each line is "grown" by animating how much of it is
   drawn, and leaves pop out along it as the tip passes.

   The vines follow the letters' boxes (left edge, top, gaps), not the exact
   curves of each letter: browsers don't provide letter outlines to trace. */

const SVG_NS = "http://www.w3.org/2000/svg";

// The two kinds of vine. Colours of the stems themselves are in themes.css.
const LOOKS = {
  // Healthy green growth.
  lush: {
    leafColours: ["#4f8f2f", "#6fae45", "#3d7a2a", "#8fc25a", "#5c9a3a", "#9a8a3c", "#7a6a2e"],
    leafShape: "M0,0 C3,-5.5 9,-5.5 13,0 C9,5.5 3,5.5 0,0 Z",
    leafSpacing: 1,     // 1 = normal, bigger = fewer leaves
    thorns: false,
    gnarl: 0,           // how crooked the stems are
    fallShare: 0,       // share of leaves that drop off
    roots: false,
    thickness: 1,       // stem width multiplier
    slowdown: 1         // bigger = grows more slowly
  },
  // Dying, thorny growth.
  blight: {
    leafColours: ["#4a4a1c", "#5c5a24", "#3a3c16", "#6b6426", "#2c3312", "#54421c", "#3e4a1a"],
    leafShape: "M0,0 C2,-4.5 6,-6 8.5,-3 L13,0 L9.5,1.8 C7,5 2.5,4.5 0,0 Z",
    leafSpacing: 1.7,
    thorns: true,
    gnarl: 0.09,
    fallShare: 0.5,
    roots: true,
    thickness: 1.35,
    slowdown: 1.35
  }
};

// textEl:   the .on-text element holding the letters (.on-ch spans)
// duration: roughly how long the text takes to appear, so the vines keep pace
// instant:  true = draw everything fully grown, no animation (reduce motion)
// look:     "lush" or "blight"
export async function growVines(textEl, { duration = 3000, instant = false, look = "lush" } = {}) {
  const kind = LOOKS[look] ?? LOOKS.lush;
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
  duration *= kind.slowdown;

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
  const back = makeLayer(`on-vines on-vines-back on-vines-${look}`, instant);
  const front = makeLayer(`on-vines on-vines-front on-vines-${look}`, instant);
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

    // Leaves and thorns in front of the text must not sit on top of a
    // letter's body, or the words get hard to read. This says whether a
    // spot is "on a letter".
    const onLetter = (x, y) =>
      y > capTop - cap * 0.1 &&
      y < baseline - cap * 0.04 &&
      row.boxes.some((box) => x > box.left + unit && x < box.left + box.width - unit);
    const startDelay = (rowLeft / totalWidth) * duration * 0.3;
    const shared = { unit, random, cap, kind };

    // 1. A creeper running under the whole row.
    const creeper = [{ x: rowLeft - cap * 0.9, y: baseline + cap * 0.55 }];
    for (let x = rowLeft - cap * 0.3; x < rowRight + cap * 0.3; x += cap * 0.9) {
      creeper.push({ x, y: baseline + cap * (0.16 + random() * 0.16) });
    }
    creeper.push(...curl({ x: rowRight + cap * 0.45, y: baseline + cap * 0.1 }, cap * 0.3, 1));
    const creeperTime = Math.max(duration * 0.9, 1800);
    drawVine(front, gnarled(creeper, kind.gnarl * cap, random, 10), {
      ...shared, width: 2.6 * unit, keepClear: onLetter,
      delay: startDelay, growTime: creeperTime, leafEvery: cap * 0.55
    });

    // 1b. Blighted only: dead roots hanging down from the creeper.
    if (kind.roots) {
      for (let x = rowLeft + random() * cap; x < rowRight; x += cap * (1.1 + random() * 1.4)) {
        const drop = cap * (0.45 + random() * 0.7);
        const lean = (random() - 0.5) * cap * 0.5;
        const top = baseline + cap * 0.24;
        const root = [
          { x, y: top },
          { x: x + lean * 0.3, y: top + drop * 0.45 },
          { x: x + lean, y: top + drop }
        ];
        drawVine(back, root, {
          ...shared, width: 1.3 * unit, keepClear: null, leaves: false, thorns: false,
          delay: startDelay + ((x - rowLeft) / (rowRight - rowLeft || 1)) * creeperTime + 300,
          growTime: 1400 + random() * 900, leafEvery: cap
        });
      }
    }

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
        ...shared, width: 2 * unit, keepClear: layer === front ? onLetter : null,
        delay: startDelay + (start.left / totalWidth) * duration * 0.8 + random() * 250,
        growTime: (1500 + reach * 320) * kind.slowdown, leafEvery: cap * 0.5
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
    drawVine(back, gnarled(weaver, kind.gnarl * cap, random), {
      ...shared, width: 2.2 * unit, keepClear: null,
      delay: startDelay + 300, growTime: Math.max(duration, 2200), leafEvery: cap * 0.7
    });
  }
}

/* ---- Drawing one vine ---- */

function drawVine(layer, points, settings) {
  const { width, random, cap, kind, delay, growTime, keepClear } = settings;
  const withLeaves = settings.leaves ?? true;
  const withThorns = settings.thorns ?? kind.thorns;
  const leafEvery = settings.leafEvery * kind.leafSpacing;

  const stem = document.createElementNS(SVG_NS, "path");
  stem.setAttribute("class", "on-vine");
  stem.setAttribute("d", smoothPath(points));
  stem.setAttribute("stroke-width", (width * kind.thickness).toFixed(2));
  layer.append(stem);

  // Start with none of the line drawn, then animate it to fully drawn.
  const length = stem.getTotalLength();
  stem.style.strokeDasharray = `${length}`;
  stem.style.strokeDashoffset = `${length}`;
  stem.style.animationDelay = `${Math.round(delay)}ms`;
  stem.style.animationDuration = `${Math.round(growTime)}ms`;

  // The moment the growing tip reaches a given distance along the stem.
  const reachedAt = (distance) => Math.round(delay + (distance / length) * growTime);
  // Position and direction of the stem at a given distance.
  const spot = (distance) => {
    const here = stem.getPointAtLength(distance);
    const ahead = stem.getPointAtLength(Math.min(distance + 1, length));
    return { x: here.x, y: here.y, heading: Math.atan2(ahead.y - here.y, ahead.x - here.x) };
  };

  // Thorns: small spikes sticking out sideways, alternating sides.
  if (withThorns) {
    let side = 1;
    for (let at = cap * 0.2; at < length - cap * 0.3; at += cap * (0.2 + random() * 0.16)) {
      const { x, y, heading } = spot(at);
      const out = heading + (side * Math.PI) / 2 + (random() - 0.5) * 0.5;
      const spike = cap * (0.15 + random() * 0.11);
      const half = cap * 0.045;
      const tip = { x: x + spike * Math.cos(out), y: y + spike * Math.sin(out) };
      side = -side;
      if (keepClear && (keepClear(x, y) || keepClear(tip.x, tip.y))) continue;

      const thorn = document.createElementNS(SVG_NS, "path");
      thorn.setAttribute("class", "on-thorn");
      thorn.setAttribute(
        "d",
        `M${(x - half * Math.cos(heading)).toFixed(1)},${(y - half * Math.sin(heading)).toFixed(1)} ` +
          `L${tip.x.toFixed(1)},${tip.y.toFixed(1)} ` +
          `L${(x + half * Math.cos(heading)).toFixed(1)},${(y + half * Math.sin(heading)).toFixed(1)} Z`
      );
      thorn.style.animationDelay = `${reachedAt(at)}ms`;
      layer.append(thorn);
    }
  }

  // Leaves along the stem, alternating sides, each appearing as the tip passes.
  if (!withLeaves) return;
  let side = random() < 0.5 ? 1 : -1;
  for (let at = leafEvery * (0.5 + random() * 0.5); at < length - cap * 0.25; at += leafEvery * (0.7 + random() * 0.6)) {
    const { x, y, heading } = spot(at);
    const angle = (heading * 180) / Math.PI + side * (40 + random() * 35);
    const leafSize = (cap / 13) * (0.34 + random() * 0.2); // leaf shapes are 13 units long
    const colour = kind.leafColours[Math.floor(random() * kind.leafColours.length)];
    const falls = random() < kind.fallShare;
    const fallAfter = 1200 + random() * 5000;
    const drift = (random() - 0.5) * cap * 1.6;
    const spin = (random() < 0.5 ? -1 : 1) * (80 + random() * 160);
    side = -side;

    // Skip this leaf if its base or its tip would cover part of a letter.
    if (keepClear) {
      const reach = 13 * leafSize;
      const tipX = x + reach * Math.cos((angle * Math.PI) / 180);
      const tipY = y + reach * Math.sin((angle * Math.PI) / 180);
      if (keepClear(x, y) || keepClear(tipX, tipY)) continue;
    }

    // Three nested groups: where it is / whether it falls / which way it points.
    const place = document.createElementNS(SVG_NS, "g");
    place.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    const faller = document.createElementNS(SVG_NS, "g");
    if (falls) {
      faller.setAttribute("class", "on-fall");
      faller.style.setProperty("--fall-x", `${drift.toFixed(0)}px`);
      faller.style.setProperty("--fall-y", `${(cap * (1.6 + random() * 1.6)).toFixed(0)}px`);
      faller.style.setProperty("--fall-spin", `${spin.toFixed(0)}deg`);
      faller.style.animationDelay = `${reachedAt(at) + Math.round(fallAfter)}ms`;
    }
    const turn = document.createElementNS(SVG_NS, "g");
    turn.setAttribute("transform", `rotate(${angle.toFixed(0)}) scale(${leafSize.toFixed(3)})`);
    const leaf = document.createElementNS(SVG_NS, "path");
    leaf.setAttribute("class", "on-leaf");
    leaf.setAttribute("d", kind.leafShape);
    leaf.setAttribute("fill", colour);
    leaf.style.animationDelay = `${reachedAt(at)}ms`;

    turn.append(leaf);
    faller.append(turn);
    place.append(faller);
    layer.append(place);
  }
}

function makeLayer(className, instant) {
  const layer = document.createElementNS(SVG_NS, "svg");
  layer.setAttribute("class", instant ? `${className} instant` : className);
  layer.setAttribute("aria-hidden", "true");
  return layer;
}

/* ---- Geometry helpers ---- */

// Nudge the middle points of a path up and down a little, so the stem looks
// crooked. amount = 0 leaves it untouched.
// "tail" is how many points at the end to leave alone (a curl is 10 points).
function gnarled(points, amount, random, tail = 1) {
  if (!amount) return points;
  return points.map((point, index) =>
    index === 0 || index >= points.length - tail
      ? point
      : { x: point.x + (random() - 0.5) * amount, y: point.y + (random() - 0.5) * amount * 2 }
  );
}

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
