export const RARITIES = ["N", "R", "SR", "SSR", "UR"];
const sampleCards = [
    { id: "MCJ01", name: "晒太阳补丁", rarity: "N" },
    { id: "MCJ09", name: "情绪稳定中", rarity: "R" },
    { id: "MCJ14", name: "云朵充电站", rarity: "SR" },
    { id: "MCJ18", name: "月亮代班员", rarity: "SSR" },
    { id: "MCJ20", name: "今天也有奇迹", rarity: "UR" },
];
export function revealNext(pack, slot) {
    if (slot !== pack.revealed || pack.revealed >= pack.cards.length)
        return pack;
    return { ...pack, revealed: pack.revealed + 1 };
}
const rewardNames = {
    SR: "SR 出率 +1 个百分点",
    SSR: "SSR 出率 +1 个百分点",
    UR: "UR 出率 +0.3 个百分点",
};
export function effectiveRarity(card, upgraded) {
    return upgraded ? RARITIES[RARITIES.indexOf(card.rarity) + 1] : card.rarity;
}
function isUpgradable(slot) {
    return Number.isInteger(slot) && slot >= 0 && slot < 3;
}
function settle(pack) {
    return pack.cards.flatMap((card, slot) => {
        const rarity = effectiveRarity(card, pack.upgraded === slot);
        if (rarity === "N" || rarity === "R")
            return [];
        return [{ id: `${pack.id}/${slot}/reward`, rarity, name: rewardNames[rarity] }];
    });
}
export function applyPackAction(pack, action) {
    if (!pack) {
        if (action.type !== "open")
            return null;
        return {
            schema: 1,
            rules: "pack-slice-v1",
            id: action.id,
            cards: [...sampleCards],
            revealed: 0,
            upgraded: null,
            rewards: null,
        };
    }
    if (action.id !== pack.id)
        return pack;
    if (pack.rewards)
        return action.type === "reset" ? null : pack;
    switch (action.type) {
        case "reveal":
            return revealNext(pack, action.slot);
        case "upgrade":
            if (pack.revealed !== pack.cards.length || pack.upgraded !== null || !isUpgradable(action.slot))
                return pack;
            return { ...pack, upgraded: action.slot };
        case "finish":
            if (pack.revealed !== pack.cards.length)
                return pack;
            return { ...pack, rewards: settle(pack) };
        default:
            return pack;
    }
}
export function readPack(value) {
    if (value === undefined)
        return null;
    if (value && typeof value === "object") {
        const pack = value;
        if (pack.schema === 1 && pack.rules === "pack-slice-v1" &&
            typeof pack.id === "string" && pack.id.length > 0 &&
            Array.isArray(pack.cards) && pack.cards.length === sampleCards.length &&
            pack.cards.every((card, slot) => {
                const expected = sampleCards[slot];
                return card?.id === expected.id && card.name === expected.name && card.rarity === expected.rarity;
            }) &&
            Number.isInteger(pack.revealed) && pack.revealed >= 0 && pack.revealed <= pack.cards.length &&
            (pack.upgraded === null || (pack.revealed === pack.cards.length && isUpgradable(pack.upgraded))) &&
            (pack.rewards === null || (pack.revealed === pack.cards.length && Array.isArray(pack.rewards) &&
                JSON.stringify(pack.rewards) === JSON.stringify(settle(pack))))) {
            return pack;
        }
    }
    throw new Error("本地试拆记录无法读取。原记录已保留。");
}
export function visibleCards(pack) {
    return pack?.cards.slice(0, pack.revealed).map((card, slot) => ({
        ...card,
        rarity: effectiveRarity(card, pack.upgraded === slot),
    })) ?? [];
}
