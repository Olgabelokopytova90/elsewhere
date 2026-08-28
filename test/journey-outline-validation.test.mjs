import assert from "node:assert/strict";
import test from "node:test";
import {
  validateJourneyOutline,
  validateJourneyRequest,
} from "../dist/journey-outline-validator.js";

function createRequest() {
  return {
    destination: "rainy forest",
    durationSeconds: 300,
    mood: "calm exploratory",
  };
}

function createOutline(sectionCount = 3) {
  const sectionDuration = 100;

  return {
    targetDurationSeconds: sectionCount * sectionDuration,
    sections: Array.from({ length: sectionCount }, (_, index) => ({
      id: `section-${index + 1}`,
      purpose: `Purpose ${index + 1}`,
      description: `Description ${index + 1}`,
      targetDurationSeconds: sectionDuration,
    })),
  };
}

function assertRequestError(value, message) {
  assert.throws(
    () => validateJourneyRequest(value),
    (error) => error instanceof TypeError && error.message === message,
  );
}

function assertOutlineError(value, message) {
  assert.throws(
    () => validateJourneyOutline(value),
    (error) => error instanceof TypeError && error.message === message,
  );
}

test("validates a JourneyRequest without mutation", () => {
  const request = createRequest();
  const snapshot = structuredClone(request);

  assert.equal(validateJourneyRequest(request), request);
  assert.deepEqual(request, snapshot);
});

test("accepts a JourneyRequest without mood", () => {
  const request = createRequest();
  delete request.mood;

  assert.equal(validateJourneyRequest(request), request);
});

test("rejects an empty destination", () => {
  const request = createRequest();
  request.destination = "   ";

  assertRequestError(request, "destination must be a non-empty string");
});

test("rejects an invalid request duration", () => {
  const request = createRequest();
  request.durationSeconds = 300.5;

  assertRequestError(request, "durationSeconds must be a positive integer");
});

test("rejects an unknown JourneyRequest field", () => {
  const request = { ...createRequest(), sounds: [] };

  assertRequestError(
    request,
    "JourneyRequest contains unsupported field: sounds",
  );
});

test("rejects an invalid mood", () => {
  const request = createRequest();
  request.mood = "";

  assertRequestError(request, "mood must be a non-empty string");
});

test("validates a JourneyOutline without mutation", () => {
  const outline = createOutline();
  const snapshot = structuredClone(outline);

  assert.equal(validateJourneyOutline(outline), outline);
  assert.deepEqual(outline, snapshot);
});

test("accepts valid outlines with variable section counts", () => {
  for (const sectionCount of [2, 3, 5]) {
    const outline = createOutline(sectionCount);
    assert.equal(validateJourneyOutline(outline), outline);
  }
});

test("rejects empty outline sections", () => {
  const outline = createOutline();
  outline.sections = [];

  assertOutlineError(outline, "sections must be a non-empty array");
});

test("rejects duplicate section IDs", () => {
  const outline = createOutline();
  outline.sections[1].id = outline.sections[0].id;

  assertOutlineError(
    outline,
    "sections[1].id duplicates section id: section-1",
  );
});

test("rejects an empty section purpose", () => {
  const outline = createOutline();
  outline.sections[0].purpose = "";

  assertOutlineError(
    outline,
    "sections[0].purpose must be a non-empty string",
  );
});

test("rejects an empty section description", () => {
  const outline = createOutline();
  outline.sections[0].description = "   ";

  assertOutlineError(
    outline,
    "sections[0].description must be a non-empty string",
  );
});

test("rejects an invalid section duration", () => {
  const outline = createOutline();
  outline.sections[0].targetDurationSeconds = 0;

  assertOutlineError(
    outline,
    "sections[0].targetDurationSeconds must be a positive integer",
  );
});

test("rejects an invalid outline target duration", () => {
  const outline = createOutline();
  outline.targetDurationSeconds = Number.POSITIVE_INFINITY;

  assertOutlineError(
    outline,
    "targetDurationSeconds must be a positive integer",
  );
});

test("rejects an unknown JourneyOutline field", () => {
  const outline = { ...createOutline(), voice: "warm" };

  assertOutlineError(
    outline,
    "JourneyOutline contains unsupported field: voice",
  );
});

test("rejects an unknown section field", () => {
  const outline = createOutline();
  outline.sections[0].narration = "Welcome.";

  assertOutlineError(
    outline,
    "sections[0] contains unsupported field: narration",
  );
});

test("rejects a section-duration sum mismatch", () => {
  const outline = createOutline();
  outline.sections[0].targetDurationSeconds = 99;

  assertOutlineError(
    outline,
    "JourneyOutline section durations must sum to targetDurationSeconds",
  );
});
