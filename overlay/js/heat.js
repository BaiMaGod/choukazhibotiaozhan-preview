import { RARITIES } from "./pack.js";
import { rank } from "./growth.js";
export const heatInteger = (value, exact) => BigInt(exact ?? value);
export const heatNumber = (value) => Number(value > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : value);
export function heatReach(heat, scale, exact) {
    if (!exact || exact.length < 16)
        return Math.log2(1 + heat / scale);
    const prefix = exact.slice(0, 15);
    return Math.log2(Number(prefix)) + (exact.length - prefix.length) * Math.log2(10) - Math.log2(scale);
}
export function settleCardHeat(cards, ranks, current, previousStreak, base, random) {
    let rare = 0;
    let afterglow = 0;
    let packRaw = 0n;
    let recommendation = 0n;
    let total = current;
    for (const card of cards) {
        const grade = RARITIES.indexOf(card.rarity);
        let raw = BigInt(base(card)) * BigInt(10 + afterglow) / 10n;
        const critical = rank(ranks, "heat", 1, "chance");
        if (critical && random() < .1 * critical)
            raw *= 2n;
        total += raw;
        packRaw += raw;
        if (grade < 2)
            continue;
        rare++;
        const hot = 100 * rank(ranks, "heat", 0, "chance") + [0, 20, 50][grade - 2] * rank(ranks, "heat", 2, "chance");
        if (hot && random() < hot / 10000) {
            const extra = total * BigInt(10 + rank(ranks, "heat", 0, "synergy")) / 10n;
            recommendation += extra;
            total += extra;
            afterglow += rank(ranks, "heat", 2, "synergy");
        }
    }
    const streak = rare ? Math.min(10, previousStreak + 1) : 0;
    const bonus = 2 * Math.max(0, rare - 1) * rank(ranks, "heat", 1, "synergy") + streak * rank(ranks, "heat", 2, "base");
    const packBonus = packRaw * BigInt(bonus) / 100n;
    return { delta: total - current + packBonus, streak, packRaw, packBonus, recommendation };
}
export function addHeatSources(previous, additions, previousTotal, unsplit) {
    const keys = ["cards", "interaction", "gifts", "combo", "recommendation", "removal", "legacy"];
    return Object.fromEntries(keys.map(key => {
        const existing = previous?.[key] ?? (key === "legacy" ? String(previousTotal) : "0");
        const amount = additions?.[key] ?? (key === "legacy" && !additions ? String(unsplit) : "0");
        return [key, String(BigInt(existing) + BigInt(amount))];
    }));
}
