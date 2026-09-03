import type { JourneyPlan } from "./journey-plan-types.js";

export const rainyForestSection02Plan: JourneyPlan = {
  targetDurationSeconds: 125,
  openingSeconds: 5,
  layers: [
    {
      id: "forest-bed",
      sound: {
        soundId: "rainy-forest-ambience",
        direction: "center",
        distance: "far",
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
        distance: "mid",
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
      kind: "pause",
      durationSeconds: 17,
      actions: [
        {
          kind: "startLayer",
          layerId: "trail-steps",
          offsetSeconds: 0,
        },
      ],
    },
    {
      kind: "narration",
      id: "narrowing-path",
      text: "The path narrows where fern fronds lean across it, each one holding a small, bright weight of rain.",
      actions: [],
    },
    {
      kind: "pause",
      durationSeconds: 18,
      actions: [],
    },
    {
      kind: "narration",
      id: "rain-on-slope",
      text: "Rain gathers differently on this slope: a close patter in the leaves, then a softer wash moving downhill through the roots.",
      actions: [],
    },
    {
      kind: "event",
      id: "nearby-drip",
      sound: {
        soundId: "water-drip-near",
        direction: "right",
        distance: "near",
        prominence: "normal",
      },
      beforeSeconds: 3,
      afterSeconds: 5,
    },
    {
      kind: "pause",
      durationSeconds: 17,
      actions: [],
    },
    {
      kind: "narration",
      id: "opening-between-trees",
      text: "Beyond the trunks, the forest opens without quite becoming visible; pale water threads between darker stands of cedar.",
      actions: [],
    },
    {
      kind: "pause",
      durationSeconds: 17,
      actions: [],
    },
    {
      kind: "narration",
      id: "rain-lightening-ahead",
      text: "Ahead, the rain seems finer. The trail continues under the canopy, carrying its quiet shine toward a less shadowed hollow.",
      actions: [],
    },
  ],
  tailSeconds: 4,
};
