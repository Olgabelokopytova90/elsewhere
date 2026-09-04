import test from "node:test";
import assert from "node:assert/strict";
import {
  compileScene,
  compileSceneWithTrace,
} from "../dist/scene-compiler.js";
import { materializeJourneyPlan } from "../dist/journey-materializer.js";
import {
  rainyForestMaterializationPolicy,
  rainyForestSoundCatalog,
} from "../dist/rainy-forest-materialization-poc-fixture.js";
import { rainyForestSection03Plan } from "../dist/rainy-forest-section-03-poc-fixture.js";

function createFixture() {
  return {
    scene: {
      openingSeconds: 0.1,
      focusRampSeconds: 0,
      layers: [
        {
          id: "bed",
          file: "bed.wav",
          start: { kind: "sceneStart" },
          gainByFocus: { narration: 0.5, environment: 0.5 },
        },
        {
          id: "steps",
          file: "steps.wav",
          start: { kind: "triggered" },
          gainByFocus: { narration: 0.7, environment: 0.7 },
          fadeOutSeconds: 0.05,
        },
      ],
      steps: [
        {
          kind: "narration",
          id: "narration-a",
          file: "narration.wav",
          gain: 0.7,
          focus: "narration",
        },
        {
          kind: "event",
          id: "event-a",
          file: "event.wav",
          beforeSeconds: 0.1,
          afterSeconds: 0.3,
          focus: "environment",
        },
        {
          kind: "pause",
          durationSeconds: 2,
          focus: "environment",
          actions: [
            { kind: "stopLayer", layerId: "steps", offsetSeconds: 1 },
            { kind: "startLayer", layerId: "steps", offsetSeconds: 0.25 },
          ],
        },
      ],
      tailSeconds: 0.1,
    },
    metadata: {
      "bed.wav": { durationSeconds: 5 },
      "steps.wav": { durationSeconds: 5 },
      "narration.wav": { durationSeconds: 0.2 },
      "event.wav": { durationSeconds: 0.2 },
    },
  };
}

test("compileSceneWithTrace preserves the existing resolved scene contract", () => {
  const { scene, metadata } = createFixture();
  const resolvedScene = compileScene(scene, metadata);
  const compiled = compileSceneWithTrace(scene, metadata);

  assert.deepEqual(compiled.resolvedScene, resolvedScene);
  assert.deepEqual(Object.keys(resolvedScene), ["durationSeconds", "clips"]);
  assert.equal(Object.hasOwn(resolvedScene, "resolvedScene"), false);

  const stoppedLayer = resolvedScene.clips.find(
    (clip) => clip.file === "steps.wav",
  );
  assert.equal(stoppedLayer.durationSeconds, 0.75);
  assert.equal(stoppedLayer.fadeOutSeconds, 0.05);
});

test("traces narration and event timing at the authoritative cursor", () => {
  const { scene, metadata } = createFixture();
  const { trace } = compileSceneWithTrace(scene, metadata);

  assert.deepEqual(trace.narrations, [
    {
      narrationId: "narration-a",
      file: "narration.wav",
      stepIndex: 0,
      startSeconds: 0.1,
      durationSeconds: 0.2,
      endSeconds: 0.30000000000000004,
    },
  ]);
  assert.deepEqual(trace.events, [
    {
      eventId: "event-a",
      file: "event.wav",
      stepIndex: 1,
      startSeconds: 0.4,
      durationSeconds: 0.2,
      endSeconds: 0.6000000000000001,
      sequenceEndSeconds: 0.9000000000000001,
    },
  ]);
});

test("traces layer actions in execution order with original provenance", () => {
  const { scene, metadata } = createFixture();
  const { trace } = compileSceneWithTrace(scene, metadata);

  assert.deepEqual(trace.layerActions, [
    {
      layerId: "steps",
      kind: "startLayer",
      stepIndex: 2,
      actionIndex: 1,
      atSeconds: 1.1500000000000001,
    },
    {
      layerId: "steps",
      kind: "stopLayer",
      stepIndex: 2,
      actionIndex: 0,
      atSeconds: 1.9000000000000001,
    },
  ]);
  assert.equal(
    trace.layerActions.some((action) => action.layerId === "bed"),
    false,
  );
});

test("does not mutate inputs and returns independent trace records", () => {
  const { scene, metadata } = createFixture();
  const sceneSnapshot = structuredClone(scene);
  const metadataSnapshot = structuredClone(metadata);
  const first = compileSceneWithTrace(scene, metadata);
  const second = compileSceneWithTrace(scene, metadata);

  first.trace.narrations[0].narrationId = "changed";
  first.trace.events.length = 0;
  first.trace.layerActions[0].layerId = "changed";

  assert.deepEqual(scene, sceneSnapshot);
  assert.deepEqual(metadata, metadataSnapshot);
  assert.equal(second.trace.narrations[0].narrationId, "narration-a");
  assert.equal(second.trace.events.length, 1);
  assert.equal(second.trace.layerActions[0].layerId, "steps");
});

test("traces the Rainy Forest Section 3 stop at compiler-authoritative local time", () => {
  const narrationDurations = [8.55, 7.15, 8.6];
  const narrationSteps = rainyForestSection03Plan.steps.filter(
    (step) => step.kind === "narration",
  );
  const narrationAssets = Object.fromEntries(
    narrationSteps.map((step, index) => [
      step.id,
      {
        file: `memory/narration-${index + 1}.wav`,
        durationSeconds: narrationDurations[index],
        sourceText: step.text,
      },
    ]),
  );
  const materialized = materializeJourneyPlan(
    rainyForestSection03Plan,
    rainyForestSoundCatalog,
    narrationAssets,
    rainyForestMaterializationPolicy,
  );
  const compiled = compileSceneWithTrace(
    materialized.scene,
    materialized.assetMetadata,
  );
  const stop = compiled.trace.layerActions.find(
    (action) => action.kind === "stopLayer",
  );

  assert.deepEqual(stop, {
    layerId: "trail-steps",
    kind: "stopLayer",
    stepIndex: 3,
    actionIndex: 0,
    atSeconds: 34.7,
  });
  assert.equal(compiled.resolvedScene.durationSeconds, 87.3);
});
