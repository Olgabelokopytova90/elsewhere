import type { SoundCatalog } from "./journey-materializer.js";
import type {
  JourneyPlaybackRequirements,
  LayerPlaybackTermination,
} from "./journey-playback-requirements.js";

type LayerCoverageBase = {
  layerId: string;
  soundId: string;
  file: string;
  requirementStartSeconds: number;
  requirementEndSeconds: number;
  requiredDurationSeconds: number;
  termination: LayerPlaybackTermination;
  assetDurationSeconds: number;
};

export type SinglePassLayerCoverage = LayerCoverageBase & {
  kind: "singlePass";
  coverageMarginSeconds: number;
};

export type InsufficientLayerCoverage = LayerCoverageBase & {
  kind: "insufficientCoverage";
  deficitSeconds: number;
};

export type LayerPlaybackCoverage =
  | SinglePassLayerCoverage
  | InsufficientLayerCoverage;

export type JourneyPlaybackCoveragePlan = {
  durationSeconds: number;
  layers: LayerPlaybackCoverage[];
};

function assertNonEmptyString(value: string, path: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
}

export function planJourneyPlaybackCoverage(
  requirements: JourneyPlaybackRequirements,
  soundCatalog: SoundCatalog,
): JourneyPlaybackCoveragePlan {
  if (
    !Number.isFinite(requirements.durationSeconds) ||
    requirements.durationSeconds < 0
  ) {
    throw new RangeError(
      "requirements.durationSeconds must be a finite non-negative number",
    );
  }

  if (!Array.isArray(requirements.persistentLayers)) {
    throw new TypeError("requirements.persistentLayers must be an array");
  }

  const layers = requirements.persistentLayers.map((requirement, index) => {
    const path = `requirements.persistentLayers[${index}]`;

    assertNonEmptyString(requirement.layerId, `${path}.layerId`);
    assertNonEmptyString(requirement.soundId, `${path}.soundId`);

    for (const [name, value] of [
      ["startSeconds", requirement.startSeconds],
      ["endSeconds", requirement.endSeconds],
      ["durationSeconds", requirement.durationSeconds],
    ] as const) {
      if (!Number.isFinite(value)) {
        throw new RangeError(`${path}.${name} must be finite`);
      }
    }

    if (requirement.startSeconds < 0) {
      throw new RangeError(`${path}.startSeconds must be non-negative`);
    }

    if (requirement.endSeconds < requirement.startSeconds) {
      throw new RangeError(`${path}.endSeconds must not precede startSeconds`);
    }

    if (requirement.durationSeconds < 0) {
      throw new RangeError(`${path}.durationSeconds must be non-negative`);
    }

    const calculatedDuration =
      requirement.endSeconds - requirement.startSeconds;

    if (!Object.is(requirement.durationSeconds, calculatedDuration)) {
      throw new Error(
        `${path}.durationSeconds must exactly equal endSeconds - startSeconds`,
      );
    }

    if (!Object.hasOwn(soundCatalog, requirement.soundId)) {
      throw new Error(
        `${path}.soundId is missing from the sound catalog: ${requirement.soundId}`,
      );
    }

    const asset = soundCatalog[requirement.soundId];

    if (
      asset.placement !== "sceneStartLayer" &&
      asset.placement !== "triggeredLayer"
    ) {
      throw new Error(
        `${path}.soundId is not compatible with persistent-layer playback: ${requirement.soundId}`,
      );
    }

    if (!Number.isFinite(asset.durationSeconds) || asset.durationSeconds <= 0) {
      throw new RangeError(
        `Sound catalog duration must be finite and positive: ${requirement.soundId}`,
      );
    }

    const base: LayerCoverageBase = {
      layerId: requirement.layerId,
      soundId: requirement.soundId,
      file: asset.file,
      requirementStartSeconds: requirement.startSeconds,
      requirementEndSeconds: requirement.endSeconds,
      requiredDurationSeconds: requirement.durationSeconds,
      termination: requirement.termination,
      assetDurationSeconds: asset.durationSeconds,
    };

    if (asset.durationSeconds >= requirement.durationSeconds) {
      return {
        ...base,
        kind: "singlePass" as const,
        coverageMarginSeconds:
          asset.durationSeconds - requirement.durationSeconds,
      };
    }

    return {
      ...base,
      kind: "insufficientCoverage" as const,
      deficitSeconds: requirement.durationSeconds - asset.durationSeconds,
    };
  });

  return {
    durationSeconds: requirements.durationSeconds,
    layers,
  };
}
