import test from "node:test";
import assert from "node:assert/strict";
import { planJourneyPlaybackCoverage } from "../dist/journey-playback-coverage.js";

function requirement(
  layerId,
  soundId,
  startSeconds,
  endSeconds,
  termination = "journeyEnd",
) {
  return {
    layerId,
    soundId,
    startSeconds,
    endSeconds,
    durationSeconds: endSeconds - startSeconds,
    termination,
  };
}

function layerAsset(file, durationSeconds, placement = "sceneStartLayer") {
  return {
    file,
    durationSeconds,
    placement,
    profile: "forestAmbience",
  };
}

test("returns an empty coverage plan", () => {
  assert.deepEqual(
    planJourneyPlaybackCoverage(
      { durationSeconds: 0, persistentLayers: [] },
      {},
    ),
    { durationSeconds: 0, layers: [] },
  );
});

test("classifies sufficient single-pass coverage with its margin", () => {
  const result = planJourneyPlaybackCoverage(
    {
      durationSeconds: 10,
      persistentLayers: [requirement("forest", "forest-sound", 2, 8)],
    },
    { "forest-sound": layerAsset("forest.wav", 10) },
  );

  assert.deepEqual(result.layers, [{
    layerId: "forest",
    soundId: "forest-sound",
    file: "forest.wav",
    requirementStartSeconds: 2,
    requirementEndSeconds: 8,
    requiredDurationSeconds: 6,
    termination: "journeyEnd",
    assetDurationSeconds: 10,
    kind: "singlePass",
    coverageMarginSeconds: 4,
  }]);
});

test("treats an exact fit as single-pass with zero margin", () => {
  const result = planJourneyPlaybackCoverage(
    {
      durationSeconds: 5,
      persistentLayers: [requirement("rain", "rain-sound", 0, 5)],
    },
    { "rain-sound": layerAsset("rain.wav", 5) },
  );

  assert.equal(result.layers[0].kind, "singlePass");
  assert.equal(result.layers[0].coverageMarginSeconds, 0);
});

test("returns insufficient coverage as a planning result", () => {
  const result = planJourneyPlaybackCoverage(
    {
      durationSeconds: 10,
      persistentLayers: [
        requirement("steps", "steps-sound", 1, 9, "semanticStop"),
      ],
    },
    { "steps-sound": layerAsset("steps.wav", 5, "triggeredLayer") },
  );

  assert.deepEqual(result.layers[0], {
    layerId: "steps",
    soundId: "steps-sound",
    file: "steps.wav",
    requirementStartSeconds: 1,
    requirementEndSeconds: 9,
    requiredDurationSeconds: 8,
    termination: "semanticStop",
    assetDurationSeconds: 5,
    kind: "insufficientCoverage",
    deficitSeconds: 3,
  });
});

test("returns mixed results in requirement order with exact identities", () => {
  const requirements = {
    durationSeconds: 12,
    persistentLayers: [
      requirement("second", "short", 2, 12),
      requirement("first", "long", 0, 4, "semanticStop"),
    ],
  };
  const result = planJourneyPlaybackCoverage(requirements, {
    short: layerAsset("short.wav", 5),
    long: layerAsset("long.wav", 8, "triggeredLayer"),
  });

  assert.deepEqual(
    result.layers.map(({ layerId, soundId, kind, termination }) => ({
      layerId,
      soundId,
      kind,
      termination,
    })),
    [
      {
        layerId: "second",
        soundId: "short",
        kind: "insufficientCoverage",
        termination: "journeyEnd",
      },
      {
        layerId: "first",
        soundId: "long",
        kind: "singlePass",
        termination: "semanticStop",
      },
    ],
  );
});

test("rejects missing and event-only catalog bindings", () => {
  const requirements = {
    durationSeconds: 3,
    persistentLayers: [requirement("layer", "sound", 0, 3)],
  };

  assert.throws(
    () => planJourneyPlaybackCoverage(requirements, {}),
    /persistentLayers\[0\]\.soundId is missing from the sound catalog: sound/,
  );
  assert.throws(
    () => planJourneyPlaybackCoverage(requirements, {
      sound: {
        file: "event.wav",
        durationSeconds: 3,
        placement: "event",
        profile: "distantEvent",
      },
    }),
    /soundId is not compatible with persistent-layer playback: sound/,
  );
});

