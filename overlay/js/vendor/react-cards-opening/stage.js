const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const channels = (hex) => {
    const value = hex.replace("#", "");
    const full = value.length === 3 ? [...value].map((char) => char + char).join("") : value;
    return [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16) || 0);
};
/** `amount` of the way from one hex colour to another: 0 is the first, 1 the second. */
function mixColors(from, to, amount) {
    const b = channels(to);
    return `#${channels(from)
        .map((channel, index) => Math.round(Math.min(255, Math.max(0, channel + ((b[index] ?? 0) - channel) * amount)))
        .toString(16)
        .padStart(2, "0"))
        .join("")}`;
}
/** A colour a share of the way to white. A colour that is not a plain hex is handed back as it came. */
export const tint = (colour, amount) => HEX.test(colour) ? mixColors(colour, "#ffffff", amount) : colour;
/** A colour a share of the way to black. */
export const shade = (colour, amount) => HEX.test(colour) ? mixColors(colour, "#000000", amount) : colour;
const TAU = Math.PI * 2;
const FULL = [0, TAU];
/**
 * The point where a line from the middle at `angle` crosses the outline of what is celebrated, in design pixels.
 * `share` pulls it in (under one) or pushes it out (over one).
 */
export function onEdge(angle, ratio, share = 1) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const reach = Math.min(150 / Math.max(Math.abs(cos), 1e-6), (150 * ratio) / Math.max(Math.abs(sin), 1e-6)) * share;
    return [cos * reach, sin * reach];
}
/** Makes the particles an effect asked for, scaled to the stage and placed on it. */
export function spawn(stage, spec) {
    const { random, scale } = stage;
    const pick = (range, fallback) => {
        if (range === undefined)
            return fallback;
        if (typeof range === "number")
            return range;
        return range[0] + (range[1] - range[0]) * random();
    };
    const shapes = typeof spec.shape === "string" ? [spec.shape] : (spec.shape ?? ["square"]);
    const colours = spec.colours ?? [stage.tone];
    return Array.from({ length: spec.count }, (_unused, index) => {
        const spread = spec.angle ?? FULL;
        const angle = typeof spread === "function"
            ? spread(index, spec.count, random)
            : spread[0] + ((index + random() * 0.9) / spec.count) * (spread[1] - spread[0]);
        let fromX = 0;
        let fromY = 0;
        if (spec.from === "edge")
            [fromX, fromY] = onEdge(angle, stage.ratio, 0.92);
        else if (spec.from)
            [fromX, fromY] = spec.from(index, spec.count, random);
        const speed = pick(spec.speed, 0) * scale;
        const orbit = spec.polar?.(index, spec.count, random);
        const x = stage.x + fromX * scale;
        const y = stage.y + fromY * scale;
        const rotation = spec.rotation === "heading" ? angle : pick(spec.rotation, random() * TAU);
        return {
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            gravity: (spec.gravity ?? 0) * scale,
            drag: spec.drag ?? 1,
            age: -pick(spec.delay, 0),
            life: pick(spec.life, 1),
            size: pick(spec.size, 6) * scale,
            grow: spec.grow ?? 1,
            rotation,
            spin: pick(spec.spin, 0),
            colour: colours[Math.floor(random() * colours.length)] ?? stage.tone,
            shape: shapes[Math.floor(random() * shapes.length)] ?? "square",
            alpha: pick(spec.alpha, 1),
            fadeIn: spec.fadeIn ?? 0.04,
            fadeOut: spec.fadeOut ?? 0.4,
            twinkle: pick(spec.twinkle, 0),
            phase: random() * TAU,
            sway: pick(spec.sway, 0) * scale,
            swayHz: pick(spec.swayHz, 1),
            flip: pick(spec.flip, 0),
            glow: spec.glow ?? 0,
            trail: spec.trail ?? 0.08,
            line: (spec.line ?? 1.5) * Math.max(scale, 0.6),
            snap: (spec.snap ?? 0) * scale,
            polar: orbit ? { ...orbit, cx: x, cy: y, radius: orbit.radius * scale, radial: orbit.radial * scale } : null,
        };
    });
}
/** Lets particles go at their moment of the timeline. */
export function emit(stage, timeline, spec) {
    timeline.call(() => stage.field.emit(spawn(stage, spec)), undefined, spec.at ?? 0);
}
/* ---------- parts ---------- */
/**
 * An element of the effect, on the stage. A part sits on the effect's centre and is sized by the stylesheet in
 * `--rco-fx-u`, the width of what is celebrated. A cover fills the whole layer instead.
 */
export function part(stage, name, cover = false) {
    const element = document.createElement("i");
    element.className = cover ? `rco-fx-cover rco-fx-${name}` : `rco-fx rco-fx-${name}`;
    element.setAttribute("aria-hidden", "true");
    stage.root.append(element);
    return element;
}
/** A part inside another part: a ring's second line, a flare's ghost. */
export function piece(parent, name) {
    const element = document.createElement("i");
    element.className = `rco-fx-${name}`;
    parent.append(element);
    return element;
}
const SVG = "http://www.w3.org/2000/svg";
/** Every drawn part's lines are kept under a name of their own, so the copies of them can point at it. */
let drawn = 0;
/**
 * The sheet a drawn part is on, and the group its lines go in. The lines are drawn four times over: three times
 * wide and faint, in the tier's colour, and once as themselves. That is their glow. A blur filter would give the
 * same light, and would have the browser blur a picture several screens wide again on every frame; lines drawn
 * wider cost what lines cost. The copies follow the lines: change a line's points and its glow has moved too.
 */
function sheet(stage, name) {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("class", `rco-fx rco-fx-${name}`);
    svg.setAttribute("viewBox", "-100 -100 200 200");
    svg.setAttribute("aria-hidden", "true");
    drawn += 1;
    const id = `rco-fx-ink-${drawn}`;
    const kept = document.createElementNS(SVG, "defs");
    const ink = document.createElementNS(SVG, "g");
    ink.setAttribute("id", id);
    kept.append(ink);
    svg.append(kept);
    for (const layer of ["glow-far", "glow-mid", "glow-near", "ink"]) {
        const copy = document.createElementNS(SVG, "use");
        copy.setAttribute("href", `#${id}`);
        copy.setAttribute("class", `rco-fx-${layer}`);
        svg.append(copy);
    }
    stage.root.append(svg);
    return { svg, ink };
}
/**
 * A drawn part: outlines that stay one line thick however far they are stretched. The part itself, the thing to
 * move and fade, is each line's `ownerSVGElement`.
 */
export function drawing(stage, name, { tag, count = 1 }) {
    const { ink } = sheet(stage, name);
    return Array.from({ length: count }, () => {
        const line = document.createElementNS(SVG, tag);
        line.setAttribute("class", `rco-fx-${name.split(" ")[0]}-line`);
        line.setAttribute("vector-effect", "non-scaling-stroke");
        ink.append(line);
        return line;
    });
}
/**
 * A drawn part made of more than outlines: circles, dashes, whatever the markup says. The markup is the effect's
 * own, written in the library, never anything a page passed in.
 */
export function figure(stage, name, markup) {
    const { svg, ink } = sheet(stage, name);
    ink.innerHTML = markup;
    return svg;
}
/** The corners of a shape with this many sides, as SVG points, its first corner straight up. */
export function corners(sides, radius = 100) {
    return Array.from({ length: sides }, (_unused, index) => {
        const angle = (index / sides) * TAU - Math.PI / 2;
        return `${(Math.cos(angle) * radius).toFixed(2)},${(Math.sin(angle) * radius).toFixed(2)}`;
    }).join(" ");
}
