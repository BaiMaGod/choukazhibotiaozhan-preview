const imageReady = new Map();
function loadImage(url) {
    let pending = imageReady.get(url);
    if (!pending) {
        pending = new Promise(resolve => { const image = new Image(); image.onload = () => { if (image.decode)
            void image.decode().then(() => resolve(true), () => resolve(false));
        else
            resolve(true); }; image.onerror = () => resolve(false); image.src = url; });
        imageReady.set(url, pending);
    }
    return pending;
}
export function warmCardVisual(card) {
    if (typeof Image === 'undefined')
        return Promise.resolve(false);
    return Promise.all([card.background, card.subject].filter((url) => !!url).map(loadImage)).then(results => results.every(Boolean));
}
/** Start with a complete flat card if its two registered layers cannot be decoded in time. */
export async function prepareCardVisual(card) {
    if (!card.background || !card.subject || typeof Image === 'undefined')
        return card;
    let timer;
    const ready = await Promise.race([warmCardVisual(card), new Promise(resolve => { timer = setTimeout(() => resolve(false), 1200); })]);
    if (timer !== undefined)
        clearTimeout(timer);
    return ready ? card : { ...card, background: undefined, subject: undefined };
}
export function createCardView(card) {
    const el = document.createElement('div');
    el.className = 'prism-card';
    el.dataset.rarity = card.rarity;
    const back = document.createElement('div');
    back.className = 'prism-card-back';
    const face = document.createElement('div');
    face.className = 'prism-card-face';
    const art = document.createElement('img');
    art.className = 'prism-card-art';
    art.alt = '';
    art.src = card.background ?? card.url;
    face.append(art);
    for (const kind of ['holo', 'glare', 'clearcoat']) {
        const layer = document.createElement('i');
        layer.className = `prism-${kind}`;
        face.append(layer);
    }
    if (card.subject) {
        const subject = document.createElement('img');
        subject.src = card.subject;
        subject.alt = '';
        subject.className = 'prism-card-subject';
        face.append(subject);
        el.dataset.layered = 'true';
    }
    if (card.name) {
        const caption = document.createElement('div');
        caption.className = 'prism-card-caption';
        const name = document.createElement('b');
        name.textContent = card.name;
        const grade = document.createElement('span');
        grade.textContent = card.rarity;
        caption.append(name, grade);
        face.append(caption);
    }
    el.append(back, face);
    return el;
}
/** Attach to existing results without replacing their accessible labels or click handlers. */
export function decorateResult(slot) {
    slot.classList.add('prism-result');
    if (!slot.querySelector('.prism-result-foil')) {
        const foil = document.createElement('i');
        foil.className = 'prism-result-foil';
        foil.setAttribute('aria-hidden', 'true');
        slot.append(foil);
    }
}
export function attachCardTilt(host) {
    let active;
    const update = (x, y) => {
        const r = host.getBoundingClientRect();
        const nx = Math.max(-1, Math.min(1, (x - r.left) / r.width * 2 - 1));
        const ny = Math.max(-1, Math.min(1, (y - r.top) / r.height * 2 - 1));
        host.style.setProperty('--tilt-y', `${nx * 16}deg`);
        host.style.setProperty('--tilt-x', `${-ny * 12}deg`);
        host.style.setProperty('--foil-x', `${50 + nx * 45}%`);
        host.style.setProperty('--foil-y', `${50 + ny * 45}%`);
    };
    const down = (e) => { if (e.button !== 0 || active !== undefined)
        return; active = e.pointerId; host.setPointerCapture(e.pointerId); update(e.clientX, e.clientY); };
    const move = (e) => { if (e.pointerType === 'mouse' || active === e.pointerId)
        update(e.clientX, e.clientY); };
    const reset = () => { active = undefined; host.style.setProperty('--tilt-y', '0deg'); host.style.setProperty('--tilt-x', '0deg'); };
    host.addEventListener('pointerdown', down);
    host.addEventListener('pointermove', move);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave'])
        host.addEventListener(name, reset);
    return () => { host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move); for (const name of ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave'])
        host.removeEventListener(name, reset); reset(); };
}
