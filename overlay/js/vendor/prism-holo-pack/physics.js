/** Adapted from SimpleMkt PRISM 5a94862 (MIT). See LICENSE.txt and UPSTREAM.md. */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export class SpringValue {
    constructor(initial = 0, response = .5, bounce = 0) {
        this.v = 0;
        this.k = 0;
        this.c = 0;
        this.x = this.to = initial;
        this.configure(response, bounce);
    }
    configure(response, bounce = 0) {
        const omega = 2 * Math.PI / response;
        this.k = omega * omega;
        this.c = 4 * Math.PI * (1 - bounce) / response;
        return this;
    }
    step(dt) {
        this.v += (this.k * (this.to - this.x) - this.c * this.v) * dt;
        this.x += this.v * dt;
    }
    reset(value = 0) { this.x = this.to = value; this.v = 0; }
}
/** Limit catch-up after backgrounding. 240Hz is integration, not render FPS. */
export function stepSprings(springs, elapsed) {
    const dt = clamp(elapsed, 0, .05);
    const steps = Math.max(1, Math.ceil(dt * 240));
    for (let n = 0; n < steps; n++)
        for (const spring of springs)
            spring.step(dt / steps);
}
