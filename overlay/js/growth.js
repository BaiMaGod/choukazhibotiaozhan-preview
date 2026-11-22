import { rules } from "./generated-rules.js";
import { RARITIES } from "./pack.js";
export const signInAmounts = rules.signIn;
export const talentNode = (id) => rules.talents.nodes.find(node => node.id === id);
export const rank = (ranks, branch, stage, slot) => ranks?.[`${branch}/${stage}/${slot}`] ?? 0;
export function effectiveRank(ranks, branch, slot) {
    return rules.talents.scale.reduce((total, scale, stage) => total + rank(ranks, branch, stage, slot) * (branch === "tool" ? 1 : scale / 10000), 0);
}
export function talentOffer(node, ranks, fans, wallet) {
    const level = ranks?.[node.id] ?? 0;
    const price = node.prices[level];
    const gate = node.fans[level];
    const needs = node.needs
        .filter(item => (ranks?.[item.id] ?? 0) < item.rank);
    return { level, price, gate, needs, allowed: price !== undefined && wallet >= price && fans >= gate && !needs.length };
}
export const hasSet = (theme, owned) => !!owned && theme.cards.every(card => (owned[card.id] ?? 0) > 0);
export function collect(owned, grades, cards) {
    const next = { ...owned };
    const gradeCounts = { ...grades };
    for (const card of cards) {
        next[card.id] = (next[card.id] ?? 0) + 1;
        const key = `${card.id}/${card.rarity}`;
        gradeCounts[key] = (gradeCounts[key] ?? 0) + 1;
    }
    return { owned: next, ownedGrades: gradeCounts };
}
export function collectCopies(collection, cards, acquiredAt, source) {
    const collectionCopies = { ...collection.collectionCopies };
    const additions = new Map();
    for (const card of cards) {
        const copies = additions.get(card.id) ?? [];
        copies.push([card.rarity, acquiredAt, source]);
        additions.set(card.id, copies);
    }
    for (const [id, copies] of additions)
        collectionCopies[id] = [...(collectionCopies[id] ?? []), ...copies];
    return { ...collect(collection.owned, collection.ownedGrades, cards), collectionCopies };
}
export const nativeCard = (card) => {
    if (!card.nativeRarity)
        return card;
    return { id: card.id, name: card.name, rarity: card.nativeRarity };
};
export function recordSeen(seen, cards) {
    return Array.from(new Map([...seen, ...cards.map(nativeCard)].map(card => [card.id, card])).values());
}
export function orderedPrice(theme, quantity, ranks, permanentPremium, localFlat, localHigh = 0) {
    const slots = ["base", "value"];
    const additive = slots.reduce((total, slot) => {
        const flat = rules.talents.order.order_flat_by_round[slot][0] * rank(ranks, "order", 0, slot);
        const ratio = rules.talents.order.order_sale_ratio_by_round[slot];
        return total + flat + theme.sale * (ratio[1] * rank(ranks, "order", 1, slot) + ratio[2] * rank(ranks, "order", 2, slot));
    }, 0);
    const premium = permanentPremium ? 1.2 : 1;
    const permanent = 1 + .03 * effectiveRank(ranks, "order", "synergy");
    return Math.floor(quantity * Math.min((theme.sale + additive + localFlat) * premium * (permanent + localHigh), (theme.sale + additive) * premium * permanent * rules.caps.local_order_multiplier, theme.sale * rules.caps.order_final_base_sale_ratio));
}
const refundSlots = { grade: "base", card: "chance", upgrade: "synergy" };
export function refundedCoupon(coupon, ranks, id, random) {
    if (random() < .01 * effectiveRank(ranks, "tool", refundSlots[coupon.key])) {
        return { ...coupon, id: `${id}/refund/${coupon.id}` };
    }
}
export const rarityIndex = (rarity) => RARITIES.indexOf(rarity);
