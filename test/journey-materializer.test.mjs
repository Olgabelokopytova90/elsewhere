import assert from "node:assert/strict";
import test from "node:test";
import { compileScene } from "../dist/scene-compiler.js";
import { materializeJourneyPlan } from "../dist/journey-materializer.js";

function createPlan() {
  return {
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
}

function createSoundCatalog() {
  return {
    "ocean-night-calm": {
      file: "synthetic/ocean.wav",
      durationSeconds: 60,
      placement: "sceneStartLayer",
      profile: "oceanAmbience",
    },
    "sand-footsteps-soft": {
      file: "synthetic/footsteps.wav",
      durationSeconds: 30,
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
}

function createNarrationAssets() {
  const plan = createPlan();
  const narrationSteps = plan.steps.filter(
    (step) => step.kind === "narration",
  );
  const durations = [5, 7, 6, 5];

  return Object.fromEntries(
    narrationSteps.map((step, index) => [
      step.id,
      {
        file: `synthetic/${step.id}.mp3`,
        durationSeconds: durations[index],
        sourceText: step.text,
      },
    ]),
  );
}

function createPolicy() {
  const layerPan = { left: -0.7, center: 0, right: 0.7 };
  const layerLowpass = { near: 12000, mid: 8000, far: 5000 };

  return {
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
}

function assertMaterializationError(
  plan,
  soundCatalog,
  narrationAssets,
  policy,
  message,
) {
  assert.throws(
    () => materializeJourneyPlan(
      plan,
      soundCatalog,
      narrationAssets,
      policy,
    ),
    (error) => error instanceof Error && error.message === message,
  );
}

test("materializes and compiles the validated Night Ocean journey", () => {
  const plan = createPlan();
  const soundCatalog = createSoundCatalog();
  const narrationAssets = createNarrationAssets();
  const policy = createPolicy();
  const snapshots = structuredClone({
    plan,
    soundCatalog,
    narrationAssets,
    policy,
  });

  const materialized = materializeJourneyPlan(
    plan,
    soundCatalog,
    narrationAssets,
    policy,
  );
  const { scene, assetMetadata } = materialized;

  assert.equal(scene.openingSeconds, 3);
  assert.equal(scene.tailSeconds, 5);
  assert.equal(scene.focusRampSeconds, 0.25);
  assert.equal(scene.layers.length, 2);
  assert.equal(scene.steps.length, 8);

  const [ocean, footsteps] = scene.layers;
  assert.equal(ocean.file, "synthetic/ocean.wav");
  assert.equal(ocean.start.kind, "sceneStart");
  assert.deepEqual(ocean.gainByFocus, {
    narration: 0.25,
    environment: 0.4,
  });

  assert.equal(footsteps.file, "synthetic/footsteps.wav");
  assert.equal(footsteps.start.kind, "triggered");
  assert.equal(plan.layers[1].sound.direction, "left");
  assert.equal(footsteps.pan, 0);
  assert.equal(footsteps.lowpassHz, 12000);
  assert.equal(footsteps.fadeInSeconds, 0.3);
  assert.equal(footsteps.fadeOutSeconds, 0.05);

  assert.deepEqual(scene.steps[1].actions, plan.steps[1].actions);
  assert.notEqual(scene.steps[1].actions, plan.steps[1].actions);
  assert.notEqual(scene.steps[1].actions[0], plan.steps[1].actions[0]);
  assert.deepEqual(scene.steps[6].actions, plan.steps[6].actions);
  assert.equal(scene.steps[1].actions[0].kind, "startLayer");
  assert.equal(scene.steps[1].actions[0].offsetSeconds, 0);
  assert.equal(scene.steps[6].actions[0].kind, "stopLayer");
  assert.equal(scene.steps[6].actions[0].offsetSeconds, 1);

  const narrationSteps = scene.steps.filter(
    (step) => step.kind === "narration",
  );
  assert.equal(narrationSteps.length, 4);

  for (const narration of narrationSteps) {
    assert.equal(narration.file, `synthetic/${narration.id}.mp3`);
    assert.equal(narration.gain, 0.7);
    assert.equal(narration.focus, "narration");
  }

  for (const pause of scene.steps.filter((step) => step.kind === "pause")) {
    assert.equal(pause.focus, "environment");
  }

  const gull = scene.steps.find((step) => step.kind === "event");
  assert.ok(gull);
  assert.equal(gull.file, "synthetic/gull.wav");
  assert.equal(gull.gain, 0.25);
  assert.equal(gull.pan, 0.8);
  assert.equal(gull.fadeInSeconds, 0.1);
  assert.equal(gull.lowpassHz, 4000);

  assert.deepEqual(Object.keys(assetMetadata).sort(), [
    "synthetic/footsteps.wav",
    "synthetic/gull.wav",
    "synthetic/ocean.wav",
    "synthetic/open-water.mp3",
    "synthetic/shoreline-arrival.mp3",
    "synthetic/shoreline-remains.mp3",
    "synthetic/walking-waterline.mp3",
  ]);

  const resolved = compileScene(scene, assetMetadata);
  const resolvedOcean = resolved.clips.find(
    (clip) => clip.file === "synthetic/ocean.wav",
  );
  const resolvedFootsteps = resolved.clips.find(
    (clip) => clip.file === "synthetic/footsteps.wav",
  );
  const resolvedGull = resolved.clips.find(
    (clip) => clip.file === "synthetic/gull.wav",
  );

  assert.equal(resolved.durationSeconds, 52);
  assert.equal(resolved.durationSeconds - plan.targetDurationSeconds, 7);
  assert.ok(resolvedOcean);
  assert.equal(Object.hasOwn(resolvedOcean, "durationSeconds"), false);
  assert.ok(resolvedFootsteps);
  assert.equal(resolvedFootsteps.startSeconds, 8);
  assert.equal(resolvedFootsteps.durationSeconds, 30);
  assert.equal(
    resolvedFootsteps.startSeconds + resolvedFootsteps.durationSeconds,
    38,
  );
  assert.equal(resolvedFootsteps.fadeOutSeconds, 0.05);
  assert.ok(resolvedFootsteps.gainEnvelope);
  assert.ok(
    resolvedFootsteps.gainEnvelope.every(
      (point) => point.atSeconds <= resolvedFootsteps.durationSeconds,
    ),
  );
  assert.equal(resolvedFootsteps.gainEnvelope.at(-1).atSeconds, 30);
  assert.ok(resolvedGull);
  assert.equal(resolvedGull.startSeconds, 27);
  assert.equal(52 - 5, 47);
  assert.ok(38 < 47);

  assert.deepEqual(plan, snapshots.plan);
  assert.deepEqual(soundCatalog, snapshots.soundCatalog);
  assert.deepEqual(narrationAssets, snapshots.narrationAssets);
  assert.deepEqual(policy, snapshots.policy);
});

test("rejects an unknown soundId", () => {
  const plan = createPlan();
  plan.layers[1].sound.soundId = "sand-running";

  assertMaterializationError(
    plan,
    createSoundCatalog(),
    createNarrationAssets(),
    createPolicy(),
    "Unknown soundId at layers[1].sound.soundId: sand-running",
  );
});

test("rejects a missing narration asset", () => {
  const narrationAssets = createNarrationAssets();
  delete narrationAssets["shoreline-remains"];

  assertMaterializationError(
    createPlan(),
    createSoundCatalog(),
    narrationAssets,
    createPolicy(),
    "Missing narration asset for steps[7]: shoreline-remains",
  );
});

test("rejects narration text that does not match its source", () => {
  const narrationAssets = createNarrationAssets();
  narrationAssets["open-water"].sourceText += " ";

  assertMaterializationError(
    createPlan(),
    createSoundCatalog(),
    narrationAssets,
    createPolicy(),
    "Narration asset text does not match steps[5]: open-water",
  );
});

test("rejects an invalid narration duration", () => {
  const narrationAssets = createNarrationAssets();
  narrationAssets["walking-waterline"].durationSeconds = 0;

  assertMaterializationError(
    createPlan(),
    createSoundCatalog(),
    narrationAssets,
    createPolicy(),
    "Narration asset duration must be finite and positive: walking-waterline",
  );
});

test("rejects an invalid catalog duration", () => {
  const soundCatalog = createSoundCatalog();
  soundCatalog["sand-footsteps-soft"].durationSeconds = Number.NaN;

  assertMaterializationError(
    createPlan(),
    soundCatalog,
    createNarrationAssets(),
    createPolicy(),
    "Catalog asset duration for sand-footsteps-soft must be finite and positive",
  );
});

test("rejects incompatible layer placement", () => {
  const soundCatalog = createSoundCatalog();
  soundCatalog["sand-footsteps-soft"].placement = "event";
  soundCatalog["sand-footsteps-soft"].profile = "distantEvent";

  assertMaterializationError(
    createPlan(),
    soundCatalog,
    createNarrationAssets(),
    createPolicy(),
    "Sound is not valid for a triggered layer at layers[1]: sand-footsteps-soft",
  );
});

test("rejects an event using a layer-only sound", () => {
  const plan = createPlan();
  plan.steps[4].sound.soundId = "ocean-night-calm";

  assertMaterializationError(
    plan,
    createSoundCatalog(),
    createNarrationAssets(),
    createPolicy(),
    "Sound is not valid for an event at steps[4]: ocean-night-calm",
  );
});

test("rejects a missing profile policy", () => {
  const policy = createPolicy();
  delete policy.layerProfiles.listenerMovement;

  assertMaterializationError(
    createPlan(),
    createSoundCatalog(),
    createNarrationAssets(),
    policy,
    "Missing materialization policy for profile: listenerMovement",
  );
});

test("rejects conflicting metadata for one physical file", () => {
  const soundCatalog = createSoundCatalog();
  soundCatalog["gull-distant-single"].file = "synthetic/ocean.wav";

  assertMaterializationError(
    createPlan(),
    soundCatalog,
    createNarrationAssets(),
    createPolicy(),
    "Conflicting metadata durations for file: synthetic/ocean.wav",
  );
});
