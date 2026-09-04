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
import type {
  CompiledLayerActionTrace,
  CompiledScene,
} from "./scene-compiler.js";

export type JourneySectionInput = {
  sectionId: string;
  plan: JourneyPlan;
  entryContinuity: SectionContinuity;
  resolvedScene: ResolvedScene;
};

export type JourneySectionInputWithTrace = {
  sectionId: string;
  plan: JourneyPlan;
  entryContinuity: SectionContinuity;
  compiledScene: CompiledScene;
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

export type JourneyNarrationPlacement = {
  sectionId: string;
  narrationId: string;
  file: string;
  stepIndex: number;
  durationSeconds: number;
  localStartSeconds: number;
  localEndSeconds: number;
  globalStartSeconds: number;
  globalEndSeconds: number;
};

export type JourneyEventPlacement = {
  sectionId: string;
  eventId: string;
  file: string;
  stepIndex: number;
  durationSeconds: number;
  localStartSeconds: number;
  localEndSeconds: number;
  localSequenceEndSeconds: number;
  globalStartSeconds: number;
  globalEndSeconds: number;
  globalSequenceEndSeconds: number;
};

export type TimedJourneyLayerBoundary = JourneyLayerBoundary & {
  localAtSeconds: number;
  globalAtSeconds: number;
};

export type TimedAssembledJourneyTimeline = AssembledJourneyTimeline & {
  narrations: JourneyNarrationPlacement[];
  events: JourneyEventPlacement[];
  timedLayerBoundaries: TimedJourneyLayerBoundary[];
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

function assertTraceTime(
  value: number,
  path: string,
  minimumExclusive: boolean,
): void {
  if (
    !Number.isFinite(value) ||
    (minimumExclusive ? value <= 0 : value < 0)
  ) {
    throw new RangeError(
      `${path} must be a finite ${minimumExclusive ? "positive" : "non-negative"} number`,
    );
  }
}

/**
 * Enriches semantic journey assembly with standalone compiler timing facts.
 * Current provenance joining relies on materialization preserving JourneyPlan
 * step order, action order, and semantic IDs in SemanticScene.
 */
export function assembleJourneyTimelineWithTrace(
  sections: JourneySectionInputWithTrace[],
): TimedAssembledJourneyTimeline {
  const base = assembleJourneyTimeline(
    sections.map((section) => ({
      sectionId: section.sectionId,
      plan: section.plan,
      entryContinuity: section.entryContinuity,
      resolvedScene: section.compiledScene.resolvedScene,
    })),
  );
  const narrations: JourneyNarrationPlacement[] = [];
  const events: JourneyEventPlacement[] = [];
  const actionTracesBySection = new Map<
    string,
    Map<string, CompiledLayerActionTrace>
  >();

  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
    const section = sections[sectionIndex];
    const placement = base.sections[sectionIndex];
    const durationSeconds = section.compiledScene.resolvedScene.durationSeconds;
    const trace = section.compiledScene.trace;
    const path = `sections[${sectionIndex}].compiledScene.trace`;

    if (!Array.isArray(trace.narrations)) {
      throw new TypeError(`${path}.narrations must be an array`);
    }

    if (!Array.isArray(trace.events)) {
      throw new TypeError(`${path}.events must be an array`);
    }

    if (!Array.isArray(trace.layerActions)) {
      throw new TypeError(`${path}.layerActions must be an array`);
    }

    const narrationStepIndexes = new Set<number>();

    for (let index = 0; index < trace.narrations.length; index += 1) {
      const narration = trace.narrations[index];
      const recordPath = `${path}.narrations[${index}]`;

      if (!Number.isInteger(narration.stepIndex) || narration.stepIndex < 0) {
        throw new Error(`${recordPath}.stepIndex does not reference a plan step`);
      }

      const step = section.plan.steps[narration.stepIndex];

      if (step === undefined || step.kind !== "narration") {
        throw new Error(`${recordPath} does not reference a narration step`);
      }

      if (step.id !== narration.narrationId) {
        throw new Error(
          `${recordPath}.narrationId mismatch at step ${narration.stepIndex}: expected ${step.id}, received ${narration.narrationId}`,
        );
      }

      if (narrationStepIndexes.has(narration.stepIndex)) {
        throw new Error(
          `${recordPath} duplicates narration trace for step ${narration.stepIndex}`,
        );
      }

      narrationStepIndexes.add(narration.stepIndex);
      assertTraceTime(narration.startSeconds, `${recordPath}.startSeconds`, false);
      assertTraceTime(narration.durationSeconds, `${recordPath}.durationSeconds`, true);
      assertTraceTime(narration.endSeconds, `${recordPath}.endSeconds`, false);

      if (narration.endSeconds < narration.startSeconds) {
        throw new RangeError(`${recordPath}.endSeconds must not precede startSeconds`);
      }

      if (narration.endSeconds > durationSeconds) {
        throw new RangeError(`${recordPath}.endSeconds exceeds resolved scene duration`);
      }

      narrations.push({
        sectionId: section.sectionId,
        narrationId: narration.narrationId,
        file: narration.file,
        stepIndex: narration.stepIndex,
        durationSeconds: narration.durationSeconds,
        localStartSeconds: narration.startSeconds,
        localEndSeconds: narration.endSeconds,
        globalStartSeconds: placement.globalStartSeconds + narration.startSeconds,
        globalEndSeconds: placement.globalStartSeconds + narration.endSeconds,
      });
    }

    for (let stepIndex = 0; stepIndex < section.plan.steps.length; stepIndex += 1) {
      if (
        section.plan.steps[stepIndex].kind === "narration" &&
        !narrationStepIndexes.has(stepIndex)
      ) {
        throw new Error(`${path}.narrations is missing trace for step ${stepIndex}`);
      }
    }

    const eventStepIndexes = new Set<number>();

    for (let index = 0; index < trace.events.length; index += 1) {
      const event = trace.events[index];
      const recordPath = `${path}.events[${index}]`;

      if (!Number.isInteger(event.stepIndex) || event.stepIndex < 0) {
        throw new Error(`${recordPath}.stepIndex does not reference a plan step`);
      }

      const step = section.plan.steps[event.stepIndex];

      if (step === undefined || step.kind !== "event") {
        throw new Error(`${recordPath} does not reference an event step`);
      }

      if (step.id !== event.eventId) {
        throw new Error(
          `${recordPath}.eventId mismatch at step ${event.stepIndex}: expected ${step.id}, received ${event.eventId}`,
        );
      }

      if (eventStepIndexes.has(event.stepIndex)) {
        throw new Error(`${recordPath} duplicates event trace for step ${event.stepIndex}`);
      }

      eventStepIndexes.add(event.stepIndex);
      assertTraceTime(event.startSeconds, `${recordPath}.startSeconds`, false);
      assertTraceTime(event.durationSeconds, `${recordPath}.durationSeconds`, true);
      assertTraceTime(event.endSeconds, `${recordPath}.endSeconds`, false);
      assertTraceTime(
        event.sequenceEndSeconds,
        `${recordPath}.sequenceEndSeconds`,
        false,
      );

      if (event.endSeconds < event.startSeconds) {
        throw new RangeError(`${recordPath}.endSeconds must not precede startSeconds`);
      }

      if (event.sequenceEndSeconds < event.endSeconds) {
        throw new RangeError(
          `${recordPath}.sequenceEndSeconds must not precede endSeconds`,
        );
      }

      if (event.sequenceEndSeconds > durationSeconds) {
        throw new RangeError(
          `${recordPath}.sequenceEndSeconds exceeds resolved scene duration`,
        );
      }

      events.push({
        sectionId: section.sectionId,
        eventId: event.eventId,
        file: event.file,
        stepIndex: event.stepIndex,
        durationSeconds: event.durationSeconds,
        localStartSeconds: event.startSeconds,
        localEndSeconds: event.endSeconds,
        localSequenceEndSeconds: event.sequenceEndSeconds,
        globalStartSeconds: placement.globalStartSeconds + event.startSeconds,
        globalEndSeconds: placement.globalStartSeconds + event.endSeconds,
        globalSequenceEndSeconds:
          placement.globalStartSeconds + event.sequenceEndSeconds,
      });
    }

    for (let stepIndex = 0; stepIndex < section.plan.steps.length; stepIndex += 1) {
      if (
        section.plan.steps[stepIndex].kind === "event" &&
        !eventStepIndexes.has(stepIndex)
      ) {
        throw new Error(`${path}.events is missing trace for step ${stepIndex}`);
      }
    }

    const actionTraces = new Map<string, CompiledLayerActionTrace>();

    for (let index = 0; index < trace.layerActions.length; index += 1) {
      const actionTrace = trace.layerActions[index];
      const recordPath = `${path}.layerActions[${index}]`;

      if (!Number.isInteger(actionTrace.stepIndex) || actionTrace.stepIndex < 0) {
        throw new Error(`${recordPath}.stepIndex does not reference a plan step`);
      }

      const step = section.plan.steps[actionTrace.stepIndex];

      if (step === undefined || step.kind === "event") {
        throw new Error(`${recordPath} does not reference an actionable plan step`);
      }

      if (!Number.isInteger(actionTrace.actionIndex) || actionTrace.actionIndex < 0) {
        throw new Error(`${recordPath}.actionIndex does not reference a plan action`);
      }

      const action = step.actions?.[actionTrace.actionIndex];

      if (action === undefined) {
        throw new Error(`${recordPath} does not reference a plan action`);
      }

      if (
        action.kind !== actionTrace.kind ||
        action.layerId !== actionTrace.layerId
      ) {
        throw new Error(
          `${recordPath} provenance mismatch at step ${actionTrace.stepIndex}, action ${actionTrace.actionIndex}`,
        );
      }

      assertTraceTime(actionTrace.atSeconds, `${recordPath}.atSeconds`, false);

      if (actionTrace.atSeconds > durationSeconds) {
        throw new RangeError(`${recordPath}.atSeconds exceeds resolved scene duration`);
      }

      const key = `${actionTrace.stepIndex}:${actionTrace.actionIndex}:${actionTrace.layerId}:${actionTrace.kind}`;

      if (actionTraces.has(key)) {
        throw new Error(`${recordPath} duplicates layer action trace: ${key}`);
      }

      actionTraces.set(key, actionTrace);
    }

    for (let stepIndex = 0; stepIndex < section.plan.steps.length; stepIndex += 1) {
      const step = section.plan.steps[stepIndex];

      if (step.kind === "event") {
        continue;
      }

      for (let actionIndex = 0; actionIndex < (step.actions?.length ?? 0); actionIndex += 1) {
        const action = step.actions![actionIndex];
        const key = `${stepIndex}:${actionIndex}:${action.layerId}:${action.kind}`;

        if (!actionTraces.has(key)) {
          throw new Error(
            `${path}.layerActions is missing trace for step ${stepIndex}, action ${actionIndex}`,
          );
        }
      }
    }

    actionTracesBySection.set(section.sectionId, actionTraces);
  }

  const placementsBySection = new Map(
    base.sections.map((placement) => [placement.sectionId, placement]),
  );
  const timedLayerBoundaries = base.layerBoundaries.map((boundary) => {
    const placement = placementsBySection.get(boundary.sectionId)!;

    if (boundary.stepIndex === undefined && boundary.actionIndex === undefined) {
      return {
        ...boundary,
        localAtSeconds: 0,
        globalAtSeconds: placement.globalStartSeconds,
      };
    }

    if (boundary.stepIndex === undefined || boundary.actionIndex === undefined) {
      throw new Error(
        `Layer boundary provenance is incomplete: ${boundary.sectionId}/${boundary.layerId}`,
      );
    }

    const expectedKind = boundary.kind === "semanticStop"
      ? "stopLayer"
      : "startLayer";
    const key = `${boundary.stepIndex}:${boundary.actionIndex}:${boundary.layerId}:${expectedKind}`;
    const actionTrace = actionTracesBySection.get(boundary.sectionId)!.get(key);

    if (actionTrace === undefined) {
      throw new Error(
        `Layer boundary has no matching compiler trace: ${boundary.sectionId}/${key}`,
      );
    }

    return {
      ...boundary,
      localAtSeconds: actionTrace.atSeconds,
      globalAtSeconds: placement.globalStartSeconds + actionTrace.atSeconds,
    };
  });

  return {
    ...base,
    narrations,
    events,
    timedLayerBoundaries,
  };
}
