import test from "node:test";
import assert from "node:assert/strict";
import { deriveJourneyPlaybackRequirements } from "../dist/journey-playback-requirements.js";

function boundary(layerId, soundId, kind, globalAtSeconds) {
  return {
    sectionId: "section",
    layerId,
    soundId,
    kind,
    localAtSeconds: globalAtSeconds,
    globalAtSeconds,
  };
}

function timeline(
  timedLayerBoundaries = [],
  activeLayers = [],
  durationSeconds = 10,
) {
  return {
    durationSeconds,
    sections: [],
    layerBoundaries: [],
    finalContinuity: { activeLayers },
    narrations: [],
    events: [],
    timedLayerBoundaries,
  };
}

const active = (layerId, soundId, origin = "sceneStart") => ({
  layerId,
  soundId,
  origin,
});

test("returns empty requirements for an empty journey", () => {
  assert.deepEqual(
    deriveJourneyPlaybackRequirements(timeline([], [], 0)),
    { durationSeconds: 0, persistentLayers: [] },
  );
});

test("closes an active semantic start at journey end", () => {
  assert.deepEqual(
    deriveJourneyPlaybackRequirements(timeline(
      [boundary("forest", "forest-sound", "semanticStart", 2)],
      [active("forest", "forest-sound")],
      10,
    )),
    {
      durationSeconds: 10,
      persistentLayers: [{
        layerId: "forest",
        soundId: "forest-sound",
        startSeconds: 2,
        endSeconds: 10,
        durationSeconds: 8,
        termination: "journeyEnd",
      }],
    },
  );
});

test("closes a semantic start at its semantic stop", () => {
  assert.deepEqual(
    deriveJourneyPlaybackRequirements(timeline([
      boundary("steps", "footsteps", "semanticStart", 1),
      boundary("steps", "footsteps", "semanticStop", 7),
    ])),
    {
      durationSeconds: 10,
      persistentLayers: [{
        layerId: "steps",
        soundId: "footsteps",
        startSeconds: 1,
        endSeconds: 7,
        durationSeconds: 6,
        termination: "semanticStop",
      }],
    },
  );
});

test("inherited declarations and suppressed anchors do not split an interval", () => {
  const result = deriveJourneyPlaybackRequirements(timeline(
    [
      boundary("steps", "footsteps", "semanticStart", 1),
      boundary("steps", "footsteps", "inheritedSceneStartDeclaration", 3),
      boundary("steps", "footsteps", "suppressedInheritedTriggeredStart", 5),
      boundary("steps", "footsteps", "semanticStop", 8),
    ],
  ));

  assert.deepEqual(result.persistentLayers, [{
    layerId: "steps",
    soundId: "footsteps",
    startSeconds: 1,
    endSeconds: 8,
    durationSeconds: 7,
    termination: "semanticStop",
  }]);
});

test("requires inherited declarations and suppressed anchors to be active", () => {
  assert.throws(
    () => deriveJourneyPlaybackRequirements(timeline([
      boundary("forest", "forest-sound", "inheritedSceneStartDeclaration", 0),
    ])),
    /requires an active inherited layer: forest/,
  );
  assert.throws(
    () => deriveJourneyPlaybackRequirements(timeline([
      boundary("steps", "footsteps", "suppressedInheritedTriggeredStart", 2),
    ])),
    /requires an active inherited layer: steps/,
  );
});

test("rejects duplicate starts and stops without active starts", () => {
  assert.throws(
    () => deriveJourneyPlaybackRequirements(timeline(
      [
        boundary("forest", "forest-sound", "semanticStart", 0),
        boundary("forest", "forest-sound", "semanticStart", 1),
      ],
      [active("forest", "forest-sound")],
    )),
    /starts an already-active layer: forest/,
  );
  assert.throws(
    () => deriveJourneyPlaybackRequirements(timeline([
      boundary("steps", "footsteps", "semanticStop", 2),
    ])),
    /stops an inactive layer: steps/,
  );
});

test("rejects conflicting stable sound identity", () => {
  assert.throws(
    () => deriveJourneyPlaybackRequirements(timeline(
      [
        boundary("forest", "sound-a", "semanticStart", 0),
        boundary("forest", "sound-b", "inheritedSceneStartDeclaration", 2),
      ],
      [active("forest", "sound-a")],
    )),
    /soundId conflicts for layer forest: expected sound-a, received sound-b/,
  );
});

test("rejects final continuity that disagrees with boundary replay", () => {
  assert.throws(
    () => deriveJourneyPlaybackRequirements(timeline(
      [boundary("forest", "forest-sound", "semanticStart", 0)],
      [],
    )),
    /finalContinuity\.activeLayers length mismatch/,
  );
  assert.throws(
    () => deriveJourneyPlaybackRequirements(timeline(
      [boundary("forest", "forest-sound", "semanticStart", 0)],
      [active("forest", "wrong")],
    )),
    /mismatch: expected forest\/forest-sound, received forest\/wrong/,
  );
});

