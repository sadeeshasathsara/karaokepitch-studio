import SignalsmithStretch from 'signalsmith-stretch';

export type PitchEngineMode = 'signalsmith-wasm' | 'worklet-fallback' | 'direct';

/**
 * Real-time studio-grade pitch shifting engine with zero-latency dry bypass.
 * - At 0.0 ST: routes directly through dryGain (guaranteed audio, 0ms DSP latency).
 * - At non-zero ST: smoothly crossfades to Signalsmith Stretch WASM AudioWorklet
 *   (or fallback stereo AudioWorklet if WASM is unavailable).
 */
export class PitchAudioEngine {
  private ctx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private stretchNode: any = null;
  private fallbackNode: AudioWorkletNode | null = null;
  private attachedElement: HTMLAudioElement | null = null;
  private mode: PitchEngineMode = 'direct';
  private currentSemitones = 0;
  private currentVolume = 0.95;
  private stretchStarted = false;

  public getMode(): PitchEngineMode {
    return this.mode;
  }

  public async attach(audioEl: HTMLAudioElement): Promise<PitchEngineMode> {
    if (this.attachedElement === audioEl && this.ctx) {
      await this.resume();
      this.applySemitones(this.currentSemitones);
      return this.mode;
    }

    this.dispose();
    this.attachedElement = audioEl;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtx({ latencyHint: 'interactive' });
    await this.resume();

    this.sourceNode = this.ctx.createMediaElementSource(audioEl);
    this.dryGain = this.ctx.createGain();
    this.wetGain = this.ctx.createGain();
    this.masterGain = this.ctx.createGain();

    this.masterGain.gain.value = this.currentVolume;
    this.dryGain.gain.value = 1;
    this.wetGain.gain.value = 0;

    // Always wire the clean dry bypass path so audio is never silent
    this.sourceNode.connect(this.dryGain);
    this.dryGain.connect(this.masterGain);
    this.wetGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // 1. Try studio-grade Signalsmith Stretch WASM
    try {
      const stretch = await SignalsmithStretch(this.ctx, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.stretchNode = stretch;
      this.sourceNode.connect(stretch);
      stretch.connect(this.wetGain);
      this.mode = 'signalsmith-wasm';
      await this.startStretchIfNeeded();
      this.applySemitones(this.currentSemitones);
      return this.mode;
    } catch (err) {
      console.warn('[PitchAudioEngine] Signalsmith Stretch init failed, trying fallback worklet:', err);
    }

    // 2. Fallback to zero-dependency Stereo AudioWorklet
    try {
      await this.ctx.audioWorklet.addModule('./worklets/pitch-shifter-processor.js');
      this.fallbackNode = new AudioWorkletNode(this.ctx, 'pitch-shifter-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.sourceNode.connect(this.fallbackNode);
      this.fallbackNode.connect(this.wetGain);
      this.mode = 'worklet-fallback';
      this.applySemitones(this.currentSemitones);
      return this.mode;
    } catch (err) {
      console.warn('[PitchAudioEngine] Fallback worklet failed, using direct audio:', err);
    }

    this.mode = 'direct';
    return this.mode;
  }

  private async startStretchIfNeeded(): Promise<void> {
    if (!this.stretchNode || this.stretchStarted) return;
    try {
      await this.stretchNode.start();
      await this.stretchNode.schedule({
        active: true,
        semitones: this.currentSemitones,
        rate: 1,
      });
      this.stretchStarted = true;
    } catch {
      // ignore transient startup errors
    }
  }

  public async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume().catch(() => undefined);
    }
  }

  public setPitch(semitones: number): void {
    const clamped = Math.max(-12, Math.min(12, Math.round(semitones * 2) / 2));
    this.currentSemitones = clamped;
    this.applySemitones(clamped);
  }

  private applySemitones(semitones: number): void {
    if (!this.ctx || !this.dryGain || !this.wetGain) return;

    const now = this.ctx.currentTime;
    const useWet = Math.abs(semitones) >= 0.01 && this.mode !== 'direct';

    if (useWet) {
      if (this.mode === 'signalsmith-wasm' && this.stretchNode) {
        if (!this.stretchStarted) {
          void this.startStretchIfNeeded();
        }
        try {
          void this.stretchNode.schedule({
            active: true,
            semitones,
            rate: 1,
          });
        } catch {
          // ignore
        }
      } else if (this.mode === 'worklet-fallback' && this.fallbackNode) {
        const param = this.fallbackNode.parameters.get('semitones');
        if (param) {
          param.setTargetAtTime(semitones, now, 0.015);
        }
      }
      this.dryGain.gain.setTargetAtTime(0, now, 0.015);
      this.wetGain.gain.setTargetAtTime(1, now, 0.015);
    } else {
      // Zero-latency direct passthrough when pitch is 0.0 ST
      this.dryGain.gain.setTargetAtTime(1, now, 0.015);
      this.wetGain.gain.setTargetAtTime(0, now, 0.015);
    }
  }

  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1.25, volume));
    this.currentVolume = clamped;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.015);
    }
  }

  public dispose(): void {
    try {
      this.sourceNode?.disconnect();
      this.stretchNode?.disconnect?.();
      this.fallbackNode?.disconnect();
      this.dryGain?.disconnect();
      this.wetGain?.disconnect();
      this.masterGain?.disconnect();
      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close();
      }
    } catch {
      // ignore cleanup errors
    }
    this.ctx = null;
    this.sourceNode = null;
    this.stretchNode = null;
    this.fallbackNode = null;
    this.dryGain = null;
    this.wetGain = null;
    this.masterGain = null;
    this.attachedElement = null;
    this.stretchStarted = false;
    this.mode = 'direct';
  }
}
