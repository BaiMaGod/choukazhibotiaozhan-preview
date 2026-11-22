import { createPrismPresentation } from './pack-fx/controller-central.js?v=853ca3f';
export { revealDuration } from './pack-fx/controller-central.js?v=853ca3f';
export const createPackPresentation = createPrismPresentation;
// Business reveal order remains the sole durable source of progress.
export function nextRevealSlot(pack) {
    return pack && pack.revealed < pack.cards.length ? pack.revealed : null;
}
