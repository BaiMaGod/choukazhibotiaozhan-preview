/** PRISM's steerable 96-vertex foil edge, adapted to container-local coordinates. MIT. */
import { clamp } from './physics.js?v=b15ac23b';
export const TEAR_SEGMENTS = 96;
const mix = (a, b, random) => a + (b - a) * random();
export function createTearLine(random = Math.random) {
    const slope = mix(-5, 5, random), arch = mix(-2.2, 2.2, random);
    const frequency = mix(1.6, 3.4, random), phase = random() * Math.PI * 2;
    const amplitude = mix(.3, 1.05, random), start = mix(11.2, 13.8, random);
    let drift = 0;
    return Array.from({ length: TEAR_SEGMENTS + 1 }, (_, i) => {
        const x = i / TEAR_SEGMENTS * 100, nx = x / 50 - 1;
        drift = clamp(drift + mix(-.24, .24, random), -2.1, 2.1);
        const base = start + slope * nx + arch * (1 - nx * nx) + amplitude * Math.sin(nx * frequency * Math.PI + phase) + drift;
        const tooth = mix(-.4, .4, random) + (random() < .14 ? mix(-1.15, 1.15, random) : 0);
        return { x, base, tooth, y: clamp(base, 8, 19.5) + tooth, lip: mix(.36, 1.08, random), bend: 0 };
    });
}
export function tearYAt(line, x) {
    const f = clamp(x, 0, 100) / 100 * TEAR_SEGMENTS;
    const i = Math.min(TEAR_SEGMENTS - 1, Math.floor(f));
    return line[i].y + (line[i + 1].y - line[i].y) * (f - i);
}
export function steerRemainingTear(line, slope, progress, dir) {
    const pivot = clamp(Math.round((dir > 0 ? progress : 1 - progress) * TEAR_SEGMENTS), 0, TEAR_SEGMENTS);
    for (let i = pivot + dir; i >= 0 && i <= TEAR_SEGMENTS; i += dir) {
        const distance = Math.abs(i - pivot) * 100 / TEAR_SEGMENTS;
        line[i].bend = line[pivot].bend + slope * distance;
        line[i].y = clamp(line[i].base + line[i].bend, 8, 19.5) + line[i].tooth;
    }
}
export const polygon = (points) => `polygon(${points.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(',')})`;
export function tearShape(line, progress, dir) {
    const tipX = dir > 0 ? progress * 100 : 100 - progress * 100;
    const tipY = tearYAt(line, tipX);
    const torn = line.filter(q => dir > 0 ? q.x < tipX : q.x > tipX).map(q => [q.x, q.y]);
    const edge = dir > 0 ? [...torn, [tipX, tipY]] : [[tipX, tipY], ...torn];
    const body = dir > 0 ? [[tipX, 0], [100, 0], [100, 100], [0, 100], ...torn, [tipX, tipY]]
        : [[0, 0], [tipX, 0], [tipX, tipY], ...torn, [100, 100], [0, 100]];
    const lip = [...edge, ...edge.slice().reverse().map(([x, y]) => [x, y + .7])];
    return { tipX, tipY, body: polygon(body), lip: polygon(lip) };
}
/** Physical tear is irreversible; cancelling returns pose, not the torn material. */
export function advanceTear(start, dx, width, dir, current) {
    const distance = start > 0 ? Math.abs(dx) : dx * dir;
    return clamp(Math.max(current, start + distance / Math.max(1, width * .85)), 0, 1);
}
export const shouldCompleteOnRelease = (progress) => progress > .54;