test("rejects malformed catalog duration", () => {
  assert.throws(
    () => planJourneyPlaybackCoverage(
      {
        durationSeconds: 3,
        persistentLayers: [requirement("layer", "sound", 0, 3)],
      },
      { sound: layerAsset("sound.wav", 0) },
    ),
    /Sound catalog duration must be finite and positive: sound/,
  );
});

test("rejects malformed logical timing and inconsistent duration", () => {
  const catalog = { sound: layerAsset("sound.wav", 5) };

  assert.throws(
    () => planJourneyPlaybackCoverage(
      {
        durationSeconds: 3,
        persistentLayers: [{
          ...requirement("layer", "sound", 0, 3),
          startSeconds: Number.NaN,
        }],
      },
      catalog,
    ),
    /startSeconds must be finite/,
  );
  assert.throws(
    () => planJourneyPlaybackCoverage(
      {
        durationSeconds: 3,
        persistentLayers: [{
          ...requirement("layer", "sound", 0, 3),
          durationSeconds: 2,
        }],
      },
      catalog,
    ),
    /durationSeconds must exactly equal endSeconds - startSeconds/,
  );
});

test("preserves native floating-point coverage arithmetic", () => {
  const result = planJourneyPlaybackCoverage(
    {
      durationSeconds: 0.30000000000000004,
      persistentLayers: [requirement(
        "layer",
        "sound",
        0.1,
        0.30000000000000004,
      )],
    },
    { sound: layerAsset("sound.wav", 0.1) },
  );

  assert.equal(result.layers[0].requiredDurationSeconds, 0.20000000000000004);
  assert.equal(result.layers[0].deficitSeconds, 0.10000000000000003);
});

test("does not mutate inputs and returns independent records", () => {
  const requirements = {
    durationSeconds: 4,
    persistentLayers: [requirement("layer", "sound", 0, 4)],
  };
  const catalog = { sound: layerAsset("sound.wav", 5) };
  const requirementsSnapshot = structuredClone(requirements);
  const catalogSnapshot = structuredClone(catalog);
  const first = planJourneyPlaybackCoverage(requirements, catalog);
  const second = planJourneyPlaybackCoverage(requirements, catalog);

  first.layers[0].layerId = "changed";

  assert.deepEqual(requirements, requirementsSnapshot);
  assert.deepEqual(catalog, catalogSnapshot);
  assert.equal(second.layers[0].layerId, "layer");
});

test("exposes all Rainy Forest single-pass deficits without repair", () => {
  const durationSeconds = 304.90000000000003;
  const result = planJourneyPlaybackCoverage(
    {
      durationSeconds,
      persistentLayers: [
        requirement(
          "forest-bed",
          "rainy-forest-ambience",
          0,
          durationSeconds,
        ),
        requirement(
          "canopy-rain",
          "rain-canopy-steady",
          0,
          durationSeconds,
        ),
        requirement(
          "trail-steps",
          "wet-trail-footsteps",
          18.45,
          252.3,
          "semanticStop",
        ),
      ],
    },
    {
      "rainy-forest-ambience": layerAsset("forest.wav", 180),
      "rain-canopy-steady": layerAsset("rain.wav", 180),
      "wet-trail-footsteps": layerAsset(
        "footsteps.wav",
        150,
        "triggeredLayer",
      ),
    },
  );

  assert.deepEqual(
    result.layers.map(({ layerId, kind, deficitSeconds }) => ({
      layerId,
      kind,
      deficitSeconds,
    })),
    [
      {
        layerId: "forest-bed",
        kind: "insufficientCoverage",
        deficitSeconds: 124.90000000000003,
      },
      {
        layerId: "canopy-rain",
        kind: "insufficientCoverage",
        deficitSeconds: 124.90000000000003,
      },
      {
        layerId: "trail-steps",
        kind: "insufficientCoverage",
        deficitSeconds: 83.85000000000002,
      },
    ],
  );
});
