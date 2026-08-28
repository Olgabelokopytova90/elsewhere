import type { JourneyPlan } from "./journey-plan-types.js";
import type {
  MaterializationPolicy,
  SoundCatalog,
} from "./journey-materializer.js";

export const nightOceanPlan: JourneyPlan = {
  targetDurationSeconds: 45,
  openingSeconds: 3,
  layers: [
    {
      id: "ocean",
      sound: {
        soundId: "ocean-night-calm",
        direction: "center",
        distance: "far",
        prominence: "background",
      },
      start: "sceneStart",
      entrance: "immediate",
    },
    {
      id: "footsteps",
      sound: {
        soundId: "sand-footsteps-soft",
        direction: "left",
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
      id: "shoreline-arrival",
      text: "Night gathers along the shoreline. A thin wash of foam finds the dark sand, then slips back.",
      actions: [],
    },
    {
      kind: "pause",
      durationSeconds: 6,
      actions: [
        {
          kind: "startLayer",
          layerId: "footsteps",
          offsetSeconds: 0,
        },
      ],
    },
    {
      kind: "narration",
      id: "walking-waterline",
      text: "Along the waterline, each step leaves a darker print for only a moment. The tide reaches close, cool and silver at its edge.",
      actions: [],
    },
    {
      kind: "pause",
      durationSeconds: 5,
      actions: [],
    },
    {
      kind: "event",
      id: "distant-gull",
      sound: {
        soundId: "gull-distant-single",
        direction: "right",
        distance: "far",
        prominence: "background",
      },
      beforeSeconds: 1,
      afterSeconds: 2,
    },
    {
      kind: "narration",
      id: "open-water",
      text: "Beyond the small breaking waves, the sea becomes one broad field of blackglass, lifted and lowered by moonless swells.",
      actions: [],
    },
    {
      kind: "pause",
      durationSeconds: 5,
      actions: [
        {
          kind: "stopLayer",
          layerId: "footsteps",
          offsetSeconds: 1,
        },
      ],
    },
    {
      kind: "narration",
      id: "shoreline-remains",
      text: "The last footprints soften behind you. Far out, the ocean keeps its patient, unbroken rhythm.",
      actions: [],
    },
  ],
  tailSeconds: 5,
};

export const nightOceanSoundCatalog: SoundCatalog = {
  "ocean-night-calm": {
    file: "synthetic/ocean.wav",
    durationSeconds: 70,
    placement: "sceneStartLayer",
    profile: "oceanAmbience",
  },
  "sand-footsteps-soft": {
    file: "synthetic/footsteps.wav",
    durationSeconds: 40,
    placement: "triggeredLayer",
    profile: "listenerMovement",
  },
  "gull-distant-single": {
    file: "synthetic/gull.wav",
    durationSeconds: 2,
    placement: "event",
    profile: "distantEvent",
  },
};

const layerPan = { left: -0.7, center: 0, right: 0.7 };
const layerLowpass = { near: 12000, mid: 8000, far: 5000 };

export const nightOceanMaterializationPolicy: MaterializationPolicy = {
  focusRampSeconds: 0.25,
  narrationGain: 0.7,
  defaults: {
    direction: "center",
    distance: "mid",
    prominence: "normal",
    entrance: "immediate",
  },
  layerProfiles: {
    oceanAmbience: {
      gainByProminence: {
        background: { narration: 0.25, environment: 0.4 },
        normal: { narration: 0.35, environment: 0.5 },
        foreground: { narration: 0.5, environment: 0.65 },
      },
      panByDirection: layerPan,
      fadeInByEntrance: { gentle: 1 },
      lowpassByDistance: layerLowpass,
    },
    listenerMovement: {
      gainByProminence: {
        background: { narration: 0.4, environment: 0.6 },
        normal: { narration: 0.65, environment: 0.9 },
        foreground: { narration: 0.8, environment: 1 },
      },
      panByDirection: layerPan,
      fadeInByEntrance: { gentle: 0.3 },
      lowpassByDistance: layerLowpass,
      fadeOutSeconds: 0.05,
      directionOverride: "center",
      distanceOverride: "near",
    },
  },
  eventProfiles: {
    distantEvent: {
      gainByProminence: {
        background: 0.25,
        normal: 0.4,
        foreground: 0.6,
      },
      panByDirection: { left: -0.8, center: 0, right: 0.8 },
      lowpassByDistance: { near: 10000, mid: 7000, far: 4000 },
      fadeInSeconds: 0.1,
    },
  },
};
