import type { JourneyPlan } from "./journey-plan-types.js";

export const rainyForestSection01Plan: JourneyPlan = {
  targetDurationSeconds: 95,
  openingSeconds: 7,
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
        distance: "far",
        prominence: "background",
      },
      start: "sceneStart",
      entrance: "gentle",
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
      id: "arrival-under-canopy",
      text: "The rain has found the high leaves first. Beneath them, the air is cooler, carrying dark bark and wet earth.",
      actions: [],
    },
    {
      kind: "pause",
      durationSeconds: 14,
      actions: [
        {
          kind: "startLayer",
          layerId: "trail-steps",
          offsetSeconds: 4,
        },
      ],
    },
    {
      kind: "narration",
      id: "nearby-forest",
      text: "For a while, the forest stays close: water slipping from branches, moss holding its shine, trunks lifting into the grey.",
      actions: [],
    },
    {
      kind: "event",
      id: "single-nearby-drip",
      sound: {
        soundId: "water-drip-near",
        direction: "left",
        distance: "near",
        prominence: "normal",
      },
      beforeSeconds: 8,
      afterSeconds: 8,
    },
    {
      kind: "pause",
      durationSeconds: 15,
      actions: [],
    },
    {
      kind: "narration",
      id: "path-ahead",
      text: "Ahead, a narrow trail gathers between the ferns, then curves beyond the nearest trees. The deeper forest waits that way.",
      actions: [],
    },
    {
      kind: "pause",
      durationSeconds: 15,
      actions: [],
    },
  ],
  tailSeconds: 4,
};
