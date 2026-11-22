import { gsap } from "./gsap.js";
import { LIGHT_EFFECTS } from "./light-effects.js";
import { PARTICLE_EFFECTS } from "./particle-effects.js";
import { createParticleField } from "./particles.js";
import { prefersReducedMotion } from "./reduced-motion.js";
import { SCREEN_EFFECTS } from "./screen-effects.js";
import { tint } from "./stage.js";
import { WAVE_EFFECTS } from "./wave-effects.js";
/** Every effect the library ships, particles first, then light, waves and the ones that act on the whole stage. */
export const EFFECT_LIST = [...PARTICLE_EFFECTS, ...LIGHT_EFFECTS, ...WAVE_EFFECTS, ...SCREEN_EFFECTS];
/** The same effects, by name. */
export const EFFECTS = Object.fromEntries(EFFECT_LIST.map((effect) => [effect.name, effect]));
export const EFFECT_KINDS = [
    { kind: "particles", label: "Particles" },
    { kind: "light", label: "Light" },
    { kind: "wave", label: "Waves" },
    { kind: "screen", label: "Screen" },
];
export const isEffectName = (name) => name in EFFECTS;
const SIZES = ["scale", "scaleX", "scaleY"];
/** A tween's values with every size in them multiplied: a part that is drawn up is drawn up at every moment. */
function drawnUp(vars, up) {
    const out = { ...vars };
    for (const size of SIZES) {
        const value = out[size];
        if (typeof value === "number")
            out[size] = value * up;
    }
    if (Array.isArray(out.keyframes)) {
        out.keyframes = out.keyframes.map((frame) => drawnUp(frame, up));
    }
    return out;
}
const isPart = (target) => target instanceof Element && (target.classList.contains("rco-fx") || target.classList.contains("rco-fx-cover"));
/**
 * The timeline an effect writes on, when its parts are laid out smaller than life (see `render` on the stage).
 * The stylesheet draws each part back up to size, and a tween that sets a part's size would undo that: an effect
 * says `scale: 1` and means the part's full size. So every size an effect gives a part is multiplied here, once,
 * and no effect has to know. Pieces inside a part are left alone: they are already inside what is drawn up.
 */
