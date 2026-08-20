type AudioClip = {
  file: string;
  startSeconds: number;
  pan?: number;
  gain?: number;
  gainEnvelope?: { atSeconds: number; gain: number }[];
  fadeInSeconds?: number;
  lowpassHz?: number;
};

export const basicScene: {
  durationSeconds: number;
  clips: AudioClip[];
} = {
  durationSeconds: 41.593375,
  clips: [
    {
      file: "assets/audio/forest-directed-v4-long-bed.wav",
      startSeconds: 0,
      gainEnvelope: [
        { atSeconds: 0, gain: 0.45 },
        { atSeconds: 1.75, gain: 0.45 },
        { atSeconds: 2, gain: 0.35 },
        { atSeconds: 8.765688, gain: 0.35 },
        { atSeconds: 9.015688, gain: 0.45 },
        { atSeconds: 10.515688, gain: 0.45 },
        { atSeconds: 10.765688, gain: 0.35 },
        { atSeconds: 16.382001, gain: 0.35 },
        { atSeconds: 16.632001, gain: 0.45 },
        { atSeconds: 18.382001, gain: 0.45 },
        { atSeconds: 18.632001, gain: 0.35 },
        { atSeconds: 24.065439, gain: 0.35 },
        { atSeconds: 24.315439, gain: 0.45 },
        { atSeconds: 29.853625, gain: 0.45 },
        { atSeconds: 30.103625, gain: 0.35 },
        { atSeconds: 38.593375, gain: 0.35 },
        { atSeconds: 38.843375, gain: 0.45 },
        { atSeconds: 41.593375, gain: 0.45 },
      ],
    },
    { file: "assets/audio/narration-01.mp3", startSeconds: 2, gain: 0.7 },
    {
      file: "assets/audio/footsteps.wav",
      startSeconds: 10.515688,
      pan: 0.1,
      gainEnvelope: [
        { atSeconds: 0, gain: 0.95 },
        { atSeconds: 0.25, gain: 0.7 },
        { atSeconds: 5.866313, gain: 0.7 },
        { atSeconds: 6.116313, gain: 0.95 },
        { atSeconds: 7.866313, gain: 0.95 },
        { atSeconds: 8.116313, gain: 0.7 },
        { atSeconds: 13.549751, gain: 0.7 },
        { atSeconds: 13.799751, gain: 0.95 },
        { atSeconds: 19.337937, gain: 0.95 },
        { atSeconds: 19.587937, gain: 0.7 },
        { atSeconds: 28.077687, gain: 0.7 },
        { atSeconds: 28.327687, gain: 0.95 },
        { atSeconds: 31.077687, gain: 0.95 },
      ],
      fadeInSeconds: 0.35,
    },
    {
      file: "assets/audio/narration-02.mp3",
      startSeconds: 10.765688,
      gain: 0.7,
    },
    {
      file: "assets/audio/narration-03.mp3",
      startSeconds: 18.632001,
      gain: 0.7,
    },
    {
      file: "assets/audio/branch.wav",
      startSeconds: 25.365439,
      pan: 0,
      gain: 1.1,
    },
    {
      file: "assets/audio/narration-04.mp3",
      startSeconds: 30.103625,
      gain: 0.7,
    },
    {
      file: "assets/audio/creek.wav",
      startSeconds: 33.103625,
      gain: 0.2,
      fadeInSeconds: 1.75,
      lowpassHz: 4000,
    },
  ],
};
