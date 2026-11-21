import { createLightJet } from '../vendor/prism-holo-pack/light-jet.js?v=6e6c95b0-r2';
/** PRISM-style local sparks, wave ribbons and concentric rare-card rings. */
export function createParticles(host) {
    const canvas = document.createElement('canvas');
    canvas.className = 'prism-particles';
    host.append(canvas);
    const ctx = canvas.getContext('2d');
    const lightJet = createLightJet();
    let sparks = [], rings = [];
    let width = 1, height = 1, dpr = 1;
    const colors = ['#fff5de', '#ffd87e', '#ff7cbb', '#a8e6ff', '#be91ff'];
    function resize(w, h) { width = w; height = h; dpr = Math.min(devicePixelRatio || 1, 1.5); canvas.width = Math.max(1, Math.ceil(w * dpr)); canvas.height = Math.max(1, Math.ceil(h * dpr)); }
    function emit(x, y, count = 3, color) { for (let i = 0; i < count && sparks.length < 140; i++) {
        const a = Math.random() * Math.PI * 2, s = 25 + Math.random() * 100;
        sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 50, age: 0, life: .25 + Math.random() * .5, color: color ?? colors[i % colors.length], size: 1 + Math.random() * 2 });
    } }
    function burst(x, y, color = '#ffd77b') { emit(x, y, 36, color); for (let i = 0; i < 3; i++)
        rings.push({ x, y, age: -i * .07, color }); }
    function frame(dt, time, jet) {
        if (!ctx)
            return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        if (jet && jet.strength > .01)
            lightJet.draw(ctx, width, height, dt, time, jet);
        sparks = sparks.filter(s => { s.age += dt; if (s.age >= s.life)
            return false; s.vy += 180 * dt; s.x += s.vx * dt; s.y += s.vy * dt; ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.age * 3); ctx.globalAlpha = 1 - s.age / s.life; ctx.fillStyle = s.color; ctx.beginPath(); ctx.moveTo(0, -s.size * 2); ctx.lineTo(s.size * .5, -s.size * .5); ctx.lineTo(s.size * 2, 0); ctx.lineTo(s.size * .5, s.size * .5); ctx.lineTo(0, s.size * 2); ctx.lineTo(-s.size * .5, s.size * .5); ctx.lineTo(-s.size * 2, 0); ctx.lineTo(-s.size * .5, -s.size * .5); ctx.closePath(); ctx.fill(); ctx.restore(); return true; });
        rings = rings.filter(r => { r.age += dt; if (r.age < 0)
            return true; if (r.age > .7)
            return false; ctx.globalAlpha = Math.pow(1 - r.age / .7, 1.6) * .7; ctx.strokeStyle = r.color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(r.x, r.y, (1 - Math.pow(1 - r.age / .7, 3)) * width * .4, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; return true; });
    }
    return { resize, emit, burst, frame, clear() { lightJet.reset(); sparks = []; rings = []; ctx?.clearRect(0, 0, canvas.width, canvas.height); }, destroy() { canvas.remove(); sparks = []; rings = []; }, get count() { return sparks.length + rings.length; } };
}
