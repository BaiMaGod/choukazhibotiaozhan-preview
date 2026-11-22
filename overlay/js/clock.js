const jumpLimit = 5 * 60000;
const stableInterval = 15000;
export class DeviceClock {
    constructor(wall, monotonic) {
        this.anchorWall = this.previous = wall;
        this.anchorTick = monotonic;
    }
    read(wall, monotonic) {
        const expected = this.anchorWall + (monotonic - this.anchorTick);
        if (Math.abs(expected - wall) <= jumpLimit) {
            this.proposed = undefined;
        }
        else if (!this.proposed || Math.abs(wall - this.proposed.wall - (monotonic - this.proposed.monotonic)) > 1000) {
            this.proposed = { wall, monotonic };
        }
        else if (monotonic - this.proposed.monotonic >= stableInterval) {
            this.proposed = undefined;
        }
        if (this.proposed)
            return { now: this.previous, unstable: true };
        this.anchorWall = wall;
        this.anchorTick = monotonic;
        this.previous = wall;
        return { now: wall, unstable: false };
    }
}
