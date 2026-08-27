import type { JourneyPlan } from "./journey-plan-types.js";

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

function assertNonEmptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
}

function assertFiniteNonNegative(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${path} must be a finite non-negative number`);
  }
}

function assertFinitePositive(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${path} must be a finite positive number`);
  }
}

function assertEnum<const T extends string>(
  value: unknown,
  path: string,
  allowedValues: readonly T[],
): asserts value is T {
  if (typeof value !== "string" || !allowedValues.includes(value as T)) {
    throw new TypeError(
      `${path} must be one of: ${allowedValues.join(", ")}`,
    );
  }
}

function assertArray(value: unknown, path: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${path} must be an array`);
  }
}

function validateSoundIntent(value: unknown, path: string): void {
  assertObject(value, path);
  assertAllowedKeys(value, path, [
    "soundId",
    "direction",
    "distance",
    "prominence",
  ]);
  assertRequiredKey(value, "soundId", `${path}.soundId`);
  assertNonEmptyString(value.soundId, `${path}.soundId`);

  if (Object.hasOwn(value, "direction")) {
    assertEnum(value.direction, `${path}.direction`, [
      "left",
      "center",
      "right",
    ]);
  }

  if (Object.hasOwn(value, "distance")) {
    assertEnum(value.distance, `${path}.distance`, ["near", "mid", "far"]);
  }

  if (Object.hasOwn(value, "prominence")) {
    assertEnum(value.prominence, `${path}.prominence`, [
      "background",
      "normal",
      "foreground",
    ]);
  }
}

function validateLayerCue(value: unknown, path: string): void {
  assertObject(value, path);
  assertAllowedKeys(value, path, ["kind", "layerId", "offsetSeconds"]);
  assertRequiredKey(value, "kind", `${path}.kind`);
  assertRequiredKey(value, "layerId", `${path}.layerId`);
  assertRequiredKey(value, "offsetSeconds", `${path}.offsetSeconds`);
  assertEnum(value.kind, `${path}.kind`, ["startLayer", "stopLayer"]);
  assertNonEmptyString(value.layerId, `${path}.layerId`);
  assertFiniteNonNegative(value.offsetSeconds, `${path}.offsetSeconds`);
}

function validateActions(
  value: unknown,
  path: string,
  pauseDuration?: number,
): void {
  assertArray(value, path);

  for (let index = 0; index < value.length; index += 1) {
    const actionPath = `${path}[${index}]`;
    const action = value[index];
    validateLayerCue(action, actionPath);

    if (pauseDuration !== undefined) {
      assertObject(action, actionPath);
      if ((action.offsetSeconds as number) >= pauseDuration) {
        throw new TypeError(
          `${actionPath}.offsetSeconds must be less than the pause duration`,
        );
      }
    }
  }
}

function validateLayer(value: unknown, path: string): void {
  assertObject(value, path);
  assertAllowedKeys(value, path, ["id", "sound", "start", "entrance"]);
  assertRequiredKey(value, "id", `${path}.id`);
  assertRequiredKey(value, "sound", `${path}.sound`);
  assertRequiredKey(value, "start", `${path}.start`);
  assertNonEmptyString(value.id, `${path}.id`);
  validateSoundIntent(value.sound, `${path}.sound`);
  assertEnum(value.start, `${path}.start`, ["sceneStart", "triggered"]);

  if (Object.hasOwn(value, "entrance")) {
    assertEnum(value.entrance, `${path}.entrance`, ["immediate", "gentle"]);
  }
}

function validateStep(value: unknown, path: string): void {
  assertObject(value, path);
  assertRequiredKey(value, "kind", `${path}.kind`);
  assertEnum(value.kind, `${path}.kind`, ["narration", "pause", "event"]);

  if (value.kind === "narration") {
    assertAllowedKeys(value, path, ["kind", "id", "text", "actions"]);
    assertRequiredKey(value, "id", `${path}.id`);
    assertRequiredKey(value, "text", `${path}.text`);
    assertNonEmptyString(value.id, `${path}.id`);
    assertNonEmptyString(value.text, `${path}.text`);

    if (Object.hasOwn(value, "actions")) {
      validateActions(value.actions, `${path}.actions`);
    }
    return;
  }

  if (value.kind === "pause") {
    assertAllowedKeys(value, path, ["kind", "durationSeconds", "actions"]);
    assertRequiredKey(value, "durationSeconds", `${path}.durationSeconds`);
    assertFiniteNonNegative(value.durationSeconds, `${path}.durationSeconds`);

    if (Object.hasOwn(value, "actions")) {
      validateActions(
        value.actions,
        `${path}.actions`,
        value.durationSeconds,
      );
    }
    return;
  }

  assertAllowedKeys(value, path, [
    "kind",
    "id",
    "sound",
    "beforeSeconds",
    "afterSeconds",
  ]);
  assertRequiredKey(value, "id", `${path}.id`);
  assertRequiredKey(value, "sound", `${path}.sound`);
  assertRequiredKey(value, "beforeSeconds", `${path}.beforeSeconds`);
  assertRequiredKey(value, "afterSeconds", `${path}.afterSeconds`);
  assertNonEmptyString(value.id, `${path}.id`);
  validateSoundIntent(value.sound, `${path}.sound`);
  assertFiniteNonNegative(value.beforeSeconds, `${path}.beforeSeconds`);
  assertFiniteNonNegative(value.afterSeconds, `${path}.afterSeconds`);
}

export function validateJourneyPlan(value: unknown): JourneyPlan {
  assertObject(value, "JourneyPlan");
  assertAllowedKeys(value, "JourneyPlan", [
    "targetDurationSeconds",
    "openingSeconds",
    "layers",
    "steps",
    "tailSeconds",
  ]);
  assertRequiredKey(value, "targetDurationSeconds", "targetDurationSeconds");
  assertRequiredKey(value, "openingSeconds", "openingSeconds");
  assertRequiredKey(value, "layers", "layers");
  assertRequiredKey(value, "steps", "steps");
  assertRequiredKey(value, "tailSeconds", "tailSeconds");
  assertFinitePositive(value.targetDurationSeconds, "targetDurationSeconds");
  assertFiniteNonNegative(value.openingSeconds, "openingSeconds");
  assertFiniteNonNegative(value.tailSeconds, "tailSeconds");
  assertArray(value.layers, "layers");
  assertArray(value.steps, "steps");

  for (let index = 0; index < value.layers.length; index += 1) {
    validateLayer(value.layers[index], `layers[${index}]`);
  }

  for (let index = 0; index < value.steps.length; index += 1) {
    validateStep(value.steps[index], `steps[${index}]`);
  }

  const layersById = new Map<string, UnknownObject>();

  for (let index = 0; index < value.layers.length; index += 1) {
    const layer = value.layers[index] as UnknownObject;
    const id = layer.id as string;

    if (layersById.has(id)) {
      throw new TypeError(`layers[${index}].id duplicates layer id: ${id}`);
    }

    layersById.set(id, layer);
  }

  const stepIds = new Set<string>();

  for (let index = 0; index < value.steps.length; index += 1) {
    const step = value.steps[index] as UnknownObject;

    if (step.kind === "pause") {
      continue;
    }

    const id = step.id as string;

    if (stepIds.has(id)) {
      throw new TypeError(`steps[${index}].id duplicates step id: ${id}`);
    }

    stepIds.add(id);
  }

  type LayerLifecycle = "notStarted" | "active" | "stopped";
  const lifecycleByLayerId = new Map<string, LayerLifecycle>();

  for (const [layerId, layer] of layersById) {
    if (layer.start === "triggered") {
      lifecycleByLayerId.set(layerId, "notStarted");
    }
  }

  for (let stepIndex = 0; stepIndex < value.steps.length; stepIndex += 1) {
    const step = value.steps[stepIndex] as UnknownObject;

    if (!Object.hasOwn(step, "actions")) {
      continue;
    }

    const actions = (step.actions as UnknownObject[])
      .map((action, actionIndex) => ({ action, actionIndex }))
      .sort(
        (left, right) =>
          (left.action.offsetSeconds as number) -
            (right.action.offsetSeconds as number) ||
          left.actionIndex - right.actionIndex,
      );

    const previousOffsetByLayerId = new Map<string, number>();

    for (const { action } of actions) {
      const layerId = action.layerId as string;
      const offsetSeconds = action.offsetSeconds as number;

      if (previousOffsetByLayerId.get(layerId) === offsetSeconds) {
        throw new TypeError(
          `steps[${stepIndex}] contains simultaneous lifecycle actions for layer: ${layerId}`,
        );
      }

      previousOffsetByLayerId.set(layerId, offsetSeconds);
    }

    for (const { action, actionIndex } of actions) {
      const layerId = action.layerId as string;
      const actionPath = `steps[${stepIndex}].actions[${actionIndex}]`;
      const layer = layersById.get(layerId);

      if (layer === undefined) {
        throw new TypeError(
          `${actionPath} references unknown layer: ${layerId}`,
        );
      }

      if (layer.start === "sceneStart") {
        if (action.kind === "startLayer") {
          throw new TypeError(
            `${actionPath} cannot trigger scene-start layer: ${layerId}`,
          );
        }

        throw new TypeError(
          `${actionPath} cannot stop scene-start layer: ${layerId}`,
        );
      }

      const lifecycle = lifecycleByLayerId.get(layerId)!;

      if (action.kind === "stopLayer") {
        if (lifecycle === "notStarted") {
          throw new TypeError(
            `${actionPath} stops layer before it is started: ${layerId}`,
          );
        }

        if (lifecycle === "stopped") {
          throw new TypeError(
            `${actionPath} stops layer more than once: ${layerId}`,
          );
        }

        lifecycleByLayerId.set(layerId, "stopped");
        continue;
      }

      if (lifecycle === "active") {
        throw new TypeError(
          `${actionPath} starts layer more than once: ${layerId}`,
        );
      }

      if (lifecycle === "stopped") {
        throw new TypeError(
          `${actionPath} restarts stopped layer: ${layerId}`,
        );
      }

      lifecycleByLayerId.set(layerId, "active");
    }
  }

  for (const layerValue of value.layers) {
    const layer = layerValue as UnknownObject;

    if (
      layer.start === "triggered" &&
      lifecycleByLayerId.get(layer.id as string) === "notStarted"
    ) {
      throw new TypeError(`triggered layer was never started: ${layer.id}`);
    }
  }

  return value as JourneyPlan;
}
