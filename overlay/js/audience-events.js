import { RARITIES } from "./pack.js";
export const liveEventLimit = 24;
export function validInteractionGroups(interaction) {
    const positive = (value) => Number.isSafeInteger(value) && value > 0;
    const { commentGroups, giftGroups } = interaction;
    return (commentGroups === undefined || (Array.isArray(commentGroups) && commentGroups.length <= 5 &&
        commentGroups.every(group => group && RARITIES.includes(group.rarity) && positive(group.count)) &&
        commentGroups.reduce((total, group) => total + group.count, 0) === interaction.comments)) &&
        (giftGroups === undefined || (Array.isArray(giftGroups) && giftGroups.length <= 3 &&
            giftGroups.every(group => group && positive(group.face) && positive(group.givers) && positive(group.count) &&
                group.givers <= group.count && positive(group.milli)) &&
            new Set(giftGroups.map(group => group.face)).size === giftGroups.length &&
            giftGroups.reduce((total, group) => total + group.count, 0) === interaction.gifts &&
            giftGroups.reduce((total, group) => total + group.milli, 0) === interaction.giftMilli));
}
export function packEvents(id, interaction) {
    return [
        ...(interaction.commentGroups ?? []).map(({ rarity, count }, index) => ({
            id: `${id}/chat/${index}`, kind: "comment", rarity, count,
        })),
        ...(interaction.giftGroups ?? []).map(group => ({
            ...group, id: `${id}/gift/${group.face}`, kind: "gift", source: "viewer",
        })),
    ];
}
export function glassesEvent(id, source, count, milli) {
    return { id: `${id}/glasses`, kind: "gift", source, face: 1, givers: 1, count, milli };
}
export function appendLiveEvents(previous, events) {
    return events.length ? [...(previous ?? []), ...events].slice(-liveEventLimit) : previous;
}
