import test from "node:test";
import assert from "node:assert/strict";
import {
  assembleJourneyTimeline,
  assembleJourneyTimelineWithTrace,
} from "../dist/journey-assembler.js";
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

function tracedPlan() {
  return {
    targetDurationSeconds: 9,
    openingSeconds: 1,
    layers: [
      {
        id: "bed",
        sound: { soundId: "ambience" },
        start: "sceneStart",
      },
      {
        id: "steps",
        sound: { soundId: "footsteps" },
        start: "triggered",
      },
    ],
    steps: [
      {
        kind: "narration",
        id: "spoken",
        text: "A narration.",
        actions: [
          { kind: "startLayer", layerId: "steps", offsetSeconds: 0 },
        ],
      },
      {
        kind: "event",
        id: "bird",
        sound: { soundId: "bird" },
        beforeSeconds: 1,
        afterSeconds: 1,
      },
      {
        kind: "pause",
        durationSeconds: 2,
        actions: [
          { kind: "stopLayer", layerId: "steps", offsetSeconds: 1 },
        ],
      },
    ],
    tailSeconds: 1,
  };
}

function tracedCompiledScene() {
  return {
    resolvedScene: { durationSeconds: 9, clips: [] },
    trace: {
      narrations: [{
        narrationId: "spoken",
        file: "narration.wav",
        stepIndex: 0,
        startSeconds: 1,
        durationSeconds: 2,
        endSeconds: 3,
      }],
      events: [{
        eventId: "bird",
        file: "bird.wav",
        stepIndex: 1,
        startSeconds: 4,
        durationSeconds: 1,
        endSeconds: 5,
        sequenceEndSeconds: 6,
      }],
      layerActions: [
        {
          layerId: "steps",
          kind: "startLayer",
          stepIndex: 0,
          actionIndex: 0,
          atSeconds: 1,
        },
        {
          layerId: "steps",
          kind: "stopLayer",
          stepIndex: 2,
          actionIndex: 0,
          atSeconds: 7,
        },
      ],
    },
  };
}

function tracedSection(sectionId = "traced", entryContinuity = emptyContinuity()) {
  return {
    sectionId,
    plan: tracedPlan(),
    entryContinuity,
    compiledScene: tracedCompiledScene(),
  };
}

test("empty traced input preserves the base empty journey", () => {
  assert.deepEqual(assembleJourneyTimelineWithTrace([]), {
    durationSeconds: 0,
    sections: [],
    layerBoundaries: [],
    finalContinuity: { activeLayers: [] },
    narrations: [],
    events: [],
    timedLayerBoundaries: [],
  });
});

test("adds compiler-authoritative narration and event global placements", () => {
  const firstPlan = sceneStartPlan();
  const first = {
    sectionId: "first",
    plan: firstPlan,
    entryContinuity: emptyContinuity(),
    compiledScene: {
      resolvedScene: { durationSeconds: 10, clips: [] },
      trace: { narrations: [], events: [], layerActions: [] },
    },
  };
  const second = tracedSection("second", deriveSectionExitState(firstPlan));
  const result = assembleJourneyTimelineWithTrace([first, second]);

  assert.deepEqual(result.narrations, [{
    sectionId: "second",
    narrationId: "spoken",
    file: "narration.wav",
    stepIndex: 0,
    durationSeconds: 2,
    localStartSeconds: 1,
    localEndSeconds: 3,
    globalStartSeconds: 11,
    globalEndSeconds: 13,
  }]);
  assert.deepEqual(result.events, [{
    sectionId: "second",
    eventId: "bird",
    file: "bird.wav",
    stepIndex: 1,
    durationSeconds: 1,
    localStartSeconds: 4,
    localEndSeconds: 5,
    localSequenceEndSeconds: 6,
    globalStartSeconds: 14,
    globalEndSeconds: 15,
    globalSequenceEndSeconds: 16,
  }]);
});

