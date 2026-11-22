export const rewardExpiry = 10 * 60000;
export const rewardValid = (request, now) => now >= request.createdAt && now - request.createdAt <= rewardExpiry;
export function rewardAllowed(rewards, day, liveId, source) {
    const daily = rewards?.days[day];
    const live = liveId ? rewards?.live[liveId] : undefined;
    if (source === "share")
        return (daily?.shares ?? 0) < 1 && (!liveId || (live?.shares ?? 0) < 1);
    return (daily?.ads ?? 0) < 5 && (liveId ? (live?.ads ?? 0) < 2 : (daily?.coins ?? 0) < 3);
}
