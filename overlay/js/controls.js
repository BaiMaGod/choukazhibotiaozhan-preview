import { RARITIES } from "./pack.js";
export const defaultSettings = {
    music: false,
    packSound: true,
    rewardSound: true,
    vibration: true,
    reduceFlash: false,
    giftBanner: true,
    skipTools: false,
    pauseAt: "SSR",
};
export function readSettings(storage) {
    const settings = { ...defaultSettings };
    try {
        const legacy = storage.getItem("choukazhibo-slice-sound") !== "off";
        settings.packSound = settings.rewardSound = legacy;
        const saved = JSON.parse(storage.getItem("ssr-live-settings-v1") ?? "{}");
        for (const key of Object.keys(settings)) {
            if (key === "pauseAt") {
                if (saved[key] === "off" || RARITIES.includes(saved[key]))
                    settings[key] = saved[key];
            }
            else if (typeof saved[key] === "boolean")
                settings[key] = saved[key];
        }
    }
    catch { /* Settings can remain session-local. */ }
    return settings;
}
export function reachesPause(rarity, threshold) {
    return threshold !== "off" && RARITIES.indexOf(rarity) >= RARITIES.indexOf(threshold);
}
