import type { JourneyPlan } from "./journey-plan-types.js";
import { validateJourneyPlan } from "./journey-plan-validator.js";
import type {
  SectionContinuity,
} from "./section-continuity.js";
import {
  deriveSectionExitState,
  validateSectionContinuity,
} from "./section-continuity.js";
import type { ResolvedScene } from "./audio-types.js";

export type JourneySectionInput = {
  sectionId: string;
  plan: JourneyPlan;
  entryContinuity: SectionContinuity;
  resolvedScene: ResolvedScene;
};

export type JourneySectionPlacement = {
  sectionId: string;
  globalStartSeconds: number;
  globalEndSeconds: number;
  localDurationSeconds: number;
};

export type JourneyLayerBoundaryKind =
  | "semanticStart"
  | "inheritedSceneStartDeclaration"
  | "suppressedInheritedTriggeredStart"
  | "semanticStop";

export type JourneyLayerBoundary = {
  sectionId: string;
  layerId: string;
  soundId: string;
  kind: JourneyLayerBoundaryKind;
  stepIndex?: number;
  actionIndex?: number;
};

export type AssembledJourneyTimeline = {
  durationSeconds: number;
  sections: JourneySectionPlacement[];
  layerBoundaries: JourneyLayerBoundary[];
  finalContinuity: SectionContinuity;
};

function copyContinuity(continuity: SectionContinuity): SectionContinuity {
  return {
    activeLayers: continuity.activeLayers.map((layer) => ({ ...layer })),
  };
}

function assertContinuityMatches(
  expected: SectionContinuity,
  actual: SectionContinuity,
  sectionIndex: number,
): void {
  if (expected.activeLayers.length !== actual.activeLayers.length) {
    throw new Error(
      `sections[${sectionIndex}].entryContinuity.activeLayers length mismatch: expected ${expected.activeLayers.length}, received ${actual.activeLayers.length}`,
    );
  }

  for (let index = 0; index < expected.activeLayers.length; index += 1) {
    const expectedLayer = expected.activeLayers[index];
    const actualLayer = actual.activeLayers[index];

    for (const key of ["layerId", "soundId", "origin"] as const) {
      if (expectedLayer[key] !== actualLayer[key]) {
        throw new Error(
          `sections[${sectionIndex}].entryContinuity.activeLayers[${index}].${key} mismatch: expected ${expectedLayer[key]}, received ${actualLayer[key]}`,
        );
      }
    }
  }
}

/**
 * Produces semantic boundary diagnostics and sequential section placement.
 * The result is not renderer input and contains no physical playback commands.
 */
export function assembleJourneyTimeline(
  sections: JourneySectionInput[],
): AssembledJourneyTimeline {
  const placements: JourneySectionPlacement[] = [];
  const layerBoundaries: JourneyLayerBoundary[] = [];
  const sectionIds = new Set<string>();
  const soundIdByLayerId = new Map<string, string>();
  let durationSeconds = 0;
  let previousExit: SectionContinuity = { activeLayers: [] };

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    const path = `sections[${sectionIndex}]`;

    if (
      typeof section.sectionId !== "string" ||
      section.sectionId.trim().length === 0
    ) {
      throw new TypeError(`${path}.sectionId must be a non-empty string`);
    }

    if (sectionIds.has(section.sectionId)) {
      throw new Error(`${path}.sectionId duplicates section id: ${section.sectionId}`);
    }

    sectionIds.add(section.sectionId);

    let plan: JourneyPlan;
    let entryContinuity: SectionContinuity;

    try {
      plan = validateJourneyPlan(section.plan);
    } catch (cause) {
      throw new TypeError(`${path}.plan is invalid`, { cause });
    }

    try {
      entryContinuity = validateSectionContinuity(section.entryContinuity);
    } catch (cause) {
      throw new TypeError(`${path}.entryContinuity is invalid`, { cause });
    }

    if (
      !Number.isFinite(section.resolvedScene.durationSeconds) ||
      section.resolvedScene.durationSeconds < 0
    ) {
      throw new RangeError(
        `${path}.resolvedScene.durationSeconds must be a finite non-negative number`,
      );
    }

    if (sectionIndex === 0 && entryContinuity.activeLayers.length !== 0) {
      throw new Error("sections[0].entryContinuity.activeLayers must be empty");
    }

    if (sectionIndex > 0) {
      assertContinuityMatches(previousExit, entryContinuity, sectionIndex);
    }

    for (const layer of plan.layers) {
      const knownSoundId = soundIdByLayerId.get(layer.id);

      if (knownSoundId !== undefined && knownSoundId !== layer.sound.soundId) {
        throw new Error(
          `${path}.plan layer id ${layer.id} changed soundId: expected ${knownSoundId}, received ${layer.sound.soundId}`,
        );
      }

      soundIdByLayerId.set(layer.id, layer.sound.soundId);
    }

    const entryLayerIds = new Set(
      entryContinuity.activeLayers.map((layer) => layer.layerId),
    );

    for (const layer of plan.layers) {
      if (layer.start !== "sceneStart") {
        continue;
      }

      layerBoundaries.push({
        sectionId: section.sectionId,
        layerId: layer.id,
        soundId: layer.sound.soundId,
        kind: entryLayerIds.has(layer.id)
          ? "inheritedSceneStartDeclaration"
          : "semanticStart",
      });
    }

    const layersById = new Map(plan.layers.map((layer) => [layer.id, layer]));

    for (let stepIndex = 0; stepIndex < plan.steps.length; stepIndex += 1) {
      const step = plan.steps[stepIndex];

      if (step.kind === "event") {
        continue;
      }

      const chronologicalActions = (step.actions ?? [])
        .map((action, actionIndex) => ({ action, actionIndex }))
        .sort(
          (left, right) =>
            left.action.offsetSeconds - right.action.offsetSeconds ||
            left.actionIndex - right.actionIndex,
        );

      for (const { action, actionIndex } of chronologicalActions) {
        const layer = layersById.get(action.layerId)!;

        layerBoundaries.push({
          sectionId: section.sectionId,
          layerId: layer.id,
          soundId: layer.sound.soundId,
          kind:
            action.kind === "stopLayer"
              ? "semanticStop"
              : entryLayerIds.has(layer.id)
                ? "suppressedInheritedTriggeredStart"
                : "semanticStart",
          stepIndex,
          actionIndex,
        });
      }
    }

    const globalStartSeconds = durationSeconds;
    durationSeconds += section.resolvedScene.durationSeconds;
    placements.push({
      sectionId: section.sectionId,
      globalStartSeconds,
      globalEndSeconds: durationSeconds,
      localDurationSeconds: section.resolvedScene.durationSeconds,
    });

    previousExit = deriveSectionExitState(plan);
  }

  return {
    durationSeconds,
    sections: placements,
    layerBoundaries,
    finalContinuity: copyContinuity(previousExit),
  };
}
