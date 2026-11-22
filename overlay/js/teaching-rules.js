import { heatInteger, heatNumber, heatReach, settleCardHeat } from "./heat.js";
import { effectiveRank, rank } from "./growth.js";
import { rules } from "./generated-rules.js";
import { RARITIES } from "./pack.js";
export const teachingRarities = ["SR", "SSR", "UR"];
export const teachingOrder = { openingGold: 200, starterPacks: 10, saleGold: 36, mainGift: 10, bonusGift: 20, failureGold: 100 };
const buffLabels = {
    sr_bps: "SR 出率",
    ssr_bps: "SSR 出率",
    ur_bps: "UR 出率",
    high_weight: "高难附挑战订单权重",
    order_flat: "每包顾客货款",
    high_order_mult: "高难附挑战订单金额",
    viewer_bps: "观众送礼意愿参数",
    gift_flat_milli: "单份礼物估值",
    gift_mult: "礼物估值倍率",
    fans_flat: "每包挑战成功粉丝",
    success_flat: "每包挑战成功金币",
    success_mult: "系统成功奖励倍率",
    heat_flat: "每张卡基础热度",
    rare_heat_flat: "每张稀有卡基础热度",
    heat_mult: "卡牌热度倍率",
};
const couponLabels = { grade: "品级指定券", card: "卡面指定券", upgrade: "升品券" };
export function seededRandom(seed) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}
export function pick(items, random) {
    return items[Math.floor(random() * items.length)];
}
export function weightedIndex(weights, random) {
    let ticket = random() * weights.reduce((sum, weight) => sum + weight, 0);
    for (let i = 0; i < weights.length; i++) {
        ticket -= weights[i];
        if (ticket < 0)
            return i;
    }
    throw new Error("抽取权重配置无效。");
}
function binomial(count, probability, random) {
    let successes = 0;
    for (let i = 0; i < count; i++) {
        if (random() < probability)
            successes++;
    }
    return successes;
}
function stirlingError(value) {
    if (value < 10) {
        let factorialLog = 0;
        for (let i = 2; i <= value; i++)
            factorialLog += Math.log(i);
        return factorialLog - (value + .5) * Math.log(value) + value - .5 * Math.log(2 * Math.PI);
    }
    const inverseSquare = 1 / (value * value);
    return (1 / 12 - inverseSquare * (1 / 360 - inverseSquare * (1 / 1260 - inverseSquare * (1 / 1680 - inverseSquare / 1188)))) / value;
}
// Forecasts need the same binomial distribution as settlement. Keep settlement's
// original per-viewer draws so locked packs keep their existing seeded results.
export function forecastBinomial(count, probability, random) {
    if (count <= 256)
        return binomial(count, probability, random);
    if (probability === 0 || probability === 1)
        return probability * count;
    if (probability > .5)
        return count - forecastBinomial(count, 1 - probability, random);
    const mean = count * probability;
    if (mean < 10) {
        const logFailure = Math.log1p(-probability);
        let trials = 0;
        let successes = 0;
        while ((trials += 1 + Math.floor(Math.log1p(-random()) / logFailure)) <= count)
            successes++;
        return successes;
    }
    // Hörmann's transformed rejection with squeeze. The log mass uses ratios
    // around the mean so large log factorials never have to be subtracted.
    const deviation = Math.sqrt(mean * (1 - probability));
    const width = 1.15 + 2.53 * deviation;
    const stretch = -.0873 + .0248 * width + .01 * probability;
    const scale = (2.83 + 5.1 / width) * deviation;
    const squeeze = .92 - 4.2 / width;
    const logMass = (successes) => {
        if (successes === 0)
            return count * Math.log1p(-probability);
        if (successes === count)
            return count * Math.log(probability);
        const failures = count - successes;
        const offset = successes - mean;
        return stirlingError(count) - stirlingError(successes) - stirlingError(failures)
            - .5 * Math.log(2 * Math.PI * successes * (failures / count))
            - successes * Math.log1p(offset / mean) - failures * Math.log1p(-offset / (count - mean));
    };
    const modeMass = logMass(Math.floor((count + 1) * probability));
    for (;;) {
        const center = random() - .5;
        const edge = .5 - Math.abs(center);
        if (edge === 0)
            continue;
        const successes = Math.floor((2 * stretch / edge + width) * center + mean + .5);
        if (successes < 0 || successes > count)
            continue;
        const acceptance = random();
        if (edge >= .07 && acceptance <= squeeze)
            return successes;
        const logWeight = Math.log(acceptance * scale / (stretch / (edge * edge) + width));
        if (logWeight <= logMass(successes) - modeMass)
            return successes;
    }
}
export function teachingBuff(rewards, key) {
    return rewards.reduce((sum, reward) => sum + (reward.kind === "buff" && reward.key === key ? reward.amount : 0), 0);
}
export function isTeachingReward(reward) {
    if (!reward)
        return false;
    if (reward.kind === "coupon")
        return Object.prototype.hasOwnProperty.call(couponLabels, reward.key);
    return reward.kind === "buff" && Object.prototype.hasOwnProperty.call(buffLabels, reward.key) &&
        Number.isFinite(reward.amount) && reward.amount > 0;
}
export function describeTeachingReward(reward) {
    if (reward.kind === "coupon")
        return `${reward.rarity} ${couponLabels[reward.key]} ×1`;
    const { key, amount } = reward;
    const change = key === "gift_flat_milli" ? `${amount / 1000} 金币`
        : key === "viewer_bps" ? String(amount / 10000)
            : key.endsWith("_bps") ? `${amount / 100} 个百分点`
                : key.endsWith("_mult") ? `${Math.round(amount * 100)}%`
                    : String(amount);
    return `${buffLabels[key]} +${change}`;
}
function giftValueWithBonuses(face, flatBonus, multiplierBonus, ranks) {
    const base = face * 1000;
    const permanent = 1 + .05 * effectiveRank(ranks, "gift", "value");
    const flat = base + 200 * effectiveRank(ranks, "gift", "base");
    const multiplierBps = Math.round((permanent + multiplierBonus) * 10000);
    return Math.min(Math.floor((flat + flatBonus) * multiplierBps / 10000), Math.floor(flat * permanent * rules.caps.local_gift_multiplier), base * rules.caps.gift_unit_base_ratio);
}
export function giftValueMilli(face, rewards, ranks) {
    return giftValueWithBonuses(face, teachingBuff(rewards, "gift_flat_milli"), teachingBuff(rewards, "gift_mult"), ranks);
}
export function randomReward(id, rarity, seed, prior, slot = 4, price = rules.starter.cost) {
    const tier = teachingRarities.indexOf(rarity);
    const giftFlat = teachingBuff(prior, "gift_flat_milli");
    const giftMultiplier = teachingBuff(prior, "gift_mult");
    const buffs = Object.keys(buffLabels).map((key) => ({
        kind: "buff", id: `${id}/${slot}/reward`, rarity, key, amount: rules.buffs[key][tier],
    })).filter(reward => {
        if (reward.key === "gift_flat_milli" || reward.key === "gift_mult") {
            const nextFlat = giftFlat + (reward.key === "gift_flat_milli" ? reward.amount : 0);
            const nextMultiplier = giftMultiplier + (reward.key === "gift_mult" ? reward.amount : 0);
            return [1, rules.audienceGrowth.gift_values[0]].some(face => giftValueWithBonuses(face, nextFlat, nextMultiplier) > giftValueWithBonuses(face, giftFlat, giftMultiplier));
        }
        if (reward.key === "success_flat") {
            const current = teachingBuff(prior, "success_flat") * (1 + teachingBuff(prior, "success_mult"));
            return current < price * rules.caps.local_system_gold_cost_ratio;
        }
        return true;
    });
    const coupons = Object.keys(couponLabels).map((key) => ({
        kind: "coupon", id: `${id}/${slot}/reward`, rarity, key,
    }));
    return pick([...buffs, ...coupons], seededRandom(seed ^ 0x86ba920a));
}
function drawCards(rarity, seed) {
    const random = seededRandom(seed);
    const [n, r] = rules.starter.bps;
    const cardAt = (grade) => pick(rules.cards.filter(card => card.rarity === grade), random);
    const cards = Array.from({ length: 4 }, () => cardAt(random() * (n + r) < n ? "N" : "R"));
    return [...cards, cardAt(rarity)];
}
export function cardHeat(rarity, rewards, ranks) {
    const grade = RARITIES.indexOf(rarity);
    const rare = grade >= 2;
    const flat = teachingBuff(rewards, "heat_flat") +
        (rare ? teachingBuff(rewards, "rare_heat_flat") + [1, 3, 10][grade - 2] * rank(ranks, "heat", 0, "base")
            : (grade === 0 ? .5 : 1) * rank(ranks, "heat", 1, "base"));
    const localBps = Math.round((1 + teachingBuff(rewards, "heat_mult")) * 10000);
    const permanent = 20 + (rare ? rank(ranks, "heat", 0, "value") : 0);
    return Math.floor((rules.heat[grade] + flat) * permanent * localBps / 200000);
}
export function audienceForPack(cards, seed, prior, last, fans, heat, openingFans = 0, ranks, exactHeat, sampleCount = binomial) {
    const random = seededRandom(seed ^ 0x9f32ea62);
    const a = rules.audience;
    const previousFans = last?.oldFans ?? Math.floor(fans * a.opening_follower_ratio);
    const previousVisitors = last?.visitors ?? a.opening_new_visitors;
    let oldFans = previousFans - sampleCount(previousFans, a.follower_leave_per_pack, random);
    let visitors = previousVisitors - sampleCount(previousVisitors, a.visitor_leave_per_pack, random);
    const returning = sampleCount(Math.max(0, fans - oldFans), a.follower_return_per_pack, random);
    oldFans += returning;
    const reach = heatReach(heat, a.heat_log_scale, exactHeat);
    const capacity = Math.floor(a.visitor_capacity_base + a.visitor_capacity_fan_sqrt * Math.sqrt(fans + 1) + a.heat_capacity_per_log2 * reach);
    const exposure = Math.floor((a.new_visitors_base + a.new_visitors_fan_sqrt * Math.sqrt(fans)) * (1 + a.heat_reach_per_log2 * reach));
    const newVisitors = Math.min(Math.max(0, capacity - visitors), exposure);
    visitors += newVisitors;
    const online = oldFans + visitors;
    const willingness = teachingBuff(prior, "viewer_bps") / 10000;
    const strength = (1 + .05 * effectiveRank(ranks, "gift", "chance")) * (1 + a.gift_local_strength_extra * willingness / (1 + willingness));
    const giftChance = 1 - Math.exp(-a.gift_intent_probability * strength / Math.sqrt(1 + online / a.gift_crowd_scale));
    let possibleGivers = sampleCount(online, giftChance, random);
    let comments = 0;
    let newFans = 0;
    let gifts = 0;
    for (const card of cards) {
        const grade = RARITIES.indexOf(card.rarity);
        comments += sampleCount(online - comments, a.comment_by_grade[grade], random);
        const followChance = 1 - (1 - a.follow_by_grade[grade]) ** (1 + .1 * teachingBuff(prior, "fans_flat"));
        const followed = sampleCount(visitors, followChance, random);
        visitors -= followed;
        oldFans += followed;
        newFans += followed;
        const gave = sampleCount(possibleGivers, a.gift_response_by_grade[grade], random);
        possibleGivers -= gave;
        gifts += gave;
    }
    const interactionHeat = Math.floor(a.comment_heat_sqrt * Math.sqrt(comments) +
        a.follow_heat_sqrt * Math.sqrt(newFans) + a.giver_heat_sqrt * Math.sqrt(gifts)) + comments * rank(ranks, "heat", 1, "value");
    const mix = [...rules.audienceGrowth.fan_gift_mix].reverse().find(item => openingFans >= item.min_fans);
    let giftMilli = 0;
    let giftCount = gifts;
    let giftFace = 0;
    const extraChance = .05 * effectiveRank(ranks, "gift", "synergy");
    const giftUnits = new Map();
    for (let i = 0; i < gifts; i++) {
        const face = rules.audienceGrowth.gift_values[weightedIndex(mix.weights, random)];
        let unit = giftUnits.get(face);
        if (unit === undefined) {
            unit = giftValueMilli(face, prior, ranks);
            giftUnits.set(face, unit);
        }
        giftMilli += unit;
        giftFace += face;
        if (extraChance && random() < extraChance) {
            giftCount++;
            giftMilli += unit;
            giftFace += face;
        }
    }
    const total = heatInteger(heat, exactHeat);
    const { delta, streak, packRaw, packBonus, recommendation } = settleCardHeat(cards, ranks, total, last?.streak ?? 0, card => cardHeat(card.rarity, prior, ranks), seededRandom(seed ^ 0x7ac1));
    const giftHeat = Math.floor(giftFace * .02 * rank(ranks, "heat", 2, "value"));
    const heatGain = delta + BigInt(interactionHeat + giftHeat);
    return { oldFans, visitors, newFans, comments, gifts: giftCount, giftMilli,
        heat: heatNumber(heatGain), heatExact: String(heatGain), streak, arrivals: returning + newVisitors,
        heatSources: { cards: String(packRaw), combo: String(packBonus), recommendation: String(recommendation),
            interaction: String(interactionHeat), gifts: String(giftHeat) } };
}
export function lockTeachingPack(id, index, seed, prior, last, fans, heat) {
    const rarity = teachingRarities[index];
    const cards = drawCards(rarity, seed);
    return { id, seed, cards, revealed: 0,
        reward: randomReward(id, rarity, seed, prior),
        interaction: audienceForPack(cards, seed, prior, last, fans, heat),
        settledAt: null };
}
export function teachingShipment(prior) {
    const packs = teachingRarities.length;
    const sunglasses = teachingOrder.mainGift + teachingOrder.bonusGift;
    const multiplierBps = Math.round((1 + teachingBuff(prior, "success_mult")) * 10000);
    const systemGold = Math.min(packs * rules.caps.challenge_gold_per_pack, Math.floor(packs * teachingBuff(prior, "success_flat") * multiplierBps / 10000), Math.floor(packs * rules.starter.cost * rules.caps.local_system_gold_cost_ratio));
    const fans = Math.min(packs * rules.caps.challenge_fans_per_pack, Math.floor(packs * (2 + teachingBuff(prior, "fans_flat")) * multiplierBps / 10000));
    return { saleGold: teachingOrder.saleGold, sunglasses, giftMilli: sunglasses * giftValueMilli(1, prior), systemGold, fans };
}
