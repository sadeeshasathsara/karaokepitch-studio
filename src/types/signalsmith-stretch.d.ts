declare module 'signalsmith-stretch' {
  export interface SignalsmithScheduleOptions {
    active?: boolean;
    input?: number;
    rate?: number;
    semitones?: number;
    tonalityHz?: number;
    formantSemitones?: number;
    formantCompensation?: boolean;
    output?: number;
    loopStart?: number;
    loopEnd?: number;
  }

  export interface SignalsmithStretchNode extends AudioWorkletNode {
    schedule(options: SignalsmithScheduleOptions): Promise<void>;
    configure(options: { blockMs?: number; intervalMs?: number; preset?: 'default' | 'cheaper'; splitComputation?: boolean }): Promise<void>;
    setUpdateInterval(seconds: number): Promise<void>;
    start(outputTime?: number): Promise<void>;
    stop(outputTime?: number): Promise<void>;
  }

  export default function SignalsmithStretch(
    audioContext: BaseAudioContext,
    channelOptions?: number | { numberOfInputs?: number; numberOfOutputs?: number; channelCount?: number }
  ): Promise<SignalsmithStretchNode>;
}
