/** Sampled form of PRISM beginCardOrbit / stepCardOrbit (MIT, 5a94862).
 * Local coordinates and original game result slots replace viewport fan coordinates.
 * Sampling once lets the browser compositor run the path without per-frame DOM reads.
 */
import { clamp } from './physics.js?v=46ab8b57';
const smoothStep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function ejectionFrames(index, width, height, scale) {
    const targetX = (index - 2) * Math.min(width * .17, 80), duration = 1.4, orbitStart = .18;
    const ejectVy = -height * 1.8, startY = height * .35 + ejectVy * orbitStart, ringAngle = -index * 2 * Math.PI / 5, endAngle = Math.PI / 2 - (index - 2) * .55;
    const radius = Math.min(width * .33, 430);
    const out = [];
    for (let frame = 0; frame <= 84; frame++) {
        const t = frame / 84 * duration;
        let x = 0, y = height * .35 + ejectVy * t, z = -8, rz = 0, ry = 180, rx = 0, s = .68;
        if (t >= orbitStart) {
            const u = clamp((t - orbitStart) / 1.22, 0, 1), turn = 1 - (1 - u) ** 2, blend = smoothStep(.52, 1, u);
            const ringWeight = Math.sin(Math.min(1, u / .42) * Math.PI / 2) * (1 - blend);
            const angle = endAngle + (1 - turn) * (ringAngle - endAngle + Math.PI * 2.5);
            const sa = Math.sin(angle), ca = Math.cos(angle);
            const decel = startY + ejectVy / 9 * (1 - Math.exp(-9 * (t - orbitStart)));
            const center = decel + (-height * .025 - decel) * smoothStep(0, .42, u);
            x = targetX * blend + ca * radius * ringWeight;
            y = center * (1 - blend);
            z = sa * 60 * ringWeight - 8 * (1 - blend);
            rz = (index - 2) * 2 * blend - ca * 8 * ringWeight;
            ry = 180 - ca * 26 * ringWeight;
            rx = 7 * ringWeight;
            s = .68 + (scale - .68) * blend;
        }
        out.push({ offset: frame / 84, transform: `translate3d(calc(-50% + ${x}px),calc(-50% + ${y}px),${z}px) rotateZ(${rz}deg) rotateX(${rx}deg) rotateY(${ry}deg) scale(${s})`, opacity: frame < 5 ? frame / 5 : frame > 79 ? (84 - frame) / 5 : 1 });
    }
    return out;
}
