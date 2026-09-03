import type { JourneyPlan } from "./journey-plan-types.js";
import { validateJourneyPlan } from "./journey-plan-validator.js";

export type ActiveLayerState = {
  layerId: string;
  soundId: string;
  origin: "sceneStart" | "triggered";
};

export type SectionContinuity = {
  activeLayers: ActiveLayerState[];
};

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

function assertNonEmptyString(value: unknown, path: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
}

export function validateSectionContinuity(
  value: unknown,
): SectionContinuity {
  assertObject(value, "SectionContinuity");
  assertAllowedKeys(value, "SectionContinuity", ["activeLayers"]);

  if (!Object.hasOwn(value, "activeLayers")) {
    throw new TypeError("SectionContinuity.activeLayers is required");
  }

  if (!Array.isArray(value.activeLayers)) {
    throw new TypeError("SectionContinuity.activeLayers must be an array");
  }

  const layerIds = new Set<string>();

  for (let index = 0; index < value.activeLayers.length; index += 1) {
    const path = `SectionContinuity.activeLayers[${index}]`;
    const layer = value.activeLayers[index];
    assertObject(layer, path);
    assertAllowedKeys(layer, path, ["layerId", "soundId", "origin"]);

    for (const key of ["layerId", "soundId", "origin"] as const) {
      if (!Object.hasOwn(layer, key)) {
        throw new TypeError(`${path}.${key} is required`);
      }
    }

    assertNonEmptyString(layer.layerId, `${path}.layerId`);
    assertNonEmptyString(layer.soundId, `${path}.soundId`);

    if (layer.origin !== "sceneStart" && layer.origin !== "triggered") {
      throw new TypeError(
        `${path}.origin must be one of: sceneStart, triggered`,
      );
    }

    const layerId = layer.layerId as string;

    if (layerIds.has(layerId)) {
      throw new TypeError(`${path}.layerId duplicates layer id: ${layerId}`);
    }

    layerIds.add(layerId);
  }

  return value as SectionContinuity;
}

export function deriveSectionExitState(
  plan: JourneyPlan,
): SectionContinuity {
  const validatedPlan = validateJourneyPlan(plan);
  const activeLayerIds = new Set(
    validatedPlan.layers
      .filter((layer) => layer.start === "sceneStart")
      .map((layer) => layer.id),
  );

  for (const step of validatedPlan.steps) {
    if (step.kind === "event") {
      continue;
    }

    const actions = (step.actions ?? [])
      .map((action, index) => ({ action, index }))
      .sort(
        (left, right) =>
          left.action.offsetSeconds - right.action.offsetSeconds ||
          left.index - right.index,
      );

    for (const { action } of actions) {
      if (action.kind === "startLayer") {
        activeLayerIds.add(action.layerId);
      } else {
        activeLayerIds.delete(action.layerId);
      }
    }
  }

  return {
    activeLayers: validatedPlan.layers
      .filter((layer) => activeLayerIds.has(layer.id))
      .map((layer) => ({
        layerId: layer.id,
        soundId: layer.sound.soundId,
        origin: layer.start,
      })),
  };
}
