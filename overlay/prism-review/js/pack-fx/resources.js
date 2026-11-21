export const cardBackArt = "./prism-review/assets/fx/card-back.webp";
const layered = new Set(["MCJ18", "MCJ19", "MCJ20", "RBT18", "RBT19", "RBT20", "CPY18", "CPY19", "CPY20", "WHL18", "WHL19", "WHL20", "FOX18", "FOX19", "FOX20", "DER18", "DER19", "DER20", "SPR18", "SPR19", "SPR20"]);
export function pouchArt(url) { return url.replace("assets/art/packs/", "prism-review/assets/fx/packs/"); }
export function cardVisual(url, rarity, id, name) {
    if (!id || !layered.has(id))
        return { url, rarity, id, name };
    const prefix = "./prism-review/assets/fx/layers/" + id.toLowerCase();
    return { url, rarity, id, name, background: prefix + "-background.webp", subject: prefix + "-subject.webp" };
}
