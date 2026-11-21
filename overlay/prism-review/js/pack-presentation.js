import { createPrismPresentation } from './pack-fx/controller.js?v=6e6c95b0';
export { revealDuration } from './pack-fx/controller.js?v=6e6c95b0';
export const createPackPresentation = createPrismPresentation;
// Business reveal order remains the sole durable source of progress.
export function nextRevealSlot(pack) {
    return pack && pack.revealed < pack.cards.length ? pack.revealed : null;
}
