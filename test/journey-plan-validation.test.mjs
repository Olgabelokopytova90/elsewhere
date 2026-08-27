import assert from "node:assert/strict";
import test from "node:test";
import { validateJourneyPlan } from "../dist/journey-plan-validator.js";

function createValidPlan() {
  return {
    targetDurationSeconds: 45,
    openingSeconds: 2,
    layers: [
      {
        id: "ocean",
        sound: {
          soundId: "ocean-night-calm",
          direction: "center",
          distance: "mid",
          prominence: "background",
        },
        start: "sceneStart",
        entrance: "gentle",
      },
      {
        id: "footsteps",
        sound: {
          soundId: "sand-footsteps-soft",
          direction: "center",
          distance: "near",
          prominence: "normal",
        },
        start: "triggered",
      },
    ],
    steps: [
      {
        kind: "narration",
        id: "arrival",
        text: "The ocean stretches into the night.",
        actions: [
          {
            kind: "startLayer",
            layerId: "footsteps",
            offsetSeconds: 1,
          },
        ],
      },
      {
        kind: "pause",
        durationSeconds: 2,
      },
      {
        kind: "event",
        id: "gull",
        sound: {
          soundId: "gull-distant-single",
          direction: "right",
          distance: "far",
          prominence: "normal",
        },
        beforeSeconds: 1,
        afterSeconds: 2,
      },
    ],
    tailSeconds: 3,
  };
}

function assertValidationError(plan, message) {
  assert.throws(
    () => validateJourneyPlan(plan),
    (error) => error instanceof TypeError && error.message === message,
  );
}

test("returns the same fully validated JourneyPlan without mutation", () => {
  const plan = createValidPlan();
  const snapshot = structuredClone(plan);

  assert.equal(validateJourneyPlan(plan), plan);
  assert.deepEqual(plan, snapshot);
});

test("rejects a non-object JourneyPlan", () => {
  assertValidationError(null, "JourneyPlan must be an object");
});

test("rejects a missing required root field", () => {
  const plan = createValidPlan();
  delete plan.tailSeconds;

  assertValidationError(plan, "tailSeconds is required");
});

test("rejects an invalid SoundIntent enum", () => {
  const plan = createValidPlan();
  plan.layers[1].sound.direction = "above";

  assertValidationError(
    plan,
    "layers[1].sound.direction must be one of: left, center, right",
  );
});

test("rejects whitespace-only narration", () => {
  const plan = createValidPlan();
  plan.steps[0].text = "   ";

  assertValidationError(plan, "steps[0].text must be a non-empty string");
});

test("rejects negative timing", () => {
  const plan = createValidPlan();
  plan.openingSeconds = -1;

  assertValidationError(
    plan,
    "openingSeconds must be a finite non-negative number",
  );
});

test("rejects non-finite timing", () => {
  const plan = createValidPlan();
  plan.steps[2].afterSeconds = Number.POSITIVE_INFINITY;

  assertValidationError(
    plan,
    "steps[2].afterSeconds must be a finite non-negative number",
  );
});

test("rejects duplicate layer IDs", () => {
  const plan = createValidPlan();
  plan.layers.push({
    id: "footsteps",
    sound: { soundId: "other-footsteps" },
    start: "sceneStart",
  });

  assertValidationError(
    plan,
    "layers[2].id duplicates layer id: footsteps",
  );
});

test("rejects duplicate narration and event step IDs", () => {
  const plan = createValidPlan();
  plan.steps[2].id = "arrival";

  assertValidationError(
    plan,
    "steps[2].id duplicates step id: arrival",
  );
});

test("rejects an action referencing an unknown layer", () => {
  const plan = createValidPlan();
  plan.steps[0].actions[0].layerId = "wind";

  assertValidationError(
    plan,
    "steps[0].actions[0] references unknown layer: wind",
  );
});

test("rejects an action targeting a scene-start layer", () => {
  const plan = createValidPlan();
  plan.steps[0].actions[0].layerId = "ocean";

  assertValidationError(
    plan,
    "steps[0].actions[0] cannot trigger scene-start layer: ocean",
  );
});

test("rejects a triggered layer started twice", () => {
  const plan = createValidPlan();
  plan.steps[1].actions = [
    {
      kind: "startLayer",
      layerId: "footsteps",
      offsetSeconds: 1,
    },
  ];

  assertValidationError(
    plan,
    "steps[1].actions[0] starts layer more than once: footsteps",
  );
});

test("rejects a triggered layer that is never started", () => {
  const plan = createValidPlan();
  delete plan.steps[0].actions;

  assertValidationError(plan, "triggered layer was never started: footsteps");
});

test("rejects unsupported technical fields", () => {
  const plan = createValidPlan();
  plan.steps[0].startSeconds = 12;

  assertValidationError(
    plan,
    "steps[0] contains unsupported field: startSeconds",
  );
});

for (const offsetSeconds of [2, 2.5]) {
  test(`rejects pause action offset ${offsetSeconds} outside its duration`, () => {
    const plan = createValidPlan();
    delete plan.steps[0].actions;
    plan.steps[1].actions = [
      {
        kind: "startLayer",
        layerId: "footsteps",
        offsetSeconds,
      },
    ];

    assertValidationError(
      plan,
      "steps[1].actions[0].offsetSeconds must be less than the pause duration",
    );
  });
}

test("accepts a pause action offset within its duration", () => {
  const plan = createValidPlan();
  delete plan.steps[0].actions;
  plan.steps[1].actions = [
    {
      kind: "startLayer",
      layerId: "footsteps",
      offsetSeconds: 1.5,
    },
  ];

  assert.equal(validateJourneyPlan(plan), plan);
});
