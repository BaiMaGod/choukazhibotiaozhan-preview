export const REVEAL_SHOWS = {
    SR: { windup: .25, flip: .25, hold: .55, land: .55, zoom: 1.25, dim: .38 },
    SSR: { windup: .45, flip: .3, hold: 1, land: .65, zoom: 1.35, dim: .58 },
    UR: { windup: .6, flip: .3, hold: 1.5, land: .7, zoom: 1.45, dim: .76 },
};
export const showDuration = (s) => s.windup + s.flip + s.hold + s.land;
const clamp = (t) => Math.max(0, Math.min(1, t));
const ease = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
/** Re-time the existing path: keep its exact start/end and hold its front-facing pose before landing. */
export function sampleRevealShow(s, seconds) {
    const t = clamp(seconds / showDuration(s)) * showDuration(s), turn = t - s.windup;
    const landing = s.windup + s.flip + s.hold;
    const motion = t >= showDuration(s) ? 1 : t < s.windup ? 0 : t < s.windup + s.flip ? .4 * clamp(turn / s.flip) : t < landing ? .4 : .4 + .6 * clamp((t - landing) / s.land);
    const emphasis = t >= showDuration(s) ? 0 : ease(t / Math.max(.01, s.windup)) * (1 - ease((t - landing) / s.land));
    return { motion, focus: emphasis, zoom: 1 + (s.zoom - 1) * emphasis, dim: s.dim * emphasis,
        revealed: t >= s.windup + s.flip * .7, landing: t >= landing, seconds: t };
}
/** Smooth focus offset on the original path, never a teleport or a replacement actor. */
export function focusRevealPose(p, s, width, height) {
    return { ...p, x: p.x + (width * .5 - p.x) * s.focus, y: p.y + (height * .44 - p.y) * s.focus,
        z: p.z + (40 - p.z) * s.focus, rx: p.rx * (1 - s.focus), rz: p.rz * (1 - s.focus), scale: p.scale * s.zoom };
}
