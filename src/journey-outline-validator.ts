import type {
  JourneyOutline,
  JourneyRequest,
} from "./journey-outline-types.js";

type UnknownObject = Record<string, unknown>;

function assertObject(
  value: unknown,
  path: string,
): asserts value is UnknownObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
}

function assertAllowedKeys(
  value: UnknownObject,
  path: string,
  allowedKeys: readonly string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new TypeError(`${path} contains unsupported field: ${key}`);
    }
  }
}

function assertRequiredKey(
  value: UnknownObject,
  key: string,
  path: string,
): void {
  if (!Object.hasOwn(value, key)) {
    throw new TypeError(`${path} is required`);
  }
}

function assertNonEmptyString(
  value: unknown,
  path: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
}

function assertPositiveInteger(
  value: unknown,
  path: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new TypeError(`${path} must be a positive integer`);
  }
}

export function validateJourneyRequest(value: unknown): JourneyRequest {
  assertObject(value, "JourneyRequest");
  assertAllowedKeys(value, "JourneyRequest", [
    "destination",
    "durationSeconds",
    "mood",
  ]);
  assertRequiredKey(value, "destination", "destination");
  assertRequiredKey(value, "durationSeconds", "durationSeconds");
  assertNonEmptyString(value.destination, "destination");
  assertPositiveInteger(value.durationSeconds, "durationSeconds");

  if (Object.hasOwn(value, "mood")) {
    assertNonEmptyString(value.mood, "mood");
  }

  return value as JourneyRequest;
}

export function validateJourneyOutline(value: unknown): JourneyOutline {
  assertObject(value, "JourneyOutline");
  assertAllowedKeys(value, "JourneyOutline", [
    "targetDurationSeconds",
    "sections",
  ]);
  assertRequiredKey(
    value,
    "targetDurationSeconds",
    "targetDurationSeconds",
  );
  assertRequiredKey(value, "sections", "sections");
  assertPositiveInteger(value.targetDurationSeconds, "targetDurationSeconds");

  if (!Array.isArray(value.sections) || value.sections.length === 0) {
    throw new TypeError("sections must be a non-empty array");
  }

  const sectionIds = new Set<string>();
  let allocatedDurationSeconds = 0;

  for (let index = 0; index < value.sections.length; index += 1) {
    const section = value.sections[index];
    const path = `sections[${index}]`;
    assertObject(section, path);
    assertAllowedKeys(section, path, [
      "id",
      "purpose",
      "description",
      "targetDurationSeconds",
    ]);
    assertRequiredKey(section, "id", `${path}.id`);
    assertRequiredKey(section, "purpose", `${path}.purpose`);
    assertRequiredKey(section, "description", `${path}.description`);
    assertRequiredKey(
      section,
      "targetDurationSeconds",
      `${path}.targetDurationSeconds`,
    );
    assertNonEmptyString(section.id, `${path}.id`);
    assertNonEmptyString(section.purpose, `${path}.purpose`);
    assertNonEmptyString(section.description, `${path}.description`);
    assertPositiveInteger(
      section.targetDurationSeconds,
      `${path}.targetDurationSeconds`,
    );

    if (sectionIds.has(section.id)) {
      throw new TypeError(`${path}.id duplicates section id: ${section.id}`);
    }

    sectionIds.add(section.id);
    allocatedDurationSeconds += section.targetDurationSeconds;
  }

  if (allocatedDurationSeconds !== value.targetDurationSeconds) {
    throw new TypeError(
      "JourneyOutline section durations must sum to targetDurationSeconds",
    );
  }

  return value as JourneyOutline;
}
