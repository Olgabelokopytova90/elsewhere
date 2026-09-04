import type { TimedAssembledJourneyTimeline } from "./journey-assembler.js";

export type LayerPlaybackTermination =
  | "semanticStop"
  | "journeyEnd";

export type LayerPlaybackRequirement = {
  layerId: string;
  soundId: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  termination: LayerPlaybackTermination;
};

export type JourneyPlaybackRequirements = {
  durationSeconds: number;
  persistentLayers: LayerPlaybackRequirement[];
};

type ActiveLayer = {
  layerId: string;
  soundId: string;
  startSeconds: number;
  order: number;
};

type OrderedRequirement = {
  requirement: LayerPlaybackRequirement;
  order: number;
};

const boundaryKinds = new Set([
  "semanticStart",
  "inheritedSceneStartDeclaration",
  "suppressedInheritedTriggeredStart",
  "semanticStop",
]);

function assertNonEmptyString(value: string, path: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
}

/**
 * Derives logical journey-level playback lifetimes. A requirement does not
 * guarantee one source file can cover it and does not describe looping,
 * segments, source offsets, crossfades, or renderer clips.
 */
export function deriveJourneyPlaybackRequirements(
  timeline: TimedAssembledJourneyTimeline,
): JourneyPlaybackRequirements {
  if (
    !Number.isFinite(timeline.durationSeconds) ||
    timeline.durationSeconds < 0
  ) {
    throw new RangeError(
      "timeline.durationSeconds must be a finite non-negative number",
    );
  }

  if (!Array.isArray(timeline.timedLayerBoundaries)) {
    throw new TypeError("timeline.timedLayerBoundaries must be an array");
  }

  if (!Array.isArray(timeline.finalContinuity?.activeLayers)) {
    throw new TypeError("timeline.finalContinuity.activeLayers must be an array");
  }

  const activeLayers = new Map<string, ActiveLayer>();
  const soundIdByLayerId = new Map<string, string>();
  const completed: OrderedRequirement[] = [];
  let nextOrder = 0;

  for (
    let index = 0;
    index < timeline.timedLayerBoundaries.length;
    index += 1
  ) {
    const boundary = timeline.timedLayerBoundaries[index];
    const path = `timeline.timedLayerBoundaries[${index}]`;

    assertNonEmptyString(boundary.layerId, `${path}.layerId`);
    assertNonEmptyString(boundary.soundId, `${path}.soundId`);

    if (!boundaryKinds.has(boundary.kind)) {
      throw new TypeError(`${path}.kind is not supported: ${boundary.kind}`);
    }

    if (
      !Number.isFinite(boundary.globalAtSeconds) ||
      boundary.globalAtSeconds < 0 ||
      boundary.globalAtSeconds > timeline.durationSeconds
    ) {
      throw new RangeError(
        `${path}.globalAtSeconds must be finite and within the journey duration`,
      );
    }

    const knownSoundId = soundIdByLayerId.get(boundary.layerId);

    if (knownSoundId !== undefined && knownSoundId !== boundary.soundId) {
      throw new Error(
        `${path}.soundId conflicts for layer ${boundary.layerId}: expected ${knownSoundId}, received ${boundary.soundId}`,
      );
    }

    soundIdByLayerId.set(boundary.layerId, boundary.soundId);
    const active = activeLayers.get(boundary.layerId);

    if (boundary.kind === "semanticStart") {
      if (active !== undefined) {
        throw new Error(`${path} starts an already-active layer: ${boundary.layerId}`);
      }

      activeLayers.set(boundary.layerId, {
        layerId: boundary.layerId,
        soundId: boundary.soundId,
        startSeconds: boundary.globalAtSeconds,
        order: nextOrder,
      });
      nextOrder += 1;
      continue;
    }

    if (
      boundary.kind === "inheritedSceneStartDeclaration" ||
      boundary.kind === "suppressedInheritedTriggeredStart"
    ) {
      if (active === undefined) {
        throw new Error(
          `${path} requires an active inherited layer: ${boundary.layerId}`,
        );
      }

      if (active.soundId !== boundary.soundId) {
        throw new Error(
          `${path}.soundId conflicts with active layer ${boundary.layerId}`,
        );
      }

      continue;
    }

    if (active === undefined) {
      throw new Error(`${path} stops an inactive layer: ${boundary.layerId}`);
    }

    if (boundary.globalAtSeconds < active.startSeconds) {
      throw new Error(`${path} stops layer before its semantic start: ${boundary.layerId}`);
    }

    completed.push({
      order: active.order,
      requirement: {
        layerId: active.layerId,
        soundId: active.soundId,
        startSeconds: active.startSeconds,
        endSeconds: boundary.globalAtSeconds,
        durationSeconds: boundary.globalAtSeconds - active.startSeconds,
        termination: "semanticStop",
      },
    });
    activeLayers.delete(boundary.layerId);
  }

  if (timeline.finalContinuity.activeLayers.length !== activeLayers.size) {
    throw new Error(
      `timeline.finalContinuity.activeLayers length mismatch: expected ${activeLayers.size}, received ${timeline.finalContinuity.activeLayers.length}`,
    );
  }

  const activeInOrder = [...activeLayers.values()];

  for (let index = 0; index < activeInOrder.length; index += 1) {
    const active = activeInOrder[index];
    const finalLayer = timeline.finalContinuity.activeLayers[index];
    const path = `timeline.finalContinuity.activeLayers[${index}]`;

    assertNonEmptyString(finalLayer.layerId, `${path}.layerId`);
    assertNonEmptyString(finalLayer.soundId, `${path}.soundId`);

    if (
      finalLayer.layerId !== active.layerId ||
      finalLayer.soundId !== active.soundId
    ) {
      throw new Error(
        `${path} mismatch: expected ${active.layerId}/${active.soundId}, received ${finalLayer.layerId}/${finalLayer.soundId}`,
      );
    }
  }

  for (const active of activeInOrder) {
    if (timeline.durationSeconds < active.startSeconds) {
      throw new Error(`Journey ends before layer start: ${active.layerId}`);
    }

    completed.push({
      order: active.order,
      requirement: {
        layerId: active.layerId,
        soundId: active.soundId,
        startSeconds: active.startSeconds,
        endSeconds: timeline.durationSeconds,
        durationSeconds: timeline.durationSeconds - active.startSeconds,
        termination: "journeyEnd",
      },
    });
  }

  completed.sort((left, right) => left.order - right.order);

  return {
    durationSeconds: timeline.durationSeconds,
    persistentLayers: completed.map(({ requirement }) => requirement),
  };
}
