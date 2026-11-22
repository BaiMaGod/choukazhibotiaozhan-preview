/** Continuous card flight, using PRISM's spiral/depth relationships (MIT, 5a94862).
 * Positions are viewport coordinates: pouch mouth -> central orbit -> actual result slot.
 * A single actor owns this pose throughout; no replacement card is spawned for revealing.
 */
import { clamp } from '../vendor/prism-holo-pack/physics.js';
const smooth = (a, b, t) => { const u = clamp((t - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
export function orbitPose(index, age, space) {
    const t = Math.max(0, age - index * .03), u = smooth(0, .65, t);
    const angle = -Math.PI / 2 - index * Math.PI * 2 / 5 + Math.max(0, t - .18) * 2.2;
    const radius = Math.min(space.width * .25, space.height * .18) * smooth(.16, .65, t);
    const ring = { x: space.width * .5 + Math.cos(angle) * radius, y: space.height * .44 + Math.sin(angle) * radius * .3 };
    const sourceY = space.mouthY + space.cardHeight * .26;
    return { x: space.mouthX * (1 - u) + ring.x * u,
        y: sourceY * (1 - u) + ring.y * u - Math.sin(Math.PI * u) * space.cardHeight * .45,
        z: Math.sin(angle) * 90 * u, rx: 7 * u, ry: 180 - Math.cos(angle) * 24 * u, rz: -Math.cos(angle) * 8 * u,
        scale: .68 + u * .12 };
}
export const poseTransform = (p) => `translate3d(${p.x}px,${p.y}px,${p.z}px) translate(-50%,-50%) rotateZ(${p.rz}deg) rotateX(${p.rx}deg) rotateY(${p.ry}deg) scale(${p.scale})`;
/** Carries the current position and orbit tangent forward before smoothly contracting to a slot. */
export function landingPose(index, age, space, target, start, u, durationSec = .9) {
    const ring = orbitPose(index, age + u * durationSec, space), blend = smooth(.42, 1, u), flip = smooth(.02, .4, u);
    const growth = smooth(0, .26, u) * (1 - blend);
    if (u === 0)
        return { ...start };
    return { x: ring.x * (1 - blend) + target.x * blend, y: ring.y * (1 - blend) + target.y * blend,
        z: ring.z * (1 - blend), rx: ring.rx * (1 - blend), ry: 180 * (1 - flip) + (start.ry - 180) * (1 - smooth(0, .15, u)), rz: ring.rz * (1 - blend),
        scale: ring.scale * (1 - blend) + target.scale * blend + growth * .12 };
}
export function landingFrames(index, age, space, target, start, durationSec = .9) {
    return Array.from({ length: 73 }, (_, i) => ({ offset: i / 72, transform: poseTransform(landingPose(index, age, space, target, start, i / 72, durationSec)), opacity: 1 }));
}