function atSize(timeline, up) {
    if (up === 1)
        return timeline;
    const fit = (targets, vars) => {
        const list = Array.isArray(targets) ? targets : [targets];
        return list.length > 0 && list.every(isPart) ? drawnUp(vars, up) : vars;
    };
    const proxy = new Proxy(timeline, {
        get(target, key) {
            if (key === "to" || key === "set" || key === "from") {
                return (targets, vars, at) => {
                    target[key](targets, fit(targets, vars), at);
                    return proxy;
                };
            }
            if (key === "fromTo") {
                // It has the shape GSAP gave it: four things to say.
                // oxlint-disable-next-line max-params
                return (targets, from, to, at) => {
                    target.fromTo(targets, fit(targets, from), fit(targets, to), at);
                    return proxy;
                };
            }
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
    return proxy;
}
const fields = new WeakMap();
function fieldOf(layer, blend) {
    const known = fields.get(layer);
    if (known)
        return known;
    const field = createParticleField(layer, blend === "add");
    fields.set(layer, field);
    return field;
}
/** Takes every effect off a layer, mid-play or not, and gives its canvas back. Call it when the layer goes away. */
export function clearEffects(layer) {
    fields.get(layer)?.destroy();
    fields.delete(layer);
    for (const play of Array.from(layer.querySelectorAll(".rco-fx-play"))) {
        gsap.killTweensOf(play.querySelectorAll("*"));
        play.remove();
    }
}
/**
 * Plays one effect or several at once on `layer`, an element laid over the place they happen (give it the class
 * `rco-fx-layer`, or use `EffectLayer`, which is one). Answers the timeline, so a show can be paused, sped up or
 * put inside another one. Under reduced motion nothing plays and the timeline is empty.
 */
export function playEffects(layer, effects, options = {}) {
    const asked = typeof effects === "string" || !Array.isArray(effects) ? [effects] : effects;
    const list = asked
        .map((effect) => (typeof effect === "string" ? EFFECTS[effect] : effect))
        .filter((effect) => effect !== undefined);
    if (list.length === 0 || prefersReducedMotion() || typeof document === "undefined")
        return gsap.timeline();
    // An effect that starts later is built later. Built now, its parts would be on the stage at once, standing still
    // in the state they start from, for as long as the wait lasts.
    if (options.delay) {
        const wait = gsap.timeline();
        wait.call(() => void playEffects(layer, list, { ...options, delay: 0 }), undefined, options.delay);
        return wait;
    }
    const bounds = layer.getBoundingClientRect();
    const { at } = options;
    let x = bounds.width / 2;
    let y = bounds.height / 2;
    let size = options.size ?? 300;
    if (at instanceof Element) {
        const box = at.getBoundingClientRect();
        x = box.left + box.width / 2 - bounds.left;
        y = box.top + box.height / 2 - bounds.top;
        size = options.size ?? (box.width || 300);
    }
    else if (at) {
        ({ x, y } = at);
    }
    const tone = options.tone ?? (getComputedStyle(layer).getPropertyValue("--rco-tone").trim() || "#ffffff");
    const accent = options.accent ?? tint(tone, 0.45);
    const subject = options.subject === undefined ? layer.parentElement : options.subject;
    // Never more than two pixels drawn for each one laid out. A phone that draws three keeps every part as a picture
    // nine times its laid-out size, and a show of a dozen parts, each wider than the screen, is then more than the
    // tab is allowed to hold. Laid out at two thirds and each drawn back up to size, the parts are as sharp as on
    // any laptop. Each part is scaled on its own, never the play as a whole: a part that blends with the page
    // (a tint, a glitch) could not see the page through a parent that was scaled.
    const render = Math.min(1, 2 / (window.devicePixelRatio || 1));
    const root = document.createElement("span");
    root.className = "rco-fx-play";
    root.setAttribute("aria-hidden", "true");
    root.style.setProperty("--rco-fx-x", `${x.toFixed(1)}px`);
    root.style.setProperty("--rco-fx-y", `${y.toFixed(1)}px`);
    root.style.setProperty("--rco-fx-u", `${(size * render).toFixed(1)}px`);
    // The same place as a part that covers the stage sees it: such a part is laid out smaller too.
    root.style.setProperty("--rco-fx-cx", `${(x * render).toFixed(1)}px`);
    root.style.setProperty("--rco-fx-cy", `${(y * render).toFixed(1)}px`);
    if (render < 1)
        root.style.setProperty("--rco-fx-up", (1 / render).toFixed(4));
    root.style.setProperty("--rco-fx-ratio", String(options.ratio ?? 4 / 3));
    root.style.setProperty("--rco-tone", tone);
    root.style.setProperty("--rco-fx-accent", accent);
    layer.append(root);
    const stage = {
        root,
        field: fieldOf(layer, options.blend ?? "add"),
        x,
        y,
        size,
        scale: size / 300,
        render,
        unit: size * render,
        ratio: options.ratio ?? 4 / 3,
        width: bounds.width,
        height: bounds.height,
        tone,
        accent,
        subject,
        random: options.random ?? Math.random,
    };
    const moved = subject !== null && list.some((effect) => effect.kind === "screen");
    const done = () => {
        root.remove();
        // Whatever a shake left the stage holding, it lets go of.
        if (moved && subject)
            gsap.set(subject, { x: 0, y: 0, rotate: 0, scale: 1, skewX: 0 });
    };
    const timeline = gsap.timeline({ onComplete: done, onInterrupt: done });
    for (const effect of list) {
        const own = gsap.timeline();
        effect.play(stage, atSize(own, 1 / render));
        // An effect made only of particles has nothing on its timeline but the moment it lets them go.
        own.to({}, { duration: effect.seconds }, 0);
        timeline.add(own, 0);
    }
    return timeline;
}
/** Host-clock integration: particles and DOM timelines pause and slow together. */
export function advanceEffects(layer, dt) { fields.get(layer)?.advance(dt); }
export function moveEffects(layer, x, y, dx, dy) {
    fields.get(layer)?.shift(dx, dy);
    for (const play of Array.from(layer.querySelectorAll(".rco-fx-play"))) {
        play.style.setProperty("--rco-fx-x", `${x}px`);
        play.style.setProperty("--rco-fx-y", `${y}px`);
        const up = Number(play.style.getPropertyValue("--rco-fx-up") || 1);
        play.style.setProperty("--rco-fx-cx", `${x / up}px`);
        play.style.setProperty("--rco-fx-cy", `${y / up}px`);
    }
}
