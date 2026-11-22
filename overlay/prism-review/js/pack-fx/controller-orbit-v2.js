import { orbitPose, landingPose, poseTransform } from './flight-path-v2.js?v=7b99f707';
import { SpringValue, stepSprings, clamp } from '../vendor/prism-holo-pack/physics.js';
import { advanceTear, shouldCompleteOnRelease } from '../vendor/prism-holo-pack/tear-geometry.js';
import { createPouchView } from './pouch-view.js';
import { createCardView, prepareCardVisual } from './card-view.js';
import { createParticles } from './particles.js';
import { createFoilAudio } from './audio.js';
import { cardBackArt } from './resources.js';
export const revealDuration = { N: 720, R: 800, SR: 1100, SSR: 1600, UR: 2100 };
export function createPrismPresentation(table, options = {}) {
    // Slow playback is confined to the isolated five-grade sample QA route.
    const qaParams = typeof location === 'undefined' ? undefined : new URLSearchParams(location.search);
    const playbackRate = qaParams?.get('demo') === '1' && qaParams.get('fxSlow') === '1' ? .25 : 1;
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
    let actors = [], flightSpace = { width: 360, height: 640, cardHeight: 210, mouthX: 180, mouthY: 400 }, flightAge = 0;
    const flight = document.createElement('div');
    flight.className = 'prism-flight';
    flight.hidden = true;
    flight.setAttribute('aria-hidden', 'true');
    (document.body ?? table).append(flight);
    let animations = [], inFlight;
    let finish, tearReady, epoch = 0, raf = 0, last = 0, time = 0, previousProgress = 0;
    let width = 360, height = 300, openingAge = 0, seamAge = 0, paused = false, destroyed = false, reduceFlash = false;
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
        const elapsed = Math.max(0, (now - last) / 1000), dt = Math.min(.05, elapsed);
        last = now;
        time += dt;
        if (actors.length) {
            flightAge += elapsed * playbackRate;
            if (typeof innerWidth === 'number') {
                flightSpace.width = innerWidth;
                flightSpace.height = innerHeight;
            }
            for (const actor of actors)
                if (!actor.landed) {
                    if (actor.landing && actor.start && actor.animation) {
                        const u = clamp(Number(actor.animation.currentTime ?? 0) / (actor.duration ?? 1), 0, 1);
                        actor.pose = landingPose(actor.index, actor.startAge ?? 0, flightSpace, slotPose(actor.slot), actor.start, u, (actor.duration ?? 900) / 1000 * playbackRate);
                    }
                    else
                        actor.pose = orbitPose(actor.index, flightAge, flightSpace);
                    actor.el.style.transform = poseTransform(actor.pose);
                    actor.el.dataset.side = Math.cos(actor.pose.ry * Math.PI / 180) > 0 ? 'front' : 'back';
                    actor.el.style.zIndex = actor.landing ? '300' : String(100 + Math.round(actor.pose.z));
                }
            if (flightAge > .35)
                flight.style.clipPath = 'none';
        }
        stepSprings([progress, zAngle, xAngle], dt);
        if (phase === 'committing')
            seamAge += elapsed;
        const dp = Math.max(0, progress.x - previousProgress);
        previousProgress = progress.x;
        let fall = 0;
        if (phase === 'opening') {
            openingAge += elapsed * playbackRate;
            const t = Math.max(0, openingAge - .08);
            fall = t * height * .65 + t * t * height * 2;
        }
        const shape = pouch?.render(progress.x, zAngle.x, xAngle.x, reduced() ? 0 : time, fall);
        const packWidth = pouch?.el.offsetWidth ?? width * .45, packHeight = pouch?.el.offsetHeight ?? height * .8;
        const tipX = width * .5 - packWidth * .5 + (shape?.tipX ?? 0) / 100 * packWidth;
        const tipY = height * .48 - packHeight * .5 + (shape?.tipY ?? 12) / 100 * packHeight;
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
        if (tearReady && (progress.x >= .985 || seamAge >= .35)) {
            progress.reset(1);
            const done = tearReady;
            tearReady = undefined;
            done();
        }
        if (phase !== 'hidden')
            start();
    }
    function releaseDestination() { inFlight?.classList.remove('card-in-flight'); inFlight = undefined; delete table.dataset.fxReveal; }
    function removeActors() { for (const actor of actors) {
        actor.el.remove();
        actor.slot?.classList.remove('prism-has-landed');
    } actors = []; flight.hidden = true; }
    function cancelPlay(preserveActors = false) { epoch++; const ready = tearReady; tearReady = undefined; ready?.(); for (const a of animations)
        a.cancel(); animations = []; if (!preserveActors)
        removeActors(); releaseDestination(); const done = finish; finish = undefined; done?.(); }
    function clear() { cancelPlay(); delete table.dataset.fxSequence; drag = undefined; audio?.dispose(); particles?.clear(); pouch?.hide(); root.hidden = true; setPhase('hidden'); stop(); table.classList.remove('prism-presenting'); }
    function settle(expected, keepOrbit = false) {
        if (expected !== epoch)
            return;
        for (const a of animations)
            a.cancel();
        animations = [];
        releaseDestination();
        pouch?.hide();
        particles?.clear();
        root.hidden = true;
        table.classList.remove('prism-presenting');
        setPhase(keepOrbit ? 'awaiting' : 'results');
        const done = finish;
        finish = undefined;
        done?.();
        if (actors.some(a => !a.landed))
            start();
        else {
            flight.hidden = true;
            stop();
        }
    }
    function slotPose(slot) {
        const r = slot?.getBoundingClientRect();
        return { x: r ? r.left + r.width / 2 : flightSpace.width * .5, y: r ? r.top + r.height / 2 : flightSpace.height * .8, z: 0, rx: 0, ry: 0, rz: 0, scale: r ? Math.min(r.width / (flightSpace.cardHeight * .75), r.height / flightSpace.cardHeight) : .4 };
    }
    function setupFlight(firstIndex = 0, restored = false) {
        const box = table.getBoundingClientRect(), pw = pouch?.el.offsetWidth ?? width * .45, ph = pouch?.el.offsetHeight ?? height * .8;
        const vw = typeof innerWidth === 'number' ? innerWidth : width, vh = typeof innerHeight === 'number' ? innerHeight : 640;
        flightSpace = { width: vw, height: vh, cardHeight: Math.min(vh * .34, vw * .66), mouthX: box.left + width * .5, mouthY: box.top + height * .48 - ph * .38 };
        flightAge = restored ? .8 : 0;
        flight.hidden = false;
        flight.style.clipPath = `polygon(0 0,100% 0,100% ${flightSpace.mouthY}px,0 ${flightSpace.mouthY}px)`;
        for (let i = firstIndex; i < 5; i++) {
            const el = createCardView({ url: cardBackArt, rarity: 'N' });
            el.dataset.flightSlot = String(i);
            el.classList.add('prism-flight-card');
            el.style.height = `${flightSpace.cardHeight}px`;
            el.style.width = `${flightSpace.cardHeight * .75}px`;
            const pose = orbitPose(i, flightAge, flightSpace);
            el.style.transform = poseTransform(pose);
            el.dataset.side = 'back';
            flight.append(el);
            actors.push({ el, index: i, pose, landed: false, landing: false });
        }
    }
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
            delete table.dataset.fxSequence;
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
    function waitAnimations(expected, keepWaiting = false) { return Promise.all(animations.map(a => a.finished.catch(() => { }))).then(() => settle(expected, keepWaiting)); }
    function animate(el, frames, duration, delay = 0) { const a = el.animate(frames, { duration, delay, fill: 'both', easing: 'cubic-bezier(.2,.72,.22,1)' }); animations.push(a); return a; }
    async function play(id, kind, url, rarity = 'N', slot, soft = false) {
        cancelPlay(kind === 'reveal' && id === packId);
        if (id === skippedPack)
            return;
        ensure();
        const current = epoch;
        packId = id;
        table.dataset.fxSequence = 'orbit';
        reduceFlash = soft;
        root.classList.toggle('soft-light', soft || reduced());
        flight.classList.toggle('soft-light', soft || reduced());
        root.hidden = false;
        table.classList.add('prism-presenting');
        const promise = new Promise(resolve => { finish = resolve; });
        if (kind === 'rip') {
            pouch.setImage(url || sealedUrl);
            pouch.show();
            progress.to = 1;
            seamAge = 0;
            setPhase('committing');
            measure();
            start();
            if (!reduced() && progress.x < .985)
                await new Promise(resolve => { tearReady = resolve; });
            if (current !== epoch) {
                await promise;
                return;
            }
            setPhase('opening');
            openingAge = 0;
            progress.reset(1);
            previousProgress = 1;
            zAngle.reset(14);
            xAngle.reset(-26);
            pouch.setDirection(direction);
            pouch.flyStrip(direction);
            options.onSound?.('open');
            if (!reduced() && !soft)
                particles?.burst(width * .5, height * .22, '#ffd77b');
            setupFlight();
            if (reduced()) {
                flight.hidden = true;
                flightAge = .8;
            }
            // Resolve the business opening once every card has left the mouth. The same
            // five actors continue orbiting while durable reveal actions run in order.
            const cue = document.createElement('i');
            cue.className = 'prism-cue';
            stage.append(cue);
            const a = animate(cue, [{ opacity: 0 }, { opacity: 0 }], reduced() ? 80 : 800 / playbackRate);
            void a.finished.catch(() => { }).finally(() => cue.remove());
        }
        else {
            setPhase('revealing');
            measure();
            pouch?.hide();
            root.hidden = true;
            inFlight = slot;
            slot?.classList.add('card-in-flight');
            table.dataset.fxReveal = 'back';
            const index = slot ? Array.from(slot.parentElement?.children ?? []).indexOf(slot) : -1;
            if (!actors.length) {
                setupFlight(Math.max(0, index), true);
                flight.style.clipPath = 'none';
            }
            const actor = actors.find(a => a.index === index && !a.landed) ?? actors.find(a => !a.landed);
            if (!actor) {
                settle(current);
                await promise;
                return;
            }
            let visual = options.card?.(url, rarity) ?? { url, rarity };
            if (visual.subject && visual.background)
                visual = await prepareCardVisual(visual);
            if (current !== epoch) {
                await promise;
                return;
            }
            // Replace only the face inside the existing outer actor. No new card, no
            // reset to the center, no fan-then-delete handoff.
            const view = createCardView(visual);
            actor.el.replaceChildren(...Array.from(view.children));
            actor.el.dataset.rarity = rarity;
            actor.landing = true;
            actor.slot = slot;
            actor.el.style.zIndex = '300';
            actor.start = { ...actor.pose };
            actor.startAge = flightAge;
            actor.duration = reduced() ? 80 : revealDuration[rarity] / playbackRate;
            // The compositor clock drives the same actor; its destination is remeasured
            // while flying, so scroll/viewport changes cannot leave a stale landing point.
            // Animating opacity on the 3D actor flattens its faces in Chromium.
            // Keep the clock on an invisible sibling so both faces retain depth.
            const clock = document.createElement('i');
            clock.className = 'prism-cue';
            stage.append(clock);
            const a = animate(clock, [{ opacity: 0 }, { opacity: 0 }], actor.duration);
            void a.finished.catch(() => { }).finally(() => clock.remove());
            actor.animation = a;
            if (reduced())
                flight.hidden = true;
            else
                flight.hidden = false;
            const cue = document.createElement('i');
            cue.className = 'prism-cue';
            stage.append(cue);
            const cueAnimation = animate(cue, [{ opacity: 0 }, { opacity: 0 }], reduced() ? 0 : revealDuration[rarity] * .28 / playbackRate);
            void cueAnimation.finished.then(() => { if (epoch !== current)
                return; table.dataset.fxReveal = 'front'; options.onSound?.('reveal', rarity); actor.el.classList.add('prism-front-visible'); }).catch(() => { }).finally(() => cue.remove());
            void a.finished.then(() => {
                if (epoch !== current)
                    return;
                actor.landed = true;
                actor.landing = false;
                if (slot) {
                    slot.append(actor.el);
                    slot.classList.add('prism-has-landed');
                    actor.el.classList.add('prism-landed');
                    actor.el.dataset.side = 'front';
                    actor.el.style.height = '100%';
                    actor.el.style.width = '100%';
                    actor.el.style.transform = 'none';
                    actor.el.style.zIndex = '2';
                }
                else
                    actor.el.hidden = true;
            }).catch(() => { });
        }
        if (paused || document.hidden)
            for (const a of animations)
                a.pause();
        start();
        void waitAnimations(current, kind === 'rip');
        await promise;
    }
    function setPaused(value) { if (value === paused)
        return; paused = value; root.dataset.paused = String(value || document.hidden); flight.dataset.paused = String(value || document.hidden); if (value) {
        stop();
        for (const a of animations)
            a.pause();
    }
    else if (!document.hidden) {
        for (const a of animations)
            a.play();
        start();
    } }
    const visibility = () => { root.dataset.paused = String(paused || document.hidden); flight.dataset.paused = String(paused || document.hidden); if (document.hidden) {
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
        destroy() { destroyed = true; clear(); observer?.disconnect(); audio?.dispose(); pouch?.destroy(); particles?.destroy(); document.removeEventListener('visibilitychange', visibility); root.remove(); flight.remove(); },
        get state() { return { phase, progress: progress.to, packId, particles: particles?.count ?? 0, actors: actors.length, landed: actors.filter(a => a.landed).length }; } };
}
