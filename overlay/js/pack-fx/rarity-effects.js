import { playEffects, clearEffects, advanceEffects, moveEffects } from '../vendor/react-cards-opening/effects.js';
/** Decorative only: never receives a card element, slot, transaction or completion callback. */
export const RARITY_EFFECTS = {
    SR: { tone: '#c99bff', accent: '#ffe8ff', windup: ['halo'], reveal: ['halo', 'starburst', 'glitter'] },
    SSR: { tone: '#ffc967', accent: '#fff3d1', windup: ['converge', 'implosion'], reveal: ['flash', 'sunburst', 'pillar', 'embers'] },
    UR: { tone: '#c4a3ff', accent: '#a4eeff', windup: ['vignette', 'implosion'], reveal: ['nova', 'aurora', 'stardust'] },
};
export function createRarityEffects(enabled = true) {
    let running = [];
    let plan, duration = 1, origin = { x: 0, y: 0 }, previous = { x: 0, y: 0 }, size = 180, revealed = false, failed = false;
    function clear() { for (const run of running) {
        run.timeline.kill();
        clearEffects(run.layer);
        run.layer.remove();
    } running = []; plan = undefined; }
    function spawn(names, window) {
        if (!plan || !names.length)
            return;
        for (const name of names) {
            const layer = document.createElement('div');
            layer.className = 'rco-fx-layer pack-rarity-effects';
            layer.setAttribute('aria-hidden', 'true');
            layer.dataset.effect = name;
            document.body.append(layer);
            try {
                // Explicit null prevents upstream stage-transform resets from touching our card or layout.
                const timeline = playEffects(layer, name, { at: origin, size, tone: plan.tone, accent: plan.accent, subject: null, blend: 'normal' }).pause(0);
                running.push({ layer, timeline, seconds: timeline.duration(), window, age: 0 });
            }
            catch (error) {
                clearEffects(layer);
                layer.remove();
                throw error;
            }
        }
    }
    function begin(rarity, pose, cardWidth, durationMs, soft = false) {
        clear();
        failed = false;
        revealed = false;
        if (!enabled || soft || matchMedia('(prefers-reduced-motion: reduce)').matches)
            return;
        plan = RARITY_EFFECTS[rarity];
        if (!plan)
            return;
        duration = durationMs / 1000;
        origin = { x: pose.x, y: pose.y };
        previous = { ...origin };
        size = cardWidth * pose.scale;
        try {
            spawn(plan.windup, duration * .28);
        }
        catch {
            failed = true;
            clear();
        }
    }
    function update(pose, u) {
        if (!plan || failed)
            return;
        try {
            if (u >= .28 && !revealed) {
                const saved = plan;
                clear();
                plan = saved;
                revealed = true;
                origin = { x: pose.x, y: pose.y };
                previous = { ...origin };
                spawn(plan.reveal, duration * .55);
            }
            const local = Math.max(0, (revealed ? u - .28 : u) * duration);
            for (const run of running) {
                moveEffects(run.layer, pose.x, pose.y, pose.x - previous.x, pose.y - previous.y);
                const age = Math.min(run.seconds, local / Math.max(.001, run.window) * run.seconds);
                run.timeline.totalTime(age, false);
                advanceEffects(run.layer, Math.max(0, age - run.age));
                run.age = age;
                // Fade out before the card lands. No effect extends the existing reveal duration.
                run.layer.style.opacity = String(revealed ? Math.max(0, Math.min(1, (.9 - u) / .2)) : 1);
            }
            previous = { x: pose.x, y: pose.y };
        }
        catch {
            failed = true;
            clear();
        }
    }
    return { begin, update, clear, destroy: clear, get count() { return running.length; } };
}
