import { SLICES } from './sliceGeometry.js';
const TEAR_SLICE = Math.floor(SLICES * 0.12);
const CARD_W = 180;
export function createRipTimeline(gsap, elements, options) {
    const { slices, wrapper } = elements;
    const autoDelay = options?.autoRipDelay ?? 1500;
    let phase = 'idle';
    let idleTl = null;
    let ripTl = null;
    let autoTimer = null;
    function complete() {
        if (phase === 'done')
            return;
        phase = 'done';
        options?.onComplete?.();
    }
    function startIdle() {
        slices.forEach(s => {
            gsap.set(s, { x: 0, y: 0, opacity: 1, clearProps: 'transform' });
        });
        gsap.set(wrapper, { opacity: 1, scale: 1, y: 0 });
        const proxy = { baseY: 0, twist: 4 };
        function applyRotation() {
            slices.forEach((slice, i) => {
                const t = (i / (SLICES - 1)) - 0.5;
                slice.style.transform = `rotateY(${t * proxy.twist + proxy.baseY}deg)`;
            });
        }
        applyRotation();
        idleTl = gsap.timeline({ repeat: -1, yoyo: true });
        idleTl.to(proxy, { baseY: 8, twist: 6, duration: 2.0, ease: 'power1.inOut', onUpdate: applyRotation });
        idleTl.to(proxy, { baseY: -8, twist: -4, duration: 2.0, ease: 'power1.inOut', onUpdate: applyRotation });
    }
    function startRip() {
        if (phase !== 'idle')
            return;
        phase = 'ripping';
        idleTl?.kill();
        if (autoTimer)
            clearTimeout(autoTimer);
        const tearSlices = slices.slice(0, TEAR_SLICE);
        const bodySlices = slices.slice(TEAR_SLICE);
        slices.forEach(s => {
            gsap.set(s, { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1, clearProps: 'transform' });
            s.style.transformOrigin = '';
        });
        tearSlices.forEach(s => {
            s.style.transformOrigin = '0% 50%';
        });
        ripTl = gsap.timeline({ onComplete: complete });
        ripTl.to(tearSlices, { scaleX: 0, duration: 0.25, ease: 'power3.in' }, 'shrink');
        ripTl.call(() => {
            tearSlices.forEach(s => {
                gsap.set(s, { x: -(CARD_W * 0.6), scaleX: 0, opacity: 0.8 });
                s.style.transformOrigin = '100% 50%';
            });
        });
        ripTl.to(tearSlices, {
            scaleX: 1, x: -(CARD_W * 0.7), z: 50, opacity: 1,
            duration: 0.2, ease: 'power2.out',
        }, 'materialize');
        ripTl.to(tearSlices, {
            x: -(CARD_W * 1.2), z: 80, opacity: 0,
            duration: 0.35, ease: 'power2.in',
        });
        ripTl.to(bodySlices, { y: 4, duration: 0.2, ease: 'power2.out' }, '-=0.3');
        ripTl.set(wrapper, { opacity: 0 }, '-=0.05');
    }
    startIdle();
    autoTimer = setTimeout(() => startRip(), autoDelay);
    return {
        triggerRip: () => startRip(),
        skip: () => {
            idleTl?.kill();
            ripTl?.kill();
            if (autoTimer)
                clearTimeout(autoTimer);
            gsap.set(wrapper, { opacity: 0 });
            complete();
        },
        destroy: () => {
            idleTl?.kill();
            ripTl?.kill();
            if (autoTimer)
                clearTimeout(autoTimer);
        },
    };
}
