import { rules } from "./generated-rules.js";
import { effectiveRank, hasSet, orderedPrice, rank } from "./growth.js";
import { RARITIES } from "./pack.js";
import { pick, seededRandom, teachingBuff, weightedIndex } from "./teaching-rules.js";
export const themeFor = (id) => rules.themes.find(theme => theme.id === id);
export const totalStock = (stock) => rules.themes.reduce((sum, theme) => sum + stock[theme.id], 0);
export function starterStock(quantity) {
    return Object.fromEntries(rules.themes.map(theme => [theme.id, theme.id === rules.starter.id ? quantity : 0]));
}
export function generateOrders(id, round, count, stock, peakFans, buffs, random, ranks) {
    const eligible = rules.themes.filter(theme => stock[theme.id] > 0 && peakFans >= theme.unlock_fans);
    if (!eligible.length)
        return [];
    return Array.from({ length: count }, (_, index) => {
        const theme = pick(eligible, random);
        const quantity = weightedIndex(rules.orders.quantities, random) + 1;
        const chance = .01 * effectiveRank(ranks, "order", "chance");
        const premium = chance > 0 && random() < chance;
        const payment = orderedPrice(theme, quantity, ranks, premium, teachingBuff(buffs, "order_flat"));
        return { id: `${id}/orders/${round}/${index + 1}`, themeId: theme.id, quantity, payment, premium };
    });
}
export const rarityRewards = { sr_bps: 2, ssr_bps: 3, ur_bps: 4 };
export function naturalOdds(theme, rewards) {
    const odds = [...theme.bps];
    for (const reward of rewards) {
        if (odds[0] + odds[1] === 0)
            break;
        if (reward.kind !== "buff" || !(reward.key in rarityRewards))
            continue;
        const target = rarityRewards[reward.key];
        let pending = reward.amount;
        for (const source of [0, 1]) {
            const transfer = Math.min(odds[source], pending);
            odds[source] -= transfer;
            odds[target] += transfer;
            pending -= transfer;
        }
    }
    return odds;
}
export function drawOrderCards(theme, buffs, seed, guarantee) {
    const random = seededRandom(seed);
    const weights = naturalOdds(theme, buffs);
    return Array.from({ length: 5 }, (_, slot) => {
        if (slot === 4 && guarantee && "card" in guarantee)
            return guarantee.card;
        const minimum = slot === 4 && guarantee && "minimum" in guarantee ? guarantee.minimum : 0;
        const rarity = RARITIES[minimum + weightedIndex(weights.slice(minimum), random)];
        return pick(theme.cards.filter(card => card.rarity === rarity), random);
    });
}
function shift(weights, target, amount) {
    for (const source of [0, 1]) {
        const transfer = Math.min(weights[source], amount);
        weights[source] -= transfer;
        weights[target] += transfer;
        amount -= transfer;
    }
}
export function drawOddsStages(theme, rewards, context) {
    const base = [...theme.bps];
    const permanent = [...base];
    shift(permanent, 2, 50 * rank(context.ranks, "draw", 0, "base"));
    shift(permanent, 3, 10 * rank(context.ranks, "draw", 0, "chance"));
    shift(permanent, 4, 2 * rank(context.ranks, "draw", 0, "chance"));
    const collection = [...permanent];
    if (hasSet(theme, context.owned)) {
        shift(collection, 2, 300);
        shift(collection, 3, 200);
        shift(collection, 4, 100);
    }
    const live = [...collection];
    for (const reward of rewards) {
        if (live[0] + live[1] === 0)
            break;
        if (reward.kind === "buff" && reward.key in rarityRewards) {
            shift(live, rarityRewards[reward.key], reward.amount);
        }
    }
    return { base, permanent, collection, live };
}
function slotDistribution(weights, minimum, promotion, fixed) {
    if (fixed)
        return RARITIES.map(grade => Number(grade === fixed.rarity) * 100);
    const output = [0, 0, 0, 0, 0];
    const total = weights.slice(minimum).reduce((sum, value) => sum + value, 0);
    for (let grade = minimum; grade < weights.length; grade++) {
        const base = weights[grade] / total * 100;
        const lift = grade < 4 ? promotion(grade) : 0;
        output[grade] += base * (1 - lift);
        if (lift)
            output[grade + 1] += base * lift;
    }
    return output;
}
export function lockDraw(theme, rewards, seed, guarantee, context = {}, captureOdds = false) {
    const { ranks, known, owned, state } = context;
    const drawRank = (stage, slot) => rank(ranks, "draw", stage, slot);
    const hasTalent = Object.keys(ranks ?? {}).some(id => id.startsWith("draw/")) ||
        effectiveRank(ranks, "tool", "value") > 0;
    const completeSet = hasSet(theme, owned);
    if (!hasTalent && !completeSet && !captureOdds) {
        return { cards: drawOrderCards(theme, rewards, seed, guarantee), draw: { golden: false, aura: 0 } };
    }
    const stages = drawOddsStages(theme, rewards, context);
    const slots = [];
    const guaranteeLabel = guarantee ? "minimum" in guarantee ? `第 5 张至少 ${RARITIES[guarantee.minimum]}`
        : `第 5 张指定卡面「${guarantee.card.name}」` : undefined;
    if (!hasTalent && !completeSet) {
        if (captureOdds) {
            for (let slot = 0; slot < 5; slot++) {
                const fixed = slot === 4 ? guarantee : undefined;
                slots.push(slotDistribution(stages.live, fixed && "minimum" in fixed ? fixed.minimum : 0, () => 0, fixed && "card" in fixed ? fixed.card : undefined));
            }
        }
        return { cards: drawOrderCards(theme, rewards, seed, guarantee), draw: { golden: false, aura: 0 },
            odds: captureOdds ? { ...stages, slots, guarantee: guaranteeLabel } : undefined };
    }
    const random = seededRandom(seed);
    const golden = random() < .01 * drawRank(2, "base") + (state?.golden ? .02 * drawRank(2, "synergy") : 0);
    const weights = stages.live;
    let aura = state?.aura ?? 0;
    let priorRare = 0;
    const cards = Array.from({ length: 5 }, (_, slot) => {
        const current = [...weights];
        if (slot === 0) {
            shift(current, 3, 5 * drawRank(1, "base"));
            shift(current, 4, drawRank(1, "base"));
        }
        shift(current, 2, 20 * priorRare * drawRank(1, "chance"));
        if (priorRare >= 2) {
            shift(current, 3, 10 * drawRank(1, "synergy"));
            shift(current, 4, 2 * drawRank(1, "synergy"));
        }
        if (golden) {
            shift(current, 2, 500 + 50 * drawRank(2, "value"));
            shift(current, 3, 200 + 20 * drawRank(2, "value"));
            shift(current, 4, 50 + 5 * drawRank(2, "value"));
        }
        if (aura) {
            shift(current, 3, 10 * drawRank(2, "chance"));
            shift(current, 4, 3 * drawRank(2, "chance"));
        }
        const fixed = slot === 4 ? guarantee : undefined;
        const minimum = fixed && "minimum" in fixed ? fixed.minimum : 0;
        const promotion = (grade) => fixed ? .01 * effectiveRank(ranks, "tool", "value")
            : grade === 2 ? .01 * drawRank(0, "value") : grade === 3 ? .003 * drawRank(0, "synergy") : 0;
        if (captureOdds)
            slots.push(slotDistribution(current, minimum, promotion, fixed && "card" in fixed ? fixed.card : undefined));
        let card;
        if (fixed && "card" in fixed)
            card = fixed.card;
        else {
            const grade = minimum + weightedIndex(current.slice(minimum), random);
            const pool = theme.cards.filter(item => item.rarity === RARITIES[grade]);
            const missing = fixed ? [] : pool.filter(item => !known?.[item.id]);
            card = pick(missing.length && random() < .03 * drawRank(1, "value") ? missing : pool, random);
            if (grade < 4 && random() < promotion(grade))
                card = { ...card, rarity: RARITIES[grade + 1], nativeRarity: card.rarity };
        }
        const grade = RARITIES.indexOf(card.rarity);
        if (grade >= 2)
            priorRare++;
        aura = grade === 4 && drawRank(2, "chance") ? 3 : Math.max(0, aura - 1);
        return card;
    });
    return { cards, draw: { golden, aura }, odds: captureOdds ? { ...stages, slots, guarantee: guaranteeLabel } : undefined };
}
