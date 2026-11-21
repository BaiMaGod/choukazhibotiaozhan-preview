export const CARD_W = 180;
export const CARD_H = 280;
export const CARD_D = 20;
export const SLICES = 48;
export const SLICE_H = CARD_H / SLICES;
/** Cosine bulge profile — max 12px at center, 0 at edges */
export function getPouch(t) {
    const centered = (t - 0.5) * 2;
    const abs = Math.abs(centered);
    return Math.max(0, Math.cos(abs * Math.PI * 0.55)) * 12;
}
export function getSliceTransform(index, _twist, _pouch) {
    const t = index / (SLICES - 1);
    const zBulge = getPouch(t);
    const isCrimp = t < 0.08 || t > 0.92;
    return {
        translateY: index * SLICE_H,
        translateZ: zBulge,
        isCrimp,
    };
}
