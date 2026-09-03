import assert from "node:assert/strict";
import test from "node:test";
import { rainyForestSection01Plan } from "../dist/rainy-forest-section-01-poc-fixture.js";
import { deriveSectionExitState } from "../dist/section-continuity.js";

function createPlan({ layers, steps = [] }) {
  return {
    targetDurationSeconds: 10,
    openingSeconds: 0,
    layers,
    steps,
    tailSeconds: 0,
  };
}

function createLayer(id, start = "triggered") {
  return {
    id,
    sound: { soundId: `${id}-sound` },
    start,
  };
}

function createPause(actions) {
  return {
    kind: "pause",
    durationSeconds: 3,
    actions,
  };
}

test("derives the Rainy Forest Section 1 exit continuity", () => {
  assert.deepEqual(deriveSectionExitState(rainyForestSection01Plan), {
    activeLayers: [
      {
        layerId: "forest-bed",
        soundId: "rainy-forest-ambience",
        origin: "sceneStart",
      },
      {
        layerId: "canopy-rain",
        soundId: "rain-canopy-steady",
        origin: "sceneStart",
      },
      {
        layerId: "trail-steps",
        soundId: "wet-trail-footsteps",
        origin: "triggered",
      },
    ],
  });
});

test("keeps a scene-start layer active without actions", () => {
  const plan = createPlan({
    layers: [createLayer("forest", "sceneStart")],
  });

  assert.deepEqual(deriveSectionExitState(plan), {
    activeLayers: [
      {
        layerId: "forest",
        soundId: "forest-sound",
        origin: "sceneStart",
      },
    ],
  });
});

test("keeps an unstopped triggered layer active", () => {
  const plan = createPlan({
    layers: [createLayer("steps")],
    steps: [
      createPause([
        { kind: "startLayer", layerId: "steps", offsetSeconds: 1 },
      ]),
    ],
  });

  assert.deepEqual(deriveSectionExitState(plan), {
    activeLayers: [
      {
        layerId: "steps",
        soundId: "steps-sound",
        origin: "triggered",
      },
    ],
  });
});

test("omits a triggered layer that is started and stopped", () => {
  const plan = createPlan({
    layers: [createLayer("steps")],
    steps: [
      createPause([
        { kind: "startLayer", layerId: "steps", offsetSeconds: 0 },
        { kind: "stopLayer", layerId: "steps", offsetSeconds: 2 },
      ]),
    ],
  });

  assert.deepEqual(deriveSectionExitState(plan), { activeLayers: [] });
});

test("replays same-step actions by offset without mutating source order", () => {
  const actions = [
    { kind: "stopLayer", layerId: "steps", offsetSeconds: 2 },
    { kind: "startLayer", layerId: "rain", offsetSeconds: 1 },
    { kind: "startLayer", layerId: "steps", offsetSeconds: 1 },
  ];
  const plan = createPlan({
    layers: [createLayer("steps"), createLayer("rain")],
    steps: [createPause(actions)],
  });
  const snapshot = structuredClone(plan);

  assert.deepEqual(deriveSectionExitState(plan), {
    activeLayers: [
      {
        layerId: "rain",
        soundId: "rain-sound",
        origin: "triggered",
      },
    ],
  });
  assert.deepEqual(plan, snapshot);
});

test("surfaces existing JourneyPlan validation failures", () => {
  const plan = createPlan({
    layers: [createLayer("steps")],
    steps: [],
  });

  assert.throws(
    () => deriveSectionExitState(plan),
    (error) =>
      error instanceof TypeError &&
      error.message === "triggered layer was never started: steps",
  );
});

test("does not mutate its JourneyPlan input", () => {
  const plan = createPlan({
    layers: [createLayer("forest", "sceneStart"), createLayer("steps")],
    steps: [
      createPause([
        { kind: "startLayer", layerId: "steps", offsetSeconds: 1 },
      ]),
    ],
  });
  const snapshot = structuredClone(plan);

  deriveSectionExitState(plan);

  assert.deepEqual(plan, snapshot);
});

test("returns continuity objects independent from the JourneyPlan", () => {
  const plan = createPlan({
    layers: [createLayer("forest", "sceneStart")],
  });
  const continuity = deriveSectionExitState(plan);

  continuity.activeLayers[0].layerId = "changed";
  continuity.activeLayers[0].soundId = "changed-sound";
  continuity.activeLayers[0].origin = "triggered";

  assert.equal(plan.layers[0].id, "forest");
  assert.equal(plan.layers[0].sound.soundId, "forest-sound");
  assert.equal(plan.layers[0].start, "sceneStart");
});