test("times scene-start and explicit-action boundaries without changing kinds", () => {
  const result = assembleJourneyTimelineWithTrace([tracedSection()]);

  assert.deepEqual(
    result.timedLayerBoundaries.map((boundary) => ({
      layerId: boundary.layerId,
      kind: boundary.kind,
      localAtSeconds: boundary.localAtSeconds,
      globalAtSeconds: boundary.globalAtSeconds,
    })),
    [
      {
        layerId: "bed",
        kind: "semanticStart",
        localAtSeconds: 0,
        globalAtSeconds: 0,
      },
      {
        layerId: "steps",
        kind: "semanticStart",
        localAtSeconds: 1,
        globalAtSeconds: 1,
      },
      {
        layerId: "steps",
        kind: "semanticStop",
        localAtSeconds: 7,
        globalAtSeconds: 7,
      },
    ],
  );
  assert.deepEqual(
    result.timedLayerBoundaries.map((boundary) => {
      const { localAtSeconds, globalAtSeconds, ...semanticBoundary } = boundary;
      return semanticBoundary;
    }),
    result.layerBoundaries,
  );
});

test("rejects missing, duplicate, and wrong narration provenance", () => {
  const missing = tracedSection();
  missing.compiledScene.trace.narrations = [];
  assert.throws(
    () => assembleJourneyTimelineWithTrace([missing]),
    /narrations is missing trace for step 0/,
  );

  const duplicate = tracedSection();
  duplicate.compiledScene.trace.narrations.push({
    ...duplicate.compiledScene.trace.narrations[0],
  });
  assert.throws(
    () => assembleJourneyTimelineWithTrace([duplicate]),
    /duplicates narration trace for step 0/,
  );

  const wrong = tracedSection();
  wrong.compiledScene.trace.narrations[0].narrationId = "wrong";
  assert.throws(
    () => assembleJourneyTimelineWithTrace([wrong]),
    /narrationId mismatch.*expected spoken, received wrong/,
  );
});

test("rejects missing and wrong event provenance", () => {
  const missing = tracedSection();
  missing.compiledScene.trace.events = [];
  assert.throws(
    () => assembleJourneyTimelineWithTrace([missing]),
    /events is missing trace for step 1/,
  );

  const wrong = tracedSection();
  wrong.compiledScene.trace.events[0].eventId = "wrong";
  assert.throws(
    () => assembleJourneyTimelineWithTrace([wrong]),
    /eventId mismatch.*expected bird, received wrong/,
  );
});

test("rejects missing, duplicate, and wrong action provenance", () => {
  const missing = tracedSection();
  missing.compiledScene.trace.layerActions.pop();
  assert.throws(
    () => assembleJourneyTimelineWithTrace([missing]),
    /layerActions is missing trace for step 2, action 0/,
  );

  const duplicate = tracedSection();
  duplicate.compiledScene.trace.layerActions.push({
    ...duplicate.compiledScene.trace.layerActions[0],
  });
  assert.throws(
    () => assembleJourneyTimelineWithTrace([duplicate]),
    /duplicates layer action trace/,
  );

  const wrong = tracedSection();
  wrong.compiledScene.trace.layerActions[0].layerId = "wrong";
  assert.throws(
    () => assembleJourneyTimelineWithTrace([wrong]),
    /provenance mismatch/,
  );
});

test("does not mutate traced inputs and returns independent timing objects", () => {
  const input = tracedSection();
  const snapshot = structuredClone(input);
  const first = assembleJourneyTimelineWithTrace([input]);
  const second = assembleJourneyTimelineWithTrace([input]);

  first.narrations[0].narrationId = "changed";
  first.events[0].eventId = "changed";
  first.timedLayerBoundaries[0].layerId = "changed";

  assert.deepEqual(input, snapshot);
  assert.equal(second.narrations[0].narrationId, "spoken");
  assert.equal(second.events[0].eventId, "bird");
  assert.equal(second.timedLayerBoundaries[0].layerId, "bed");
});

