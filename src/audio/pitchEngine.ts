import SignalsmithStretch from 'signalsmith-stretch';

export type PitchEngineMode = 'signalsmith-wasm' | 'worklet-fallback' | 'direct';

/**
 * Real-time studio-grade pitch shifting engine.
 * Routes an HTMLAudioElement through Signalsmith Stretch WASM AudioWorklet
 * (falling back to our custom Hann-windowed AudioWorklet if WASM is blocked).
 */
export class PitchAudioEngine {
  private ctx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private stretchNode: any = null;
  private fallbackNode: AudioWorkletNode | null = null;
  private attachedElement: HTMLAudioElement | null = null;
  private mode: PitchEngineMode = 'direct';
  private currentSemitones = 0;
  private currentVolume = 0.95;

  public getMode(): PitchEngineMode {
    return this.mode;
  }

  public async attach(audioEl: HTMLAudioElement): Promise<PitchEngineMode> {
    if (this.attachedElement === audioEl && this.ctx) {
      await this.resume();
      return this.mode;
    }

    this.dispose();
    this.attachedElement = audioEl;

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtx({ latencyHint: 'interactive' });
    this.sourceNode = this.ctx.createMediaElementSource(audioEl);
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = this.currentVolume;

    // 1. Try studio-grade Signalsmith Stretch WASM
    try {
      const stretch = await SignalsmithStretch(this.ctx);
      this.stretchNode = stretch;
      this.sourceNode.connect(stretch);
      stretch.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);
      this.mode = 'signalsmith-wasm';
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
      this.fallbackNode.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);
      this.mode = 'worklet-fallback';
      this.applySemitones(this.currentSemitones);
      return this.mode;
    } catch (err) {
      console.warn('[PitchAudioEngine] Fallback worklet failed, using direct audio:', err);
    }

    // 3. Last resort direct passthrough
    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.ctx.destination);
    this.mode = 'direct';
    return this.mode;
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
    if (this.mode === 'signalsmith-wasm' && this.stretchNode) {
      try {
        this.stretchNode.schedule({
          active: true,
          semitones,
          rate: 1,
        });
      } catch {
        // ignore transient scheduling errors
      }
    } else if (this.mode === 'worklet-fallback' && this.fallbackNode && this.ctx) {
      const param = this.fallbackNode.parameters.get('semitones');
      if (param) {
        param.setTargetAtTime(semitones, this.ctx.currentTime, 0.015);
      }
    }
  }

  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1.25, volume));
    this.currentVolume = clamped;
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.015);
    }
  }

  public dispose(): void {
    try {
      this.sourceNode?.disconnect();
      this.stretchNode?.disconnect?.();
      this.fallbackNode?.disconnect();
      this.gainNode?.disconnect();
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
    this.gainNode = null;
    this.attachedElement = null;
    this.mode = 'direct';
  }
}
