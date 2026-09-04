import type { JourneyPlan } from "./journey-plan-types.js";

export const rainyForestSection03Plan: JourneyPlan = {
  targetDurationSeconds: 80,
  openingSeconds: 5,
  layers: [
    {
      id: "forest-bed",
      sound: {
        soundId: "rainy-forest-ambience",
        direction: "center",
        distance: "mid",
        prominence: "background",
      },
      start: "sceneStart",
      entrance: "immediate",
    },
    {
      id: "canopy-rain",
      sound: {
        soundId: "rain-canopy-steady",
        direction: "center",
        distance: "near",
        prominence: "normal",
      },
      start: "sceneStart",
      entrance: "immediate",
    },
    {
      id: "trail-steps",
      sound: {
        soundId: "wet-trail-footsteps",
        direction: "center",
        distance: "near",
        prominence: "normal",
      },
      start: "triggered",
      entrance: "gentle",
    },
  ],
  steps: [
    {
      kind: "narration",
      id: "opening-clearing",
      text: "Beyond the bend, trunks draw apart. Rain slips through high leaves; a pale opening lies ahead.",
      actions: [
        {
          kind: "startLayer",
          layerId: "trail-steps",
          offsetSeconds: 0,
        },
      ],
    },
    {
      kind: "pause",
      durationSeconds: 14,
      actions: [],
    },
    {
      kind: "narration",
      id: "arrival-moss",
      text: "Here, the ground levels into dark moss. The path ends gently, while water gathers at the exposed roots.",
      actions: [],
    },
    {
      kind: "pause",
      durationSeconds: 14,
      actions: [
        {
          kind: "stopLayer",
          layerId: "trail-steps",
          offsetSeconds: 0,
        },
      ],
    },
    {
      kind: "event",
      id: "clearing-bird",
      sound: {
        soundId: "bird-distant-single",
        direction: "right",
        distance: "far",
        prominence: "background",
      },
      beforeSeconds: 4,
      afterSeconds: 4,
    },
    {
      kind: "narration",
      id: "open-hush",
      text: "Above the clearing, the canopy holds softer gray. Drops continue, widely spaced across the open hush.",
      actions: [],
    },
    {
      kind: "pause",
      durationSeconds: 12,
      actions: [],
    },
  ],
  tailSeconds: 8,
};
