/** PRISM pointAlongEdge / 32 adjacent wave ribbons, ported from SVG to local Canvas2D. MIT. */
import { SpringValue, stepSprings, clamp } from './physics.js?v=6e6c95b0';
const palette = ['#ff3d6e', '#ff8a3d', '#ffd34d', '#4fd9a0', '#4fb2ff', '#8b6cff', '#ff5cc8'];
export function createLightJet() {
    const growth = Array.from({ length: 32 }, () => new SpringValue(0, .4, .3));
    let lastProgress = 0;
    function draw(ctx, width, height, dt, time, jet) {
        if (jet.progress < lastProgress - .1)
            for (const g of growth)
                g.reset();
        lastProgress = jet.progress;
        const unit = jet.packWidth / 100, left = width * .5 - jet.packWidth * .5, tip = jet.direction > 0 ? jet.progress * 100 : 100 - jet.progress * 100;
        for (let i = 0; i < 32; i++)
            growth[i].to = (jet.released >= 0 || (jet.direction > 0 ? (i + .5) / 32 * 100 < tip : (i + .5) / 32 * 100 > tip)) ? 1 : 0;
        stepSprings(growth, dt);
        const radius = 45, reach = Math.max(35, jet.y / unit + 26), sway = Math.sin(time * .9) * 1.5;
        const carry = jet.released < 0 ? 0 : 45 * jet.released * jet.released / (jet.released + .25);
        const tail = jet.released < 0 ? 0 : reach * Math.pow(clamp((jet.released - .35) / .55, 0, 1), 2);
        const edges = Array.from({ length: 33 }, (_, i) => { const x = 3 + 94 * i / 32, angle = Math.atan2(x - 50, radius); return { x, ux: Math.sin(angle), uy: -Math.cos(angle), phase: i * .35 }; });
        const point = (i, d) => { const e = edges[i], k = Math.min(1, d / 90); const wave = (.4 + 2 * k) * Math.sin(((d - carry) / 22 - time * 1.4) * Math.PI * 2 + e.phase) + sway * k; return [left + (e.x + e.ux * d - e.uy * wave) * unit, jet.y + (e.uy * d + e.ux * wave) * unit]; };
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = jet.strength * .58;
        for (let i = 0; i < 32; i++) {
            const len = reach * Math.max(0, growth[i].x);
            if (len <= tail + 2)
                continue;
            const a = [], b = [];
            for (let d = tail; d < len; d += 3.5) {
                a.push(point(i, d));
                b.push(point(i + 1, d));
            }
            a.push(point(i, len));
            b.push(point(i + 1, len));
            ctx.beginPath();
            ctx.moveTo(a[0][0], a[0][1]);
            for (const p of a)
                ctx.lineTo(p[0], p[1]);
            for (const p of b.reverse())
                ctx.lineTo(p[0], p[1]);
            ctx.closePath();
            const gradient = ctx.createLinearGradient(jet.x, jet.y, jet.x, Math.max(0, jet.y - reach * unit));
            gradient.addColorStop(0, '#fff5d8');
            gradient.addColorStop(.14, palette[i % 7]);
            gradient.addColorStop(.88, palette[i % 7] + 'bb');
            gradient.addColorStop(1, palette[i % 7] + '00');
            ctx.fillStyle = gradient;
            ctx.fill();
            ctx.strokeStyle = '#ffffff44';
            ctx.lineWidth = .4;
            ctx.stroke();
        }
        ctx.restore();
    }
    return { draw, reset() { for (const g of growth)
            g.reset(); lastProgress = 0; } };
}
