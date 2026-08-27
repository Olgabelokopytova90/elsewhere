import assert from "node:assert/strict";
import test from "node:test";
import { compileScene } from "../dist/scene-compiler.js";

function createScene() {
  return {
    openingSeconds: 1,
    focusRampSeconds: 0.25,
    layers: [
      {
        id: "ocean",
        file: "ocean.wav",
        start: { kind: "sceneStart" },
        gainByFocus: {
          narration: 0.4,
          environment: 0.4,
        },
      },
      {
        id: "footsteps",
        file: "footsteps.wav",
        start: { kind: "triggered" },
        gainByFocus: {
          narration: 0.6,
          environment: 0.9,
        },
        fadeOutSeconds: 0.05,
      },
    ],
    steps: [
      {
        kind: "narration",
        id: "arrival",
        file: "narration-01.wav",
        gain: 0.7,
        focus: "narration",
      },
      {
        kind: "pause",
        durationSeconds: 4,
        focus: "environment",
        actions: [
          {
            kind: "startLayer",
            layerId: "footsteps",
            offsetSeconds: 1,
          },
        ],
      },
      {
        kind: "narration",
        id: "waterline",
        file: "narration-02.wav",
        gain: 0.7,
        focus: "narration",
      },
      {
        kind: "pause",
        durationSeconds: 4,
        focus: "environment",
        actions: [
          {
            kind: "stopLayer",
            layerId: "footsteps",
            offsetSeconds: 2,
          },
        ],
      },
    ],
    tailSeconds: 3,
  };
}

function createMetadata() {
  return {
    "ocean.wav": { durationSeconds: 17 },
    "footsteps.wav": { durationSeconds: 8 },
    "narration-01.wav": { durationSeconds: 2 },
    "narration-02.wav": { durationSeconds: 3 },
  };
}

function assertCompileError(scene, metadata, message) {
  assert.throws(
    () => compileScene(scene, metadata),
    (error) => error instanceof Error && error.message === message,
  );
}

test("compiles a stopped triggered layer to a finite resolved clip", () => {
  const resolved = compileScene(createScene(), createMetadata());
  const ocean = resolved.clips.find((clip) => clip.file === "ocean.wav");
  const footsteps = resolved.clips.find(
    (clip) => clip.file === "footsteps.wav",
  );

  assert.equal(resolved.durationSeconds, 17);
  assert.ok(ocean);
  assert.equal(ocean.startSeconds, 0);
  assert.equal(Object.hasOwn(ocean, "durationSeconds"), false);
  assert.equal(Object.hasOwn(ocean, "fadeOutSeconds"), false);

  assert.ok(footsteps);
  assert.equal(footsteps.startSeconds, 4);
  assert.equal(footsteps.durationSeconds, 8);
  assert.equal(footsteps.fadeOutSeconds, 0.05);
  assert.ok(footsteps.gainEnvelope);
  assert.equal(
    footsteps.gainEnvelope.at(-1).atSeconds,
    footsteps.durationSeconds,
  );
  assert.ok(
    footsteps.gainEnvelope.every(
      (point) => point.atSeconds <= footsteps.durationSeconds,
    ),
  );
});

test("processes same-step layer actions chronologically without mutation", () => {
  const scene = createScene();
  const actions = [
    {
      kind: "stopLayer",
      layerId: "footsteps",
      offsetSeconds: 3,
    },
    {
      kind: "startLayer",
      layerId: "footsteps",
      offsetSeconds: 1,
    },
  ];
  scene.steps[1].actions = actions;
  scene.steps[3].actions = [];

  const resolved = compileScene(scene, createMetadata());
  const footsteps = resolved.clips.find(
    (clip) => clip.file === "footsteps.wav",
  );

  assert.ok(footsteps);
  assert.equal(footsteps.startSeconds, 4);
  assert.equal(footsteps.durationSeconds, 2);
  assert.deepEqual(scene.steps[1].actions, actions);
});

test("rejects stopping a layer before it starts", () => {
  const scene = createScene();
  scene.steps[1].actions = [
    {
      kind: "stopLayer",
      layerId: "footsteps",
      offsetSeconds: 0.5,
    },
    {
      kind: "startLayer",
      layerId: "footsteps",
      offsetSeconds: 1,
    },
  ];

  assertCompileError(
    scene,
    createMetadata(),
    "Cannot stop layer before it starts: footsteps",
  );
});

test("rejects stopping a scene-start layer", () => {
  const scene = createScene();
  scene.steps[3].actions.unshift({
    kind: "stopLayer",
    layerId: "ocean",
    offsetSeconds: 1,
  });

  assertCompileError(
    scene,
    createMetadata(),
    "Cannot stop scene-start layer: ocean",
  );
});

test("rejects stopping a layer twice", () => {
  const scene = createScene();
  scene.steps[3].actions.push({
    kind: "stopLayer",
    layerId: "footsteps",
    offsetSeconds: 3,
  });

  assertCompileError(
    scene,
    createMetadata(),
    "Layer stopped more than once: footsteps",
  );
});

test("rejects restarting a stopped layer", () => {
  const scene = createScene();
  scene.steps[3].actions = [
    {
      kind: "stopLayer",
      layerId: "footsteps",
      offsetSeconds: 1,
    },
    {
      kind: "startLayer",
      layerId: "footsteps",
      offsetSeconds: 2,
    },
  ];

  assertCompileError(
    scene,
    createMetadata(),
    "Cannot restart stopped layer: footsteps",
  );
});

test("rejects start and stop at the same timestamp", () => {
  const scene = createScene();
  scene.steps[1].actions = [
    {
      kind: "stopLayer",
      layerId: "footsteps",
      offsetSeconds: 1,
    },
    {
      kind: "stopLayer",
      layerId: "ocean",
      offsetSeconds: 1,
    },
    {
      kind: "startLayer",
      layerId: "footsteps",
      offsetSeconds: 1,
    },
  ];

  assertCompileError(
    scene,
    createMetadata(),
    "Layer actions for the same layer cannot share a timestamp: footsteps",
  );
});

test("rejects an action at the containing step end", () => {
  const scene = createScene();
  scene.steps[3].actions[0].offsetSeconds = 4;

  assertCompileError(
    scene,
    createMetadata(),
    "Layer action offset must be less than the containing step duration",
  );
});

test("rejects an asset shorter than the stopped active interval", () => {
  const metadata = createMetadata();
  metadata["footsteps.wav"].durationSeconds = 7.99;

  assertCompileError(
    createScene(),
    metadata,
    "Layer asset is too short for the resolved scene: footsteps",
  );
});
