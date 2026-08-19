type AudioClip = {
  file: string;
  startSeconds: number;
  pan?: number;
};

export const basicScene: {
  durationSeconds: number;
  clips: AudioClip[];
} = {
  durationSeconds: 20,
  clips: [
    { file: "assets/audio/forest-test.wav", startSeconds: 0 },
    { file: "assets/audio/footsteps.wav", startSeconds: 3, pan: 0.1 },
    { file: "assets/audio/branch.wav", startSeconds: 12, pan: 0.8 },
  ],
};
