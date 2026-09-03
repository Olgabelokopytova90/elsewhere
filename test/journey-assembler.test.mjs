import test from "node:test";
import assert from "node:assert/strict";
import { assembleJourneyTimeline } from "../dist/journey-assembler.js";
import { deriveSectionExitState } from "../dist/section-continuity.js";
import { rainyForestSection01Plan } from "../dist/rainy-forest-section-01-poc-fixture.js";
import { rainyForestSection02Plan } from "../dist/rainy-forest-section-02-poc-fixture.js";
import { rainyForestSection03Plan } from "../dist/rainy-forest-section-03-poc-fixture.js";

const emptyContinuity = () => ({ activeLayers: [] });

function sceneStartPlan(soundId = "ambience") {
  return {
    targetDurationSeconds: 10,
    openingSeconds: 0,
    layers: [
      {
        id: "bed",
        sound: { soundId },
        start: "sceneStart",
      },
    ],
    steps: [],
    tailSeconds: 0,
  };
}

function triggeredPlan(actions = [
  { kind: "startLayer", layerId: "steps", offsetSeconds: 0 },
]) {
  return {
    targetDurationSeconds: 10,
    openingSeconds: 0,
    layers: [
      {
        id: "steps",
        sound: { soundId: "footsteps" },
        start: "triggered",
      },
    ],
    steps: [{ kind: "pause", durationSeconds: 2, actions }],
    tailSeconds: 0,
  };
}

function section(sectionId, plan, entryContinuity, durationSeconds = 10) {
  return {
    sectionId,
    plan,
    entryContinuity,
    resolvedScene: { durationSeconds, clips: [] },
  };
}

test("empty input returns an independent zero-duration journey", () => {
  assert.deepEqual(assembleJourneyTimeline([]), {
    durationSeconds: 0,
    sections: [],
    layerBoundaries: [],
    finalContinuity: { activeLayers: [] },
  });
});

test("places one section at zero and classifies its scene-start layer", () => {
  const result = assembleJourneyTimeline([
    section("one", sceneStartPlan(), emptyContinuity(), 4.5),
  ]);

  assert.deepEqual(result.sections, [{
    sectionId: "one",
    globalStartSeconds: 0,
    globalEndSeconds: 4.5,
    localDurationSeconds: 4.5,
  }]);
  assert.deepEqual(result.layerBoundaries, [{
    sectionId: "one",
    layerId: "bed",
    soundId: "ambience",
    kind: "semanticStart",
  }]);
});

test("uses native arithmetic for deterministic sequential placement", () => {
  const firstPlan = sceneStartPlan();
  const entry = deriveSectionExitState(firstPlan);
  const result = assembleJourneyTimeline([
    section("one", firstPlan, emptyContinuity(), 97.45),
    section("two", sceneStartPlan(), entry, 120.15),
    section("three", sceneStartPlan(), entry, 87.3),
  ]);

  assert.equal(result.sections[1].globalStartSeconds, 97.45);
  assert.equal(result.sections[1].globalEndSeconds, 217.60000000000002);
  assert.equal(result.sections[2].globalStartSeconds, 217.60000000000002);
  assert.equal(result.durationSeconds, 304.90000000000003);
});

test("rejects invalid and duplicate section IDs", () => {
  const plan = sceneStartPlan();
  const first = section("same", plan, emptyContinuity());
  const second = section("same", plan, deriveSectionExitState(plan));

  assert.throws(
    () => assembleJourneyTimeline([{ ...first, sectionId: " " }]),
    /sections\[0\]\.sectionId must be a non-empty string/,
  );
  assert.throws(
    () => assembleJourneyTimeline([first, second]),
    /sections\[1\]\.sectionId duplicates section id: same/,
  );
});

test("validates plans, entry continuity, and resolved duration", () => {
  const valid = section("one", sceneStartPlan(), emptyContinuity());

  assert.throws(
    () => assembleJourneyTimeline([{ ...valid, plan: {} }]),
    /sections\[0\]\.plan is invalid/,
  );
  assert.throws(
    () => assembleJourneyTimeline([{ ...valid, entryContinuity: {} }]),
    /sections\[0\]\.entryContinuity is invalid/,
  );
  assert.throws(
    () => assembleJourneyTimeline([{
      ...valid,
      resolvedScene: { durationSeconds: Number.NaN, clips: [] },
    }]),
    /sections\[0\]\.resolvedScene\.durationSeconds must be a finite non-negative number/,
  );
});

test("rejects nonempty first-section entry continuity", () => {
  const plan = sceneStartPlan();
  assert.throws(
    () => assembleJourneyTimeline([
      section("one", plan, deriveSectionExitState(plan)),
    ]),
    /sections\[0\]\.entryContinuity\.activeLayers must be empty/,
  );
});

test("rejects an ordered boundary continuity mismatch", () => {
  const plan = sceneStartPlan();
  assert.throws(
    () => assembleJourneyTimeline([
      section("one", plan, emptyContinuity()),
      section("two", plan, {
        activeLayers: [{
          layerId: "bed",
          soundId: "wrong",
          origin: "sceneStart",
        }],
      }),
    ]),
    /sections\[1\].*soundId mismatch: expected ambience, received wrong/,
  );
});

test("rejects a stable layer ID mapped to a different sound ID", () => {
  const firstPlan = sceneStartPlan("ambience-a");
  const secondPlan = sceneStartPlan("ambience-b");

  assert.throws(
    () => assembleJourneyTimeline([
      section("one", firstPlan, emptyContinuity()),
      section("two", secondPlan, deriveSectionExitState(firstPlan)),
    ]),
    /layer id bed changed soundId: expected ambience-a, received ambience-b/,
  );
});

