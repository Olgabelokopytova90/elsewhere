export type GainPoint = {
  atSeconds: number;
  gain: number;
};

export type AudioClip = {
  file: string;
  startSeconds: number;
  pan?: number;
  gain?: number;
  gainEnvelope?: GainPoint[];
  fadeInSeconds?: number;
  lowpassHz?: number;
};

export type ResolvedScene = {
  durationSeconds: number;
  clips: AudioClip[];
};
