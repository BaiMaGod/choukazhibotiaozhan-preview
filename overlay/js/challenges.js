import { heatInteger, heatNumber } from "./heat.js";
import { rules } from "./generated-rules.js";
import { effectiveRarity, RARITIES } from "./pack.js";
import { lockDraw, naturalOdds, rarityRewards } from "./order-rules.js";
import { audienceForPack, cardHeat, forecastBinomial, pick, randomReward, seededRandom, teachingBuff, teachingRarities, weightedIndex } from "./teaching-rules.js";
import { collect, orderedPrice, refundedCoupon } from "./growth.js";
export const heldCoupons = (rewards, spent = []) => rewards.filter((reward) => reward.kind === "coupon" && !spent.includes(reward.id));
export function guaranteeFor(theme, coupon, cardId) {
    const level = RARITIES.indexOf(coupon.rarity);
    if (coupon.key === "grade" && cardId === undefined)
        return { minimum: level };
    if (coupon.key === "card") {
        const card = theme.cards.find(item => item.id === cardId);
        if (card && RARITIES.indexOf(card.rarity) <= level)
            return { card };
    }
}
export const canUpgrade = (card, coupon) => coupon.key === "upgrade" && RARITIES.indexOf(card.rarity) < RARITIES.indexOf(coupon.rarity);
export function finalCards(cards, upgraded = []) {
    return cards.map((card, slot) => upgraded.includes(slot) ? { ...card, rarity: effectiveRarity(card, true) } : card);
}
export function resolveOrderPack(id, theme, cards, seed, context, forecasting = false) {
    const rewards = [];
    cards.forEach((card, slot) => {
        if (RARITIES.indexOf(card.rarity) >= 2) {
            rewards.push(randomReward(id, card.rarity, seed ^ Math.imul(slot + 1, 0x53a9), [...context.rewards, ...rewards], slot, theme.cost));
        }
    });
    const interaction = audienceForPack(cards, seed, context.rewards, context.audience, context.fans, context.heat, context.openingFans, context.ranks, context.heatExact, forecasting ? forecastBinomial : undefined);
    return { interaction, rewards };
}
export function goalProgress(goal, cards, heat) {
    if (goal.kind === "heat")
        return heat;
    if (goal.kind === "card")
        return Number(cards.some(card => card.id === goal.cardId));
    return cards.filter(card => RARITIES.indexOf(card.rarity) >= RARITIES.indexOf(goal.rarity)).length;
}
function forecastCoupon(goal, remaining, packs, theme, rewards, coupons) {
    if (remaining <= 0 || (goal.kind === "count" && remaining > packs * 5))
        return;
    const sorted = [...coupons].sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity));
    if (goal.kind === "card") {
        const target = theme.cards.find(card => card.id === goal.cardId);
        const native = RARITIES.indexOf(target.rarity);
        return sorted.find(coupon => guaranteeFor(theme, coupon, target.id)) ??
            sorted.filter(coupon => coupon.key === "grade" && RARITIES.indexOf(coupon.rarity) <= native).slice(-1)[0];
    }
    if (goal.kind === "count") {
        const level = RARITIES.indexOf(goal.rarity);
        const odds = naturalOdds(theme, rewards);
        if (odds.slice(0, level).every(value => value === 0))
            return;
        return sorted.find(coupon => coupon.key === "grade" && RARITIES.indexOf(coupon.rarity) >= level) ??
            sorted.find(coupon => coupon.key === "card" && RARITIES.indexOf(coupon.rarity) >= level);
    }
    if (packs === 1) {
        const floor = cardHeat("N", rewards);
        if (5 * floor >= remaining)
            return;
        const preTools = sorted.filter(coupon => coupon.key !== "upgrade");
        if (!preTools.length)
            return;
        const usable = new Set(teachingRarities.filter(rarity => 4 * floor + cardHeat(rarity, rewards) >= remaining));
        return preTools.find(coupon => usable.has(coupon.rarity))
            ?? preTools.slice(-1)[0];
    }
}
function applyForecastUpgrades(goal, remaining, packs, cards, coupons, spend, heatFor) {
    if (remaining <= 0 || goal.kind === "card" || (goal.kind === "heat" && packs > 1))
        return [...cards];
    const sorted = coupons.filter(coupon => coupon.key === "upgrade")
        .sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity));
    if (!sorted.length)
        return [...cards];
    const upgraded = [];
    if (goal.kind === "count") {
        const needed = remaining - goalProgress(goal, cards, 0);
        const level = RARITIES.indexOf(goal.rarity);
        const eligible = cards.flatMap((card, slot) => RARITIES.indexOf(card.rarity) === level - 1 ? [slot] : []);
        const legal = sorted.filter(coupon => RARITIES.indexOf(coupon.rarity) >= level);
        if (needed <= 0 || needed > 5 * (packs - 1) + eligible.length)
            return [...cards];
        for (const slot of eligible.slice(0, needed)) {
            const coupon = legal.shift();
            if (!coupon)
                break;
            const refund = spend(coupon, slot);
            if (refund)
                legal.unshift(refund);
            upgraded.push(slot);
        }
    }
    else {
        if (heatFor(cards) >= remaining)
            return [...cards];
        const selected = [];
        const slots = cards.map((_, slot) => slot).sort((a, b) => RARITIES.indexOf(cards[b].rarity) - RARITIES.indexOf(cards[a].rarity));
        for (const slot of slots) {
            const coupon = sorted.find(item => !selected.includes(item) && canUpgrade(cards[slot], item));
            if (!coupon)
                continue;
            upgraded.push(slot);
            selected.push(coupon);
            if (heatFor(finalCards(cards, upgraded)) >= remaining) {
                selected.forEach((item, index) => { spend(item, upgraded[index]); });
                return finalCards(cards, upgraded);
            }
        }
        return [...cards];
    }
    return finalCards(cards, upgraded);
}
function forecastRewards(rewards, spent, quantity) {
    // Each pack can spend one guarantee and up to five upgrade coupons. Keep
    // both ends of each group because heat can fall back to its strongest coupon.
    const limit = 6 * quantity;
    if (rewards.length <= limit)
        return rewards;
    const spentIds = new Set(spent);
    const groups = new Map();
    const kept = new Set();
    const totals = new Map();
    let donors = 10000;
    for (const reward of rewards) {
        if (reward.kind === "coupon") {
            if (spentIds.has(reward.id))
                continue;
            const key = `${reward.key}/${reward.rarity}`;
            const group = groups.get(key) ?? [];
            group.push(reward);
            groups.set(key, group);
        }
        else if (reward.key in rarityRewards) {
            // Rarity buffs consume only N and R. Preserve their chronological
            // order up to the largest donor pool any theme could have.
            if (donors <= 0)
                continue;
            donors -= reward.amount;
            kept.add(reward);
        }
        else {
            const amount = (totals.get(reward.key)?.amount ?? 0) + reward.amount;
            totals.set(reward.key, { ...reward, amount });
        }
    }
    for (const group of groups.values()) {
        for (const coupon of group.slice(0, limit))
            kept.add(coupon);
        for (const coupon of group.slice(-limit))
            kept.add(coupon);
    }
    return [...totals.values(), ...rewards.filter(reward => kept.has(reward))];
}
function forecast(theme, quantity, goal, context, spent, seed, samples, useTools) {
    const random = seededRandom(seed);
    const outcomes = [];
    const targetValue = goal.kind === "heat" ? heatInteger(goal.target, goal.exactTarget) : BigInt(goal.target);
    const usage = new Map();
    for (let sample = 0; sample < samples; sample++) {
        let current = context;
        let progress = 0n;
        const used = new Set(spent);
        for (let index = 0; index < quantity; index++) {
            const packSeed = Math.floor(random() * 0x100000000);
            const id = `forecast/${index}`;
            const spend = (coupon) => {
                used.add(coupon.id);
                const key = `${coupon.key}/${coupon.rarity}`;
                const entry = usage.get(key);
                if (entry)
                    entry.expected++;
                else
                    usage.set(key, { key: coupon.key, rarity: coupon.rarity, expected: 1 });
            };
            const coupons = useTools ? heldCoupons(current.rewards, [...used]) : [];
            const returned = [];
            const remaining = progress >= targetValue ? 0 : heatNumber(targetValue - progress);
            const tool = forecastCoupon(goal, remaining, quantity - index, theme, current.rewards, coupons);
            const target = goal.kind === "card" ? goal.cardId : goal.kind === "count"
                ? theme.cards.find(card => card.rarity === goal.rarity)?.id
                : theme.cards.find(card => card.rarity === tool?.rarity)?.id;
            const guarantee = tool && guaranteeFor(theme, tool, tool.key === "card" ? target : undefined);
            if (guarantee) {
                spend(tool);
                const refund = refundedCoupon(tool, current.ranks, id, seededRandom(packSeed ^ 0x43a0));
                if (refund)
                    returned.push(refund);
            }
            const { cards, draw } = lockDraw(theme, current.rewards, packSeed, guarantee || undefined, {
                ranks: current.ranks, state: current.draw, owned: current.owned, known: current.selfOpen ? current.owned : current.seen,
            });
            const heatFor = (final) => final.reduce((total, card) => total + cardHeat(card.rarity, current.rewards, current.ranks), 0);
            const final = applyForecastUpgrades(goal, remaining, quantity - index, cards, coupons, (coupon, slot) => {
                spend(coupon);
                const refund = refundedCoupon(coupon, current.ranks, `${id}/${slot}`, seededRandom(packSeed ^ Math.imul(slot + 1, 0x743d)));
                if (refund)
                    returned.push(refund);
                return refund;
            }, heatFor);
            const { interaction, rewards } = resolveOrderPack(id, theme, final, packSeed, current, true);
            progress += goal.kind === "heat" ? heatInteger(interaction.heat, interaction.heatExact) :
                BigInt(goalProgress(goal, final, interaction.heat));
            const heat = heatInteger(current.heat, current.heatExact) + heatInteger(interaction.heat, interaction.heatExact);
            const owned = current.selfOpen ? collect(current.owned, undefined, final).owned : current.owned;
            const seen = { ...current.seen, ...Object.fromEntries(cards.map(card => [card.id, 1])) };
            current = { ...current, owned, seen, draw, rewards: [...current.rewards, ...returned, ...rewards], audience: interaction,
                fans: current.fans + interaction.newFans, heat: heatNumber(heat), heatExact: String(heat) };
        }
        outcomes.push(progress);
    }
    return { outcomes, probability: outcomes.filter(value => value >= targetValue).length / samples,
        tools: [...usage.values()].map(item => ({ ...item, expected: item.expected / samples })) };
}
function interval(probability, samples) {
    const z = rules.challenges.estimator.wilson_z;
    const correction = z * z / samples;
    const mid = probability + correction / 2;
    const radius = z * Math.sqrt(probability * (1 - probability) / samples + correction / (4 * samples));
    return [Math.max(0, (mid - radius) / (1 + correction)), Math.min(1, (mid + radius) / (1 + correction))];
}
export function quoteChallenge(order, theme, selfOpen, context, spent, random, preferredBand) {
    const quantity = selfOpen ? weightedIndex(rules.challenges.selfQuantities, random) + 1 : order.quantity;
    context = { ...context, selfOpen, rewards: forecastRewards(context.rewards, spent, quantity) };
    const seed = Math.floor(random() * 0x100000000);
    const difficulty = [...rules.challenges.difficulty];
    if (!selfOpen)
        difficulty[2] += teachingBuff(context.rewards, "high_weight");
    const desired = preferredBand ?? weightedIndex(difficulty, random);
    const families = [...rules.challenges.estimator.goal_families];
    const first = families.splice(Math.floor(random() * families.length), 1)[0];
    const heatGoal = { kind: "heat", target: 1 };
    const pilot = forecast(theme, quantity, heatGoal, context, spent, seed, 48, false).outcomes.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    const { initial_rollouts: samples, refined_rollouts: refined } = rules.challenges.estimator;
    for (const band of new Set([desired, 0, 1, 2])) {
        const spec = rules.challenges.bands[band];
        const midpoint = (spec.p_min + spec.p_max) / 2;
        const goals = {
            count: ["SR", "SSR", "UR"].flatMap(rarity => [1, 2, 3].map(target => ({ kind: "count", rarity, target }))),
            card: RARITIES.map(rarity => ({ kind: "card", cardId: pick(theme.cards.filter(card => card.rarity === rarity), random).id, target: 1 })),
            heat: [midpoint, (spec.p_min + midpoint) / 2, (spec.p_max + midpoint) / 2].map(p => {
                const value = pilot[Math.floor((1 - p) * pilot.length)] || 1n;
                return { kind: "heat", target: heatNumber(value), exactTarget: String(value) };
            }),
        };
        for (const family of [first, ...families]) {
            for (const goal of goals[family]) {
                const rough = forecast(theme, quantity, goal, context, spent, seed, 32, true).probability;
                if (rough < spec.p_min - .17 || rough > spec.p_max + .17)
                    continue;
                let result = forecast(theme, quantity, goal, context, spent, seed, samples, true);
                const fits = (p, n) => {
                    const [low, high] = interval(p, n);
                    return low >= spec.p_min && (band === 0 || high <= spec.p_max);
                };
                if (!fits(result.probability, samples)) {
                    if (result.probability < spec.p_min || result.probability > spec.p_max)
                        continue;
                    result = forecast(theme, quantity, goal, context, spent, seed, refined, true);
                    if (!fits(result.probability, refined))
                        continue;
                }
                const p = result.probability;
                const ratio = pick(rules.challenges.bands[2].fine_sales_multipliers_bps, random) / 10000;
                const payment = selfOpen ? 0 : band === 2
                    ? orderedPrice(theme, quantity, context.ranks, !!order.premium, teachingBuff(context.rewards, "order_flat"), teachingBuff(context.rewards, "high_order_mult"))
                    : order.payment;
                const reference = selfOpen ? quantity * theme.sale : payment;
                const fine = "fine_cost_ratio" in spec ? quantity * Math.ceil(theme.cost * spec.fine_cost_ratio) : Math.ceil(reference * ratio);
                const glasses = "fine_cost_ratio" in spec
                    ? Math.ceil(2 * ((selfOpen ? quantity * theme.cost : 0) + (1 - p) * fine + spec.target_profit * quantity * theme.cost) / p)
                    : Math.ceil(2 * reference * ratio);
                if ("fine_cost_ratio" in spec && glasses > 24 * quantity * theme.cost)
                    continue;
                const without = result.tools.length ? forecast(theme, quantity, goal, context, spent, seed, result.outcomes.length, false).probability : p;
                return { ...order, quantity, payment, selfOpen,
                    challenge: { band, goal, fine, glasses, without, withTools: p, tools: result.tools,
                        range: interval(p, result.outcomes.length) } };
            }
        }
    }
    return order;
}
export function updateChallengeEstimate(order, theme, context, spent, seed) {
    const challenge = order.challenge;
    if (!challenge)
        return order;
    context = { ...context, selfOpen: order.selfOpen, rewards: forecastRewards(context.rewards, spent, order.quantity) };
    const samples = rules.challenges.estimator.initial_rollouts;
    const estimate = forecast(theme, order.quantity, challenge.goal, context, spent, seed, samples, true);
    const without = estimate.tools.length
        ? forecast(theme, order.quantity, challenge.goal, context, spent, seed, samples, false).probability
        : estimate.probability;
    return { ...order, challenge: { ...challenge, without, withTools: estimate.probability, tools: estimate.tools,
            range: interval(estimate.probability, samples) } };
}
