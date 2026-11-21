import { ejectionFrames } from '../vendor/prism-holo-pack/orbit.js';
import { SpringValue, stepSprings, clamp } from '../vendor/prism-holo-pack/physics.js';
import { advanceTear, shouldCompleteOnRelease } from '../vendor/prism-holo-pack/tear-geometry.js';
import { createPouchView } from './pouch-view.js';
import { createCardView } from './card-view.js';
import { createParticles } from './particles.js';
import { createFoilAudio } from './audio.js';
export const revealDuration = { N: 720, R: 800, SR: 1100, SSR: 1600, UR: 2100 };
export function createPrismPresentation(table, options = {}) {
    const root = document.createElement('div');
    root.className = 'pack-presentation prism-fx';
    root.setAttribute('aria-hidden', 'true');
    root.hidden = true;
    table.append(root);
    const stage = document.createElement('div');
    stage.className = 'prism-stage';
    root.append(stage);
    let pouch;
    let particles;
    const audio = options.audio ? createFoilAudio(options.audio) : undefined;
    const progress = new SpringValue(0, .1), zAngle = new SpringValue(0, .28, .35), xAngle = new SpringValue(0, .3, .2);
    let phase = 'hidden', direction = 1, theme = '', sealedUrl = '', packId = '', skippedPack = '';
    let drag;
    let animations = [], inFlight;
    let finish, tearReady, epoch = 0, raf = 0, last = 0, time = 0, previousProgress = 0;
    let width = 360, height = 300, openingAge = 0, paused = false, destroyed = false, reduceFlash = false;
    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const setPhase = (next) => { phase = next; root.dataset.phase = next; table.dataset.fxPhase = next; };
    function ensure() { if (pouch)
        return; pouch = createPouchView(stage); particles = createParticles(root); measure(); }
    function measure() {
        const r = table.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
            width = r.width;
            height = r.height;
            particles?.resize(width, height);
            const input = table.querySelector('#gesture');
            if (input && pouch) {
                const pw = pouch.el.offsetWidth, ph = pouch.el.offsetHeight;
                input.style.left = `${width * .5 - pw * .5}px`;
                input.style.right = 'auto';
                input.style.width = `${pw}px`;
                input.style.top = `${Math.max(0, height * .48 - ph * .5 - 5)}px`;
                input.style.height = `${Math.max(44, ph * .18)}px`;
            }
        }
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : undefined;
    observer?.observe(table);
    function start() { if (!raf && !paused && !document.hidden && !destroyed && phase !== 'hidden') {
        last = performance.now();
        raf = requestAnimationFrame(tick);
    } }
    function stop() { if (raf)
        cancelAnimationFrame(raf); raf = 0; audio?.setRip(0); }
    function tick(now) {
        raf = 0;
        if (paused || document.hidden || destroyed)
            return;
        const dt = Math.min(.05, Math.max(0, (now - last) / 1000));
        last = now;
        time += dt;
        stepSprings([progress, zAngle, xAngle], dt);
        const dp = Math.max(0, progress.x - previousProgress);
        previousProgress = progress.x;
        let fall = 0;
        if (phase === 'opening') {
            openingAge += dt;
            const t = Math.max(0, openingAge - .08);
            fall = t * height * .65 + t * t * height * 2;
        }
        const shape = pouch?.render(progress.x, zAngle.x, xAngle.x, reduced() ? 0 : time, fall);
        const packWidth = pouch?.el.offsetWidth ?? width * .45, packHeight = pouch?.el.offsetHeight ?? height * .8;
        const tipX = width * .5 - packWidth * .5 + (shape?.tipX ?? 0) / 100 * packWidth;
        const tipY = height * .48 - packHeight * .5 + (shape?.tipY ?? 12) / 100 * packHeight;
        const ejection = stage.querySelector('.prism-ejection');
        if (ejection)
            ejection.style.clipPath = `inset(0 0 ${Math.max(0, height - tipY - fall)}px 0)`;
        const tearing = phase === 'tearing' || phase === 'committing';
        if (tearing && dp > 0) {
            audio?.setRip(Math.pow(dp / Math.max(dt, .004) / 4, .6));
            if (!reduced() && !reduceFlash)
                particles?.emit(tipX, tipY, Math.min(4, Math.ceil(dp * 70)));
        }
        else
            audio?.setRip(0);
        const jetStrength = reduced() || reduceFlash ? 0 : phase === 'opening' ? Math.max(0, 1 - openingAge / 1.1) : tearing ? progress.x * .7 : 0;
        particles?.frame(dt, time, jetStrength > 0 ? { x: tipX, y: tipY, strength: jetStrength, packWidth, progress: progress.x, direction, released: phase === 'opening' ? openingAge : -1 } : undefined);
        root.dataset.progress = progress.x.toFixed(3);
        if (tearReady && progress.x >= .985) {
            const done = tearReady;
            tearReady = undefined;
            done();
        }
        if (phase !== 'hidden')
            start();
    }
    function releaseDestination() { inFlight?.classList.remove('card-in-flight'); inFlight = undefined; }
    function cancelPlay() { epoch++; const ready = tearReady; tearReady = undefined; ready?.(); for (const a of animations)
        a.cancel(); animations = []; stage.querySelectorAll('.prism-card, .prism-ejection').forEach(el => el.remove()); releaseDestination(); const done = finish; finish = undefined; done?.(); }
    function clear() { cancelPlay(); drag = undefined; audio?.dispose(); particles?.clear(); pouch?.hide(); root.hidden = true; setPhase('hidden'); stop(); table.classList.remove('prism-presenting'); }
    function settle(expected) { if (expected !== epoch)
        return; for (const a of animations)
        a.cancel(); animations = []; stage.querySelectorAll('.prism-card, .prism-ejection').forEach(el => el.remove()); releaseDestination(); pouch?.hide(); particles?.clear(); root.hidden = true; setPhase('results'); table.classList.remove('prism-presenting'); stop(); const done = finish; finish = undefined; done?.(); }
    function completeTear() { if (phase === 'committing' || phase === 'opening' || phase === 'revealing')
        return; drag = undefined; progress.to = 1; setPhase('committing'); audio?.setRip(0); options.onOpen?.(); start(); }
    function syncSealed(url, key, enabled) {
        if (!url || !enabled) {
            if (phase === 'sealed' || phase === 'tearing') {
                drag = undefined;
                root.hidden = true;
                setPhase('hidden');
                stop();
            }
            return;
        }
        ensure();
        if (theme !== key || phase === 'hidden' || phase === 'results') {
            cancelPlay();
            theme = key;
            sealedUrl = url;
            progress.reset();
            zAngle.reset();
            xAngle.reset();
            previousProgress = 0;
            pouch.reset();
            pouch.setImage(url);
            pouch.show();
            setPhase('sealed');
        }
        root.hidden = false;
        table.classList.add('prism-presenting');
        measure();
        start();
    }
    function pointerDown(e) { if (!['sealed', 'tearing'].includes(phase) || drag || e.button !== 0)
        return false; ensure(); drag = { id: e.pointerId, x: e.clientX, y: e.clientY, start: progress.to, moved: false }; setPhase('tearing'); start(); return true; }
    function pointerMove(e) {
        if (!drag || drag.id !== e.pointerId || phase !== 'tearing')
            return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved) {
            if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy) * .5)
                return;
            drag.moved = true;
            if (drag.start === 0) {
                direction = dx < 0 ? -1 : 1;
                pouch?.setDirection(direction);
            }
        }
        const pw = pouch?.el.offsetWidth ?? width * .45;
        progress.to = advanceTear(drag.start, dx, pw, direction, progress.to);
        zAngle.to = 6 + progress.to * 14 + clamp(-dy * .16, -6, 22);
        xAngle.to = -(8 + progress.to * 22) - clamp(-dy * .2, 0, 24);
        pouch?.steer(clamp(dy / Math.max(60, Math.abs(dx)), -.7, .7) * (pw / (pouch.el.offsetHeight || 1)), progress.x);
        if (progress.to >= 1)
            completeTear();
    }
    function pointerEnd(e, cancelled = false) {
        if (!drag || drag.id !== e.pointerId)
            return;
        const moved = drag.moved;
        drag = undefined;
        audio?.setRip(0);
        if (moved && !cancelled && shouldCompleteOnRelease(progress.to)) {
            completeTear();
            return;
        }
        zAngle.to = 3 + progress.to * 10;
        xAngle.to = -progress.to * 14;
        setPhase(progress.to > 0 ? 'tearing' : 'sealed');
        start();
    }
    function failOpen() { if (phase !== 'committing')
        return; progress.to = Math.min(progress.to, .5); zAngle.to = 3; xAngle.to = -7; setPhase('tearing'); start(); }
    function waitAnimations(expected) { return Promise.all(animations.map(a => a.finished.catch(() => { }))).then(() => settle(expected)); }
    function animate(el, frames, duration, delay = 0) { const a = el.animate(frames, { duration, delay, fill: 'both', easing: 'cubic-bezier(.2,.72,.22,1)' }); animations.push(a); return a; }
    async function play(id, kind, url, rarity = 'N', slot, soft = false) {
        cancelPlay();
        if (id === skippedPack)
            return;
        ensure();
        const current = epoch;
        packId = id;
        reduceFlash = soft;
        root.classList.toggle('soft-light', soft || reduced());
        root.hidden = false;
        table.classList.add('prism-presenting');
        const promise = new Promise(resolve => { finish = resolve; });
        if (kind === 'rip') {
            pouch.setImage(url || sealedUrl);
            pouch.show();
            progress.to = 1;
            setPhase('committing');
            start();
            if (!reduced() && progress.x < .985)
                await new Promise(resolve => { tearReady = resolve; });
            if (current !== epoch) {
                await promise;
                return;
            }
            setPhase('opening');
            openingAge = 0;
            pouch.setImage(url || sealedUrl);
            pouch.show();
            progress.reset(1);
            previousProgress = 1;
            zAngle.reset(14);
            xAngle.reset(-26);
            pouch.setDirection(direction);
            pouch.flyStrip(direction);
            options.onSound?.('open');
            if (!reduced() && !soft)
                particles?.burst(width * .5, height * .22, '#ffd77b');
            const backUrl = './assets/ui/card-back.webp';
            const ejection = document.createElement('div');
            ejection.className = 'prism-ejection';
            stage.append(ejection);
            for (let i = 0; i < 5; i++) {
                const card = createCardView({ url: backUrl, rarity: 'N' });
                ejection.append(card);
                const s = Math.min(1, (width / 6) / (height * .5 * .75)), targetX = (i - 2) * Math.min(width * .17, 80);
                animate(card, reduced() ? [{ opacity: 0 }, { opacity: 0 }] : ejectionFrames(i, width, height, s), reduced() ? 180 : 1400, i * (reduced() ? 0 : 22));
            }
        }
        else {
            setPhase('revealing');
            pouch?.hide();
            inFlight = slot;
            slot?.classList.add('card-in-flight');
            const visual = options.card?.(url, rarity) ?? { url, rarity };
            const card = createCardView(visual);
            stage.append(card);
            root.dataset.rarity = rarity;
            const box = table.getBoundingClientRect(), target = slot?.getBoundingClientRect();
            const dx = target ? target.left + target.width / 2 - box.left - box.width / 2 : 0;
            const dy = target ? target.top + target.height / 2 - box.top - box.height / 2 : 0;
            const ch = height * .76, cw = ch * .75, scale = target ? Math.min(target.width / cw, target.height / ch) : .7;
            const end = `translate3d(calc(-50% + ${dx}px),calc(-50% + ${dy}px),0) rotateY(0deg) scale(${scale})`;
            animate(card, reduced() ? [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }] : [
                { transform: 'translate3d(-50%,-20%,0) rotateY(180deg) scale(.84)', opacity: 0 },
                { transform: 'translate3d(-50%,-50%,30px) rotateY(180deg) scale(.96)', opacity: 1, offset: .14 },
                { transform: 'translate3d(-50%,-50%,50px) rotateY(90deg) scale(1)', opacity: 1, offset: .3 },
                { transform: 'translate3d(-50%,-50%,30px) rotateY(-7deg) scale(1)', opacity: 1, offset: .48 },
                { transform: 'translate3d(-50%,-50%,0) rotateY(0deg) scale(1)', opacity: 1, offset: .78 },
                { transform: end, opacity: 1 }
            ], reduced() ? 180 : revealDuration[rarity]);
            // A timeline effect callback rather than a wall timer: paused/skip cannot emit late sounds.
            const cue = document.createElement('i');
            cue.className = 'prism-cue';
            stage.append(cue);
            const cueAnimation = animate(cue, [{ opacity: 0 }, { opacity: 0 }], reduced() ? 0 : revealDuration[rarity] * .32);
            void cueAnimation.finished.then(() => { if (epoch !== current)
                return; options.onSound?.('reveal', rarity); card.classList.add('prism-front-visible'); if (!reduced() && !soft && rarity !== 'N' && rarity !== 'R')
                particles?.burst(width * .5, height * .45, rarity === 'UR' ? '#baacff' : '#ffd77b'); }).catch(() => { }).finally(() => cue.remove());
        }
        if (paused || document.hidden)
            for (const a of animations)
                a.pause();
        start();
        void waitAnimations(current);
        await promise;
    }
    function setPaused(value) { if (value === paused)
        return; paused = value; root.dataset.paused = String(value); if (value) {
        stop();
        for (const a of animations)
            a.pause();
    }
    else {
        for (const a of animations)
            a.play();
        start();
    } }
    const visibility = () => { if (document.hidden) {
        stop();
        for (const a of animations)
            a.pause();
    }
    else if (!paused) {
        for (const a of animations)
            a.play();
        start();
    } };
    document.addEventListener('visibilitychange', visibility);
    return { play, clear, syncSealed, pointerDown, pointerMove, pointerEnd, failOpen, setPaused,
        skip(id) { skippedPack = id; clear(); }, skipped: (id) => skippedPack === id,
        destroy() { destroyed = true; clear(); observer?.disconnect(); audio?.dispose(); pouch?.destroy(); particles?.destroy(); document.removeEventListener('visibilitychange', visibility); root.remove(); },
        get state() { return { phase, progress: progress.to, packId, particles: particles?.count ?? 0 }; } };
}
