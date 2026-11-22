import { REVEAL_SHOWS, sampleRevealShow, showDuration } from './reveal-show.js';
import { playEffects, clearEffects, advanceEffects, moveEffects } from '../vendor/react-cards-opening/effects.js';
/** Based on upstream SIGNATURE_EFFECTS epic/legendary/mythic; delays are real seconds, not stretched to a shared window. */
export const RARITY_EFFECTS = {
    SR: { tone: '#b875ff', accent: '#f4d3ff', cues: [{ effect: 'implosion', at: 0 }, { effect: 'sigil', at: .425 }, { effect: 'diamond', at: .425 }, { effect: 'starburst', at: .455 }, { effect: 'spiral', at: .575 }, { effect: 'orbit', at: .925 }] },
    SSR: { tone: '#ffc348', accent: '#fff3bf', cues: [{ effect: 'halo', at: 0 }, { effect: 'flash', at: .66 }, { effect: 'sunburst', at: .66 }, { effect: 'pillar', at: .69 }, { effect: 'starburst', at: .78 }, { effect: 'beams', at: .91 }, { effect: 'embers', at: 1.06 }] },
    UR: { tone: '#af7bff', accent: '#82eaff', cues: [{ effect: 'vignette', at: 0 }, { effect: 'converge', at: .12 }, { effect: 'implosion', at: .3 }, { effect: 'nova', at: .81 }, { effect: 'cracks', at: .81 }, { effect: 'lightning', at: .83 }, { effect: 'chroma', at: .86 }, { effect: 'comets', at: .91 }, { effect: 'aurora', at: 1.1 }, { effect: 'lightning', at: 1.31 }, { effect: 'stardust', at: 1.45 }] },
};
export function createRarityEffects(enabled = true) {
    let runs = [], plan, show, matte;
    let next = 0, previous = { x: 0, y: 0 }, size = 180, failed = false;
    function clear() { for (const r of runs) {
        r.timeline.kill();
        clearEffects(r.layer);
        r.layer.remove();
    } runs = []; matte?.remove(); matte = undefined; plan = undefined; show = undefined; next = 0; }
    function spawn(c, pose) {
        if (!plan)
            return;
        const layer = document.createElement('div');
        layer.className = 'rco-fx-layer pack-rarity-effects';
        layer.dataset.effect = c.effect;
        layer.setAttribute('aria-hidden', 'true');
        document.body.append(layer);
        try {
            const timeline = playEffects(layer, c.effect, { at: { x: pose.x, y: pose.y }, size: size * (c.scale ?? 1), tone: plan.tone, accent: plan.accent, subject: null, blend: 'add' }).pause(0);
            runs.push({ layer, timeline, at: c.at, age: 0, life: timeline.duration() });
        }
        catch (error) {
            clearEffects(layer);
            layer.remove();
            throw error;
        }
    }
    function begin(rarity, pose, cardWidth, _durationMs, soft = false) {
        clear();
        failed = false;
        if (!document.body || !enabled || soft || matchMedia('(prefers-reduced-motion: reduce)').matches)
            return;
        plan = RARITY_EFFECTS[rarity];
        show = REVEAL_SHOWS[rarity];
        if (!plan || !show)
            return;
        previous = { x: pose.x, y: pose.y };
        size = cardWidth * pose.scale * show.zoom;
        matte = document.createElement('div');
        matte.className = 'pack-rarity-matte';
        matte.setAttribute('aria-hidden', 'true');
        matte.style.opacity = '0';
        document.body.append(matte);
        update(pose, 0);
    }
    function update(pose, u) {
        if (!plan || !show || failed)
            return;
        try {
            const t = Math.max(0, Math.min(1, u)) * showDuration(show), sample = sampleRevealShow(show, t);
            if (matte)
                matte.style.opacity = String(sample.dim);
            while (next < plan.cues.length && plan.cues[next].at <= t) {
                spawn(plan.cues[next++], pose);
            }
            for (const run of runs) {
                moveEffects(run.layer, pose.x, pose.y, pose.x - previous.x, pose.y - previous.y);
                const age = Math.min(run.life, Math.max(0, t - run.at));
                run.timeline.totalTime(age, false);
                advanceEffects(run.layer, Math.max(0, age - run.age));
                run.age = age;
                // Keep the show readable, then release it as the original actor lands.
                run.layer.style.opacity = String(Math.max(0, Math.min(1, (showDuration(show) - t) / show.land)));
            }
            for (const r of runs.filter(r => t - r.at >= r.life)) {
                r.timeline.kill();
                clearEffects(r.layer);
                r.layer.remove();
            }
            runs = runs.filter(r => t - r.at < r.life);
            previous = { x: pose.x, y: pose.y };
        }
        catch {
            failed = true;
            clear();
        }
    }
    return { begin, update, clear, destroy: clear, get count() { return runs.length; } };
}
