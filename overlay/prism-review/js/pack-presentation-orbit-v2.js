import { createPrismPresentation } from './pack-fx/controller-orbit-v2.js?v=6171bc4d';
export { revealDuration } from './pack-fx/controller-orbit-v2.js?v=6171bc4d';
export const createPackPresentation = createPrismPresentation;
// Business reveal order remains the sole durable source of progress.
export function nextRevealSlot(pack) {
    return pack && pack.revealed < pack.cards.length ? pack.revealed : null;
}
