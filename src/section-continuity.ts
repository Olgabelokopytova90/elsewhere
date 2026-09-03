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
