import type { AssetMetadata, SemanticScene } from "./scene-types.js";

export const forestScene: SemanticScene = {
  openingSeconds: 2,
  focusRampSeconds: 0.25,
  layers: [
    {
      id: "forest",
      file: "assets/audio/forest-directed-v4-long-bed.wav",
      start: { kind: "sceneStart" },
      gainByFocus: {
        narration: 0.35,
        environment: 0.45,
      },
    },
    {
      id: "footsteps",
      file: "assets/audio/footsteps.wav",
      start: { kind: "triggered" },
      gainByFocus: {
        narration: 0.7,
        environment: 0.95,
      },
      pan: 0.1,
      fadeInSeconds: 0.35,
    },
    {
      id: "creek",
      file: "assets/audio/creek.wav",
      start: { kind: "triggered" },
      gainByFocus: {
        narration: 0.2,
        environment: 0.2,
      },
      fadeInSeconds: 1.75,
      lowpassHz: 4000,
    },
  ],
  steps: [
    {
      kind: "narration",
      id: "narration-01",
      file: "assets/audio/narration-01.mp3",
      gain: 0.7,
      focus: "narration",
    },
    {
      kind: "pause",
      durationSeconds: 2,
      focus: "environment",
      actions: [
        {
          kind: "startLayer",
          layerId: "footsteps",
          offsetSeconds: 1.75,
        },
      ],
    },
    {
      kind: "narration",
      id: "narration-02",
      file: "assets/audio/narration-02.mp3",
      gain: 0.7,
      focus: "narration",
    },
    {
      kind: "pause",
      durationSeconds: 2.25,
      focus: "environment",
    },
    {
      kind: "narration",
      id: "narration-03",
      file: "assets/audio/narration-03.mp3",
      gain: 0.7,
      focus: "narration",
    },
    {
      kind: "event",
      id: "branch",
      file: "assets/audio/branch.wav",
      beforeSeconds: 1.3,
      afterSeconds: 1.75,
      focus: "environment",
      gain: 1.1,
      pan: 0,
    },
    {
      kind: "narration",
      id: "narration-04",
      file: "assets/audio/narration-04.mp3",
      gain: 0.7,
      focus: "narration",
      actions: [
        {
          kind: "startLayer",
          layerId: "creek",
          offsetSeconds: 3,
        },
      ],
    },
  ],
  tailSeconds: 3,
};

export const forestAssetMetadata: AssetMetadata = {
  "assets/audio/forest-directed-v4-long-bed.wav": {
    durationSeconds: 41.593375,
  },
  "assets/audio/footsteps.wav": {
    durationSeconds: 66.76,
  },
  "assets/audio/creek.wav": {
    durationSeconds: 109,
  },
  "assets/audio/narration-01.mp3": {
    durationSeconds: 6.765688,
  },
  "assets/audio/narration-02.mp3": {
    durationSeconds: 5.616313,
  },
  "assets/audio/narration-03.mp3": {
    durationSeconds: 5.433438,
  },
  "assets/audio/branch.wav": {
    durationSeconds: 2.988186,
  },
  "assets/audio/narration-04.mp3": {
    durationSeconds: 8.48975,
  },
};
