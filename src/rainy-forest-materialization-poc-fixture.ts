import type {
  MaterializationPolicy,
  SoundCatalog,
} from "./journey-materializer.js";

export const rainyForestSoundCatalog: SoundCatalog = {
  "rainy-forest-ambience": {
    file: "synthetic/rainy-forest-ambience.wav",
    durationSeconds: 180,
    placement: "sceneStartLayer",
    profile: "forestAmbience",
  },
  "rain-canopy-steady": {
    file: "synthetic/rain-canopy-steady.wav",
    durationSeconds: 180,
    placement: "sceneStartLayer",
    profile: "rainAmbience",
  },
  "wet-trail-footsteps": {
    file: "synthetic/wet-trail-footsteps.wav",
    durationSeconds: 150,
    placement: "triggeredLayer",
    profile: "listenerMovement",
  },
  "water-drip-near": {
    file: "synthetic/water-drip-near.wav",
    durationSeconds: 1,
    placement: "event",
    profile: "nearEnvironmentalEvent",
  },
};

export const rainyForestMaterializationPolicy: MaterializationPolicy = {
  focusRampSeconds: 0.25,
  narrationGain: 0.7,
  defaults: {
    direction: "center",
    distance: "mid",
    prominence: "normal",
    entrance: "immediate",
  },
  layerProfiles: {
    forestAmbience: {
      gainByProminence: {
        background: { narration: 0.25, environment: 0.4 },
        normal: { narration: 0.35, environment: 0.55 },
        foreground: { narration: 0.5, environment: 0.7 },
      },
      panByDirection: { left: -0.6, center: 0, right: 0.6 },
      fadeInByEntrance: { gentle: 0.8 },
      lowpassByDistance: { near: 12000, mid: 9000, far: 6000 },
    },
    rainAmbience: {
      gainByProminence: {
        background: { narration: 0.2, environment: 0.33 },
        normal: { narration: 0.3, environment: 0.46 },
        foreground: { narration: 0.42, environment: 0.6 },
      },
      panByDirection: { left: -0.4, center: 0, right: 0.4 },
      fadeInByEntrance: { gentle: 0.8 },
      lowpassByDistance: { near: 12000, mid: 8500, far: 6000 },
    },
    listenerMovement: {
      gainByProminence: {
        background: { narration: 0.4, environment: 0.65 },
        normal: { narration: 0.6, environment: 0.85 },
        foreground: { narration: 0.75, environment: 1 },
      },
      panByDirection: { left: -0.7, center: 0, right: 0.7 },
      fadeInByEntrance: { gentle: 0.3 },
      lowpassByDistance: { near: 12000, mid: 8000, far: 5000 },
      fadeOutSeconds: 0.05,
      directionOverride: "center",
      distanceOverride: "near",
    },
  },
  eventProfiles: {
    nearEnvironmentalEvent: {
      gainByProminence: {
        background: 0.25,
        normal: 0.45,
        foreground: 0.65,
      },
      panByDirection: { left: -0.6, center: 0, right: 0.6 },
      lowpassByDistance: { near: 12000, mid: 8000, far: 5000 },
      fadeInSeconds: 0.03,
    },
  },
};
