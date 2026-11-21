/** Foil crackle synthesis adapted from PRISM sound.js (MIT). Uses the host AudioContext. */
import { clamp } from '../vendor/prism-holo-pack/physics.js?v=6e6c95b0';
export function createFoilAudio(access) {
    let context;
    let source;
    let gain;
    let band;
    let lowpass;
    function dispose() {
        try {
            source?.stop();
        }
        catch { /* Already stopped. */ }
        source?.disconnect();
        gain?.disconnect();
        band?.disconnect();
        lowpass?.disconnect();
        source = undefined;
        gain = undefined;
        band = undefined;
        lowpass = undefined;
        context = undefined;
    }
    function init() {
        const next = access.context();
        if (!access.enabled() || !next || next.state !== 'running')
            return false;
        if (next === context && source)
            return true;
        dispose();
        context = next;
        const buffer = next.createBuffer(1, Math.floor(next.sampleRate * 2), next.sampleRate);
        const data = buffer.getChannelData(0);
        for (let n = 0; n < 880; n++) {
            const start = Math.floor(Math.random() * (data.length - 380));
            const span = 28 + Math.floor(Math.random() * 240), amp = Math.pow(Math.random(), 2.9);
            for (let i = 0; i < span; i++)
                data[start + i] += amp * (Math.random() * 2 - 1) * Math.exp(-i / span * 4.8);
        }
        source = next.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        band = next.createBiquadFilter();
        band.type = 'bandpass';
        band.Q.value = .65;
        lowpass = next.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 6200;
        gain = next.createGain();
        gain.gain.value = 0;
        source.connect(band).connect(lowpass).connect(gain).connect(next.destination);
        source.start();
        return true;
    }
    function setRip(intensity) {
        if (!access.enabled())
            intensity = 0;
        if (!source && intensity <= 0)
            return;
        if (!init() || !context || !source || !gain || !band) {
            if (gain && context)
                gain.gain.setTargetAtTime(0, context.currentTime, .02);
            return;
        }
        const v = clamp(intensity, 0, 1), now = context.currentTime;
        gain.gain.setTargetAtTime(Math.pow(v, .8) * .13, now, v ? .008 : .04);
        band.frequency.setTargetAtTime(1750 + 2100 * v, now, .02);
        source.playbackRate.setTargetAtTime(.72 + .82 * v, now, .02);
    }
    return { setRip, dispose };
}