test("preserves first-start order and termination distinctions", () => {
  const result = deriveJourneyPlaybackRequirements(timeline(
    [
      boundary("rain", "rain-sound", "semanticStart", 0),
      boundary("forest", "forest-sound", "semanticStart", 0),
      boundary("steps", "footsteps", "semanticStart", 1),
      boundary("steps", "footsteps", "semanticStop", 4),
    ],
    [active("rain", "rain-sound"), active("forest", "forest-sound")],
    10,
  ));

  assert.deepEqual(
    result.persistentLayers.map(({ layerId, termination }) => ({
      layerId,
      termination,
    })),
    [
      { layerId: "rain", termination: "journeyEnd" },
      { layerId: "forest", termination: "journeyEnd" },
      { layerId: "steps", termination: "semanticStop" },
    ],
  );
});

test("validates duration, boundaries, and boundary identity", () => {
  assert.throws(
    () => deriveJourneyPlaybackRequirements(timeline([], [], Number.NaN)),
    /timeline\.durationSeconds must be a finite non-negative number/,
  );
  assert.throws(
    () => deriveJourneyPlaybackRequirements(timeline([
      boundary("forest", "forest-sound", "semanticStart", 11),
    ])),
    /globalAtSeconds must be finite and within the journey duration/,
  );
  assert.throws(
    () => deriveJourneyPlaybackRequirements(timeline([
      boundary(" ", "forest-sound", "semanticStart", 0),
    ])),
    /layerId must be a non-empty string/,
  );
  assert.throws(
    () => deriveJourneyPlaybackRequirements(timeline([
      boundary("forest", "forest-sound", "unknown", 0),
    ])),
    /kind is not supported: unknown/,
  );
});

test("does not mutate input and returns independent records", () => {
  const input = timeline(
    [boundary("forest", "forest-sound", "semanticStart", 0)],
    [active("forest", "forest-sound")],
  );
  const snapshot = structuredClone(input);
  const first = deriveJourneyPlaybackRequirements(input);
  const second = deriveJourneyPlaybackRequirements(input);

  first.persistentLayers[0].layerId = "changed";

  assert.deepEqual(input, snapshot);
  assert.equal(second.persistentLayers[0].layerId, "forest");
});

test("preserves native Rainy Forest timing and ignores suppressed anchors", () => {
  const durationSeconds = 304.90000000000003;
  const result = deriveJourneyPlaybackRequirements(timeline(
    [
      boundary("forest-bed", "rainy-forest-ambience", "semanticStart", 0),
      boundary("canopy-rain", "rain-canopy-steady", "semanticStart", 0),
      boundary("trail-steps", "wet-trail-footsteps", "semanticStart", 18.45),
      boundary("forest-bed", "rainy-forest-ambience", "inheritedSceneStartDeclaration", 97.45),
      boundary("canopy-rain", "rain-canopy-steady", "inheritedSceneStartDeclaration", 97.45),
      boundary("trail-steps", "wet-trail-footsteps", "suppressedInheritedTriggeredStart", 102.45),
      boundary("forest-bed", "rainy-forest-ambience", "inheritedSceneStartDeclaration", 217.60000000000002),
      boundary("canopy-rain", "rain-canopy-steady", "inheritedSceneStartDeclaration", 217.60000000000002),
      boundary("trail-steps", "wet-trail-footsteps", "suppressedInheritedTriggeredStart", 222.60000000000002),
      boundary("trail-steps", "wet-trail-footsteps", "semanticStop", 252.3),
    ],
    [
      active("forest-bed", "rainy-forest-ambience"),
      active("canopy-rain", "rain-canopy-steady"),
    ],
    durationSeconds,
  ));

  assert.deepEqual(result, {
    durationSeconds: 304.90000000000003,
    persistentLayers: [
      {
        layerId: "forest-bed",
        soundId: "rainy-forest-ambience",
        startSeconds: 0,
        endSeconds: 304.90000000000003,
        durationSeconds: 304.90000000000003,
        termination: "journeyEnd",
      },
      {
        layerId: "canopy-rain",
        soundId: "rain-canopy-steady",
        startSeconds: 0,
        endSeconds: 304.90000000000003,
        durationSeconds: 304.90000000000003,
        termination: "journeyEnd",
      },
      {
        layerId: "trail-steps",
        soundId: "wet-trail-footsteps",
        startSeconds: 18.45,
        endSeconds: 252.3,
        durationSeconds: 233.85000000000002,
        termination: "semanticStop",
      },
    ],
  });
});