function minimalTraceForPlan(plan, actionTimes = new Map()) {
  const trace = { narrations: [], events: [], layerActions: [] };

  for (let stepIndex = 0; stepIndex < plan.steps.length; stepIndex += 1) {
    const step = plan.steps[stepIndex];

    if (step.kind === "narration") {
      trace.narrations.push({
        narrationId: step.id,
        file: `memory/${step.id}.wav`,
        stepIndex,
        startSeconds: 1,
        durationSeconds: 1,
        endSeconds: 2,
      });
    } else if (step.kind === "event") {
      trace.events.push({
        eventId: step.id,
        file: `memory/${step.id}.wav`,
        stepIndex,
        startSeconds: 2,
        durationSeconds: 1,
        endSeconds: 3,
        sequenceEndSeconds: 4,
      });
      continue;
    }

    for (let actionIndex = 0; actionIndex < (step.actions?.length ?? 0); actionIndex += 1) {
      const action = step.actions[actionIndex];
      trace.layerActions.push({
        layerId: action.layerId,
        kind: action.kind,
        stepIndex,
        actionIndex,
        atSeconds: actionTimes.get(`${stepIndex}:${actionIndex}`) ?? 1,
      });
    }
  }

  return trace;
}

test("adds authoritative timing to the frozen Rainy Forest suppressed anchors and stop", () => {
  const section01Exit = deriveSectionExitState(rainyForestSection01Plan);
  const section02Exit = deriveSectionExitState(rainyForestSection02Plan);
  const inputs = [
    {
      sectionId: "section-01",
      plan: rainyForestSection01Plan,
      entryContinuity: emptyContinuity(),
      compiledScene: {
        resolvedScene: { durationSeconds: 97.45, clips: [] },
        trace: minimalTraceForPlan(rainyForestSection01Plan),
      },
    },
    {
      sectionId: "section-02",
      plan: rainyForestSection02Plan,
      entryContinuity: section01Exit,
      compiledScene: {
        resolvedScene: { durationSeconds: 120.15, clips: [] },
        trace: minimalTraceForPlan(
          rainyForestSection02Plan,
          new Map([["0:0", 5]]),
        ),
      },
    },
    {
      sectionId: "section-03",
      plan: rainyForestSection03Plan,
      entryContinuity: section02Exit,
      compiledScene: {
        resolvedScene: { durationSeconds: 87.3, clips: [] },
        trace: minimalTraceForPlan(
          rainyForestSection03Plan,
          new Map([["0:0", 5], ["3:0", 34.7]]),
        ),
      },
    },
  ];
  const result = assembleJourneyTimelineWithTrace(inputs);
  const section02Start = result.timedLayerBoundaries.find(
    (boundary) =>
      boundary.sectionId === "section-02" &&
      boundary.layerId === "trail-steps",
  );
  const section03Boundaries = result.timedLayerBoundaries.filter(
    (boundary) =>
      boundary.sectionId === "section-03" &&
      boundary.layerId === "trail-steps",
  );

  assert.equal(result.durationSeconds, 304.90000000000003);
  assert.equal(section02Start.kind, "suppressedInheritedTriggeredStart");
  assert.equal(section02Start.localAtSeconds, 5);
  assert.equal(section02Start.globalAtSeconds, 102.45);
  assert.deepEqual(
    section03Boundaries.map(({ kind, localAtSeconds, globalAtSeconds }) => ({
      kind,
      localAtSeconds,
      globalAtSeconds,
    })),
    [
      {
        kind: "suppressedInheritedTriggeredStart",
        localAtSeconds: 5,
        globalAtSeconds: 222.60000000000002,
      },
      {
        kind: "semanticStop",
        localAtSeconds: 34.7,
        globalAtSeconds: 252.3,
      },
    ],
  );
  assert.deepEqual(
    result.finalContinuity.activeLayers.map((layer) => layer.layerId),
    ["forest-bed", "canopy-rain"],
  );
});
