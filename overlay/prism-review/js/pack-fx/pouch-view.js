import { clamp } from '../vendor/prism-holo-pack/physics.js?v=fccaace3';
import { createTearLine, polygon, tearShape, tearYAt, steerRemainingTear } from '../vendor/prism-holo-pack/tear-geometry.js?v=fccaace3';
function part(name, host) {
    const el = document.createElement('div');
    el.className = name;
    host.append(el);
    return el;
}
export function createPouchView(host) {
    const shadow = part('prism-ground', host);
    const pouch = part('prism-pouch', host);
    const back = part('prism-pouch-back', pouch);
    const front = part('prism-pouch-front', pouch);
    const lip = part('prism-pouch-lip', pouch);
    const foil = part('prism-strip', pouch);
    const hint = part('prism-grab-hint', pouch);
    hint.textContent = '← 撕开封口 →';
    const count = matchMedia('(pointer: coarse)').matches ? 8 : 12;
    const segments = Array.from({ length: count }, () => {
        const el = part('prism-strip-segment', foil);
        return { el, face: part('prism-strip-face', el), lining: part('prism-strip-lining', el) };
    });
    let line = createTearLine(), url = '', direction = 1;
    function setImage(next) {
        if (next === url)
            return;
        url = next;
        const safe = `url(${JSON.stringify(new URL(next, document.baseURI).href)})`;
        pouch.style.setProperty('--pouch-art', safe);
        line = createTearLine();
        render(0, 0, 0, 0);
    }
    function render(progress, zAngle, xAngle, clock, fall = 0) {
        const p = clamp(progress, 0, 1);
        hint.style.opacity = p > .02 ? "0" : "1";
        const shape = tearShape(line, p, direction);
        front.style.clipPath = p > 0 ? shape.body : '';
        back.style.clipPath = p > 0 ? shape.body : '';
        lip.style.clipPath = p > 0 ? shape.lip : 'polygon(0 0,0 0,0 0)';
        pouch.style.setProperty('--foil-x', `${50 + Math.sin(clock * .8) * 13}%`);
        pouch.style.setProperty('--pouch-fall', `${fall}px`);
        foil.style.transformOrigin = `${shape.tipX}% ${shape.tipY}%`;
        foil.style.transform = `rotateZ(${zAngle * direction}deg) rotateX(${xAngle}deg)`;
        const width = pouch.offsetWidth || 180;
        const sliceWidth = 100 / count;
        const active = clamp(Math.floor((direction > 0 ? shape.tipX - 1e-6 : shape.tipX) / sliceWidth), 0, count - 1);
        for (let i = 0; i < count; i++) {
            const lo = direction > 0 ? i * sliceWidth : Math.max(i * sliceWidth, shape.tipX);
            const hi = direction > 0 ? Math.min((i + 1) * sliceWidth, shape.tipX) : (i + 1) * sliceWidth;
            const seg = segments[i];
            seg.el.hidden = hi <= lo || p === 0;
            if (seg.el.hidden)
                continue;
            const left = Math.max(0, lo - .15), right = Math.min(100, hi + .15);
            const points = [[left, tearYAt(line, left)], ...line.filter(q => q.x > left && q.x < right).map(q => [q.x, q.y]), [right, tearYAt(line, right)]];
            const flap = [[left, 0], [right, 0], ...points.slice().reverse()];
            seg.face.style.clipPath = polygon(flap);
            seg.lining.style.clipPath = polygon(flap.map(([x, y]) => [100 - x, y]));
        }
        let chain = '', total = 0;
        for (let n = 0, k = active; k >= 0 && k < count; n++, k -= direction) {
            const hinge = ((n ? (direction > 0 ? k + 1 : k) * sliceWidth : shape.tipX) / 100) * width;
            const angle = direction * ((2.6 + 2.6 * p) * (.4 + .3 * n) + Math.sin(clock * 16 + n * .9) * Math.min(.7, Math.abs(xAngle) * .025));
            total += angle;
            chain += `translateX(${hinge}px) rotateY(${angle}deg) rotateZ(${direction * .225 * n}deg) translateX(${-hinge}px) `;
            segments[k].el.style.transform = chain;
            segments[k].el.style.setProperty('--curl-shade', String(Math.min(.6, Math.abs(total) / 160)));
        }
        pouch.style.transform = `translate3d(-50%,calc(-50% + ${fall}px),0) rotateX(${Math.sin(clock * .7) * 2}deg) rotateY(${Math.sin(clock * .6) * 5}deg) rotateZ(${-direction * p * 2}deg)`;
        shadow.style.opacity = String(Math.max(0, .65 - fall / 180));
        shadow.style.transform = `translate(-50%,-50%) scale(${1 + p * .04})`;
        return shape;
    }
    return { el: pouch, shadow, setImage, render,
        setDirection(value) { direction = value; },
        steer(slope, progress) { steerRemainingTear(line, slope, progress, direction); },
        reset() { line = createTearLine(); direction = 1; pouch.hidden = false; foil.classList.remove('prism-strip-flying'); render(0, 0, 0, 0); },
        flyStrip(dir) { foil.classList.add('prism-strip-flying'); foil.style.setProperty('--strip-dir', String(dir)); },
        hide() { pouch.hidden = true; shadow.hidden = true; },
        show() { pouch.hidden = false; shadow.hidden = false; },
        destroy() { pouch.remove(); shadow.remove(); } };
}
