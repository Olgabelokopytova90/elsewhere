import assert from "node:assert/strict";
import test from "node:test";
import { compileScene } from "../dist/scene-compiler.js";
import {
  forestAssetMetadata,
  forestScene,
} from "../dist/forest-scene.js";

const TIMING_TOLERANCE_SECONDS = 1e-9;

function assertTimeApproximately(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) <= TIMING_TOLERANCE_SECONDS,
    `${message}: expected ${expected}, received ${actual}`,
  );
}

function assertGainEnvelope(actual, expected, message) {
  assert.ok(actual, `${message} must exist`);
  assert.equal(actual.length, expected.length, `${message} length`);

  for (let index = 0; index < expected.length; index += 1) {
    const [expectedTime, expectedGain] = expected[index];
    const point = actual[index];

    assertTimeApproximately(
      point.atSeconds,
      expectedTime,
      `${message} point ${index} time`,
    );
    assert.equal(point.gain, expectedGain, `${message} point ${index} gain`);
  }
}

test("compiles the verified forest semantic scene", () => {
  const scene = compileScene(
    forestScene,
    forestAssetMetadata,
  );

  assertTimeApproximately(
    scene.durationSeconds,
    41.593375,
    "scene duration",
  );
  assert.equal(scene.clips.length, 8);
  assert.deepEqual(
    scene.clips.map((clip) => clip.file),
    [
      "assets/audio/forest-directed-v4-long-bed.wav",
      "assets/audio/narration-01.mp3",
      "assets/audio/footsteps.wav",
      "assets/audio/narration-02.mp3",
      "assets/audio/narration-03.mp3",
      "assets/audio/branch.wav",
      "assets/audio/narration-04.mp3",
      "assets/audio/creek.wav",
    ],
  );

  const [
    forest,
    narration01,
    footsteps,
    narration02,
    narration03,
    branch,
    narration04,
    creek,
  ] = scene.clips;

  assert.equal(forest.startSeconds, 0);
  assert.equal(narration01.startSeconds, 2);
  assertTimeApproximately(footsteps.startSeconds, 10.515688, "footsteps start");
  assertTimeApproximately(narration02.startSeconds, 10.765688, "narration-02 start");
  assertTimeApproximately(narration03.startSeconds, 18.632001, "narration-03 start");
  assertTimeApproximately(branch.startSeconds, 25.365439, "branch start");
  assertTimeApproximately(narration04.startSeconds, 30.103625, "narration-04 start");
  assertTimeApproximately(creek.startSeconds, 33.103625, "creek start");

  for (const narration of [
    narration01,
    narration02,
    narration03,
    narration04,
  ]) {
    assert.equal(narration.gain, 0.7);
  }

  assert.equal(footsteps.pan, 0.1);
  assert.equal(footsteps.fadeInSeconds, 0.35);
  assert.equal(footsteps.gain, undefined);
  assert.ok(footsteps.gainEnvelope);

  assert.equal(branch.gain, 1.1);
  assert.equal(branch.pan, 0);
  assert.equal(Object.hasOwn(branch, "pan"), true);

  assert.equal(creek.gain, 0.2);
  assert.equal(creek.fadeInSeconds, 1.75);
  assert.equal(creek.lowpassHz, 4000);
  assert.equal(creek.gainEnvelope, undefined);
  assert.equal(Object.hasOwn(creek, "gain"), true);
  assert.equal(Object.hasOwn(creek, "gainEnvelope"), false);

  assertGainEnvelope(
    forest.gainEnvelope,
    [
      [0, 0.45],
      [1.75, 0.45],
      [2, 0.35],
      [8.765688, 0.35],
      [9.015688, 0.45],
      [10.515688, 0.45],
      [10.765688, 0.35],
      [16.382001, 0.35],
      [16.632001, 0.45],
      [18.382001, 0.45],
      [18.632001, 0.35],
      [24.065439, 0.35],
      [24.315439, 0.45],
      [29.853625, 0.45],
      [30.103625, 0.35],
      [38.593375, 0.35],
      [38.843375, 0.45],
      [41.593375, 0.45],
    ],
    "forest gain envelope",
  );

  assertGainEnvelope(
    footsteps.gainEnvelope,
    [
      [0, 0.95],
      [0.25, 0.7],
      [5.866313, 0.7],
      [6.116313, 0.95],
      [7.866313, 0.95],
      [8.116313, 0.7],
      [13.549751, 0.7],
      [13.799751, 0.95],
      [19.337937, 0.95],
      [19.587937, 0.7],
      [28.077687, 0.7],
      [28.327687, 0.95],
      [31.077687, 0.95],
    ],
    "footsteps gain envelope",
  );
});