test("classifies inherited scene-start declarations without semantic restarts", () => {
  const plan = sceneStartPlan();
  const result = assembleJourneyTimeline([
    section("one", plan, emptyContinuity()),
    section("two", plan, deriveSectionExitState(plan)),
  ]);

  assert.deepEqual(
    result.layerBoundaries.map((boundary) => boundary.kind),
    ["semanticStart", "inheritedSceneStartDeclaration"],
  );
});

test("classifies true and inherited triggered starts", () => {
  const plan = triggeredPlan();
  const result = assembleJourneyTimeline([
    section("one", plan, emptyContinuity()),
    section("two", plan, deriveSectionExitState(plan)),
  ]);

  assert.deepEqual(
    result.layerBoundaries.map((boundary) => boundary.kind),
    ["semanticStart", "suppressedInheritedTriggeredStart"],
  );
});

test("preserves a semantic stop after an inherited technical start", () => {
  const firstPlan = triggeredPlan();
  const secondPlan = triggeredPlan([
    { kind: "startLayer", layerId: "steps", offsetSeconds: 0 },
    { kind: "stopLayer", layerId: "steps", offsetSeconds: 1 },
  ]);
  const result = assembleJourneyTimeline([
    section("one", firstPlan, emptyContinuity()),
    section("two", secondPlan, deriveSectionExitState(firstPlan)),
  ]);

  assert.deepEqual(
    result.layerBoundaries.map((boundary) => boundary.kind),
    [
      "semanticStart",
      "suppressedInheritedTriggeredStart",
      "semanticStop",
    ],
  );
  assert.deepEqual(result.finalContinuity, { activeLayers: [] });
});

test("orders same-step actions by offset then original index without mutation", () => {
  const actions = [
    { kind: "stopLayer", layerId: "steps", offsetSeconds: 1 },
    { kind: "startLayer", layerId: "steps", offsetSeconds: 0 },
  ];
  const plan = triggeredPlan(actions);
  const snapshot = structuredClone(plan);
  const result = assembleJourneyTimeline([
    section("one", plan, emptyContinuity()),
  ]);

  assert.deepEqual(
    result.layerBoundaries.map(({ kind, actionIndex }) => ({ kind, actionIndex })),
    [
      { kind: "semanticStart", actionIndex: 1 },
      { kind: "semanticStop", actionIndex: 0 },
    ],
  );
  assert.deepEqual(plan, snapshot);
});

test("events create no layer boundaries", () => {
  const plan = {
    targetDurationSeconds: 10,
    openingSeconds: 0,
    layers: [],
    steps: [{
      kind: "event",
      id: "bird",
      sound: { soundId: "bird" },
      beforeSeconds: 1,
      afterSeconds: 1,
    }],
    tailSeconds: 0,
  };

  assert.deepEqual(
    assembleJourneyTimeline([
      section("one", plan, emptyContinuity()),
    ]).layerBoundaries,
    [],
  );
});

test("returns output structures independent from caller inputs", () => {
  const plan = sceneStartPlan();
  const input = section("one", plan, emptyContinuity(), 3);
  const snapshot = structuredClone(input);
  const result = assembleJourneyTimeline([input]);

  result.sections[0].sectionId = "changed";
  result.layerBoundaries[0].layerId = "changed";
  result.finalContinuity.activeLayers[0].layerId = "changed";

  assert.deepEqual(input, snapshot);
});

test("assembles the frozen Rainy Forest boundary semantics deterministically", () => {
  const section01Exit = deriveSectionExitState(rainyForestSection01Plan);
  const section02Exit = deriveSectionExitState(rainyForestSection02Plan);
  const result = assembleJourneyTimeline([
    section("section-01", rainyForestSection01Plan, emptyContinuity(), 97.45),
    section("section-02", rainyForestSection02Plan, section01Exit, 120.15),
    section("section-03", rainyForestSection03Plan, section02Exit, 87.3),
  ]);

  assert.equal(result.durationSeconds, 304.90000000000003);
  assert.deepEqual(result.sections, [
    {
      sectionId: "section-01",
      globalStartSeconds: 0,
      globalEndSeconds: 97.45,
      localDurationSeconds: 97.45,
    },
    {
      sectionId: "section-02",
      globalStartSeconds: 97.45,
      globalEndSeconds: 217.60000000000002,
      localDurationSeconds: 120.15,
    },
    {
      sectionId: "section-03",
      globalStartSeconds: 217.60000000000002,
      globalEndSeconds: 304.90000000000003,
      localDurationSeconds: 87.3,
    },
  ]);
  assert.deepEqual(
    result.layerBoundaries.map(({ sectionId, layerId, kind }) => ({
      sectionId,
      layerId,
      kind,
    })),
    [
      { sectionId: "section-01", layerId: "forest-bed", kind: "semanticStart" },
      { sectionId: "section-01", layerId: "canopy-rain", kind: "semanticStart" },
      { sectionId: "section-01", layerId: "trail-steps", kind: "semanticStart" },
      { sectionId: "section-02", layerId: "forest-bed", kind: "inheritedSceneStartDeclaration" },
      { sectionId: "section-02", layerId: "canopy-rain", kind: "inheritedSceneStartDeclaration" },
      { sectionId: "section-02", layerId: "trail-steps", kind: "suppressedInheritedTriggeredStart" },
      { sectionId: "section-03", layerId: "forest-bed", kind: "inheritedSceneStartDeclaration" },
      { sectionId: "section-03", layerId: "canopy-rain", kind: "inheritedSceneStartDeclaration" },
      { sectionId: "section-03", layerId: "trail-steps", kind: "suppressedInheritedTriggeredStart" },
      { sectionId: "section-03", layerId: "trail-steps", kind: "semanticStop" },
    ],
  );
  assert.deepEqual(result.finalContinuity, {
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
    ],
  });
});
