/**
 * Fallback Stereo Granular Pitch Shifter AudioWorkletProcessor
 * Uses dual Hann-windowed overlapping delay taps for smooth real-time pitch shifting
 * without altering tempo, used only if Signalsmith Stretch WASM is unavailable.
 */
class PitchShifterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'semitones',
        defaultValue: 0,
        minValue: -12,
        maxValue: 12,
        automationRate: 'k-rate',
      },
    ];
  }

  constructor() {
    super();
    this.bufferSize = 8192;
    this.windowSize = 2048;
    this.buffers = [new Float32Array(this.bufferSize), new Float32Array(this.bufferSize)];
    this.writeIndex = 0;
    this.phase = 0;
  }

  readInterpolated(buffer, index) {
    const size = this.bufferSize;
    let idx = index % size;
    if (idx < 0) idx += size;
    const i0 = Math.floor(idx);
    const i1 = (i0 + 1) % size;
    const frac = idx - i0;
    return buffer[i0] * (1 - frac) + buffer[i1] * frac;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input.length || !output || !output.length) return true;

    const semitones = parameters.semitones[0];
    const channels = Math.min(input.length, output.length, 2);
    const frames = output[0].length;

    // Zero-latency direct bypass when pitch is 0
    if (Math.abs(semitones) < 0.001) {
      for (let ch = 0; ch < channels; ch++) {
        output[ch].set(input[ch]);
      }
      return true;
    }

    const pitchRatio = Math.pow(2, semitones / 12);
    const phaseStep = (1 - pitchRatio) / this.windowSize;

    for (let i = 0; i < frames; i++) {
      for (let ch = 0; ch < channels; ch++) {
        this.buffers[ch][this.writeIndex] = input[ch][i];
      }

      const p1 = this.phase;
      const p2 = (this.phase + 0.5) % 1;

      const d1 = p1 * this.windowSize;
      const d2 = p2 * this.windowSize;

      // Hann windows (sum to 1.0 when offset by 0.5)
      const g1 = 0.5 - 0.5 * Math.cos(2 * Math.PI * p1);
      const g2 = 0.5 - 0.5 * Math.cos(2 * Math.PI * p2);

      for (let ch = 0; ch < channels; ch++) {
        const s1 = this.readInterpolated(this.buffers[ch], this.writeIndex - d1);
        const s2 = this.readInterpolated(this.buffers[ch], this.writeIndex - d2);
        output[ch][i] = s1 * g1 + s2 * g2;
      }

      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
      this.phase += phaseStep;
      if (this.phase >= 1) this.phase -= 1;
      if (this.phase < 0) this.phase += 1;
    }

    return true;
  }
}

registerProcessor('pitch-shifter-processor', PitchShifterProcessor);
