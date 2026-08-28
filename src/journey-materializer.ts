import type {
  Direction,
  Distance,
  Entrance,
  JourneyPlan,
  LayerCue,
  Prominence,
  SoundIntent,
} from "./journey-plan-types.js";
import { validateJourneyPlan } from "./journey-plan-validator.js";
import type {
  AssetMetadata,
  ContinuousLayer,
  EventStep,
  LayerAction,
  NarrationStep,
  PauseStep,
  SemanticScene,
} from "./scene-types.js";

export type LayerProfile =
  | "oceanAmbience"
  | "listenerMovement";

export type EventProfile = "distantEvent";

export type SoundCatalogEntry =
  | {
      file: string;
      durationSeconds: number;
      placement: "sceneStartLayer";
      profile: LayerProfile;
    }
  | {
      file: string;
      durationSeconds: number;
      placement: "triggeredLayer";
      profile: LayerProfile;
    }
  | {
      file: string;
      durationSeconds: number;
      placement: "event";
      profile: EventProfile;
    };

export type SoundCatalog = Record<string, SoundCatalogEntry>;

export type NarrationAsset = {
  file: string;
  durationSeconds: number;
  sourceText: string;
};

export type NarrationAssetMap = Record<string, NarrationAsset>;

export type FocusGain = {
  narration: number;
  environment: number;
};

export type LayerProfilePolicy = {
  gainByProminence: Record<Prominence, FocusGain>;
  panByDirection: Record<Direction, number>;
  fadeInByEntrance: Partial<Record<Entrance, number>>;
  lowpassByDistance: Partial<Record<Distance, number>>;
  fadeOutSeconds?: number;
  directionOverride?: Direction;
  distanceOverride?: Distance;
};

export type EventProfilePolicy = {
  gainByProminence: Record<Prominence, number>;
  panByDirection: Record<Direction, number>;
  lowpassByDistance: Partial<Record<Distance, number>>;
  fadeInSeconds?: number;
  directionOverride?: Direction;
  distanceOverride?: Distance;
};

export type MaterializationPolicy = {
  focusRampSeconds: number;
  narrationGain: number;
  defaults: {
    direction: Direction;
    distance: Distance;
    prominence: Prominence;
    entrance: Entrance;
  };
  layerProfiles: Record<LayerProfile, LayerProfilePolicy>;
  eventProfiles: Record<EventProfile, EventProfilePolicy>;
};

export type MaterializedJourney = {
  scene: SemanticScene;
  assetMetadata: AssetMetadata;
};

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}

function assertFinitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and positive`);
  }
}

function assertPan(pan: number, name: string): void {
  if (!Number.isFinite(pan) || pan < -1 || pan > 1) {
    throw new RangeError(`${name} must be finite and between -1 and 1`);
  }
}

function copyActions(actions: LayerCue[] | undefined): LayerAction[] | undefined {
  return actions?.map((action) => ({
    kind: action.kind,
    layerId: action.layerId,
    offsetSeconds: action.offsetSeconds,
  }));
}

export function materializeJourneyPlan(
  plan: JourneyPlan,
  soundCatalog: SoundCatalog,
  narrationAssets: NarrationAssetMap,
  policy: MaterializationPolicy,
): MaterializedJourney {
  validateJourneyPlan(plan);
  assertFiniteNonNegative(policy.focusRampSeconds, "focusRampSeconds");
  assertFiniteNonNegative(policy.narrationGain, "narrationGain");

  const assetMetadata: AssetMetadata = {};

  const addAssetMetadata = (
    file: string,
    durationSeconds: number,
  ): void => {
    if (Object.hasOwn(assetMetadata, file)) {
      if (!Object.is(assetMetadata[file].durationSeconds, durationSeconds)) {
        throw new Error(`Conflicting metadata durations for file: ${file}`);
      }

      return;
    }

    assetMetadata[file] = { durationSeconds };
  };

  const resolveCatalogEntry = (
    soundId: string,
    path: string,
  ): SoundCatalogEntry => {
    if (!Object.hasOwn(soundCatalog, soundId)) {
      throw new Error(`Unknown soundId at ${path}.sound.soundId: ${soundId}`);
    }

    const entry = soundCatalog[soundId];

    if (typeof entry.file !== "string" || entry.file.trim().length === 0) {
      throw new Error(`Catalog asset file must be a non-empty string: ${soundId}`);
    }

    assertFinitePositive(
      entry.durationSeconds,
      `Catalog asset duration for ${soundId}`,
    );
    return entry;
  };

  const resolveIntent = (intent: SoundIntent) => ({
    direction: intent.direction ?? policy.defaults.direction,
    distance: intent.distance ?? policy.defaults.distance,
    prominence: intent.prominence ?? policy.defaults.prominence,
  });

  const layers: ContinuousLayer[] = plan.layers.map((layer, index) => {
    const path = `layers[${index}]`;
    const entry = resolveCatalogEntry(layer.sound.soundId, path);
    const expectedPlacement =
      layer.start === "sceneStart" ? "sceneStartLayer" : "triggeredLayer";

    if (entry.placement !== expectedPlacement) {
      const placementName =
        layer.start === "sceneStart" ? "a scene-start layer" : "a triggered layer";
      throw new Error(
        `Sound is not valid for ${placementName} at ${path}: ${layer.sound.soundId}`,
      );
    }

    if (!Object.hasOwn(policy.layerProfiles, entry.profile)) {
      throw new Error(`Missing materialization policy for profile: ${entry.profile}`);
    }

    const profile = policy.layerProfiles[entry.profile];
    const intent = resolveIntent(layer.sound);
    const direction = profile.directionOverride ?? intent.direction;
    const distance = profile.distanceOverride ?? intent.distance;
    const entrance = layer.entrance ?? policy.defaults.entrance;
    const gainByFocus = profile.gainByProminence[intent.prominence];
    const pan = profile.panByDirection[direction];
    const fadeInSeconds = profile.fadeInByEntrance[entrance];
    const lowpassHz = profile.lowpassByDistance[distance];

    assertFiniteNonNegative(
      gainByFocus.narration,
      `Layer narration gain for ${layer.id}`,
    );
    assertFiniteNonNegative(
      gainByFocus.environment,
      `Layer environment gain for ${layer.id}`,
    );
    assertPan(pan, `Layer pan for ${layer.id}`);

    if (fadeInSeconds !== undefined) {
      assertFinitePositive(fadeInSeconds, `Layer fade-in for ${layer.id}`);
    }

    if (profile.fadeOutSeconds !== undefined) {
      assertFinitePositive(
        profile.fadeOutSeconds,
        `Layer fade-out for ${layer.id}`,
      );
    }

    if (lowpassHz !== undefined) {
      assertFinitePositive(lowpassHz, `Layer low-pass for ${layer.id}`);
    }

    const materializedLayer: ContinuousLayer = {
      id: layer.id,
      file: entry.file,
      start: { kind: layer.start },
      gainByFocus: {
        narration: gainByFocus.narration,
        environment: gainByFocus.environment,
      },
      pan,
    };

    if (fadeInSeconds !== undefined) {
      materializedLayer.fadeInSeconds = fadeInSeconds;
    }

    if (profile.fadeOutSeconds !== undefined) {
      materializedLayer.fadeOutSeconds = profile.fadeOutSeconds;
    }

    if (lowpassHz !== undefined) {
      materializedLayer.lowpassHz = lowpassHz;
    }

    addAssetMetadata(entry.file, entry.durationSeconds);
    return materializedLayer;
  });

  const steps = plan.steps.map((step, index) => {
    const path = `steps[${index}]`;

    if (step.kind === "narration") {
      if (!Object.hasOwn(narrationAssets, step.id)) {
        throw new Error(`Missing narration asset for ${path}: ${step.id}`);
      }

      const asset = narrationAssets[step.id];

      if (typeof asset.file !== "string" || asset.file.trim().length === 0) {
        throw new Error(`Narration asset file must be non-empty: ${step.id}`);
      }

      if (!Number.isFinite(asset.durationSeconds) || asset.durationSeconds <= 0) {
        throw new Error(
          `Narration asset duration must be finite and positive: ${step.id}`,
        );
      }

      if (asset.sourceText !== step.text) {
        throw new Error(`Narration asset text does not match ${path}: ${step.id}`);
      }

      const narration: NarrationStep = {
        kind: "narration",
        id: step.id,
        file: asset.file,
        gain: policy.narrationGain,
        focus: "narration",
      };
      const actions = copyActions(step.actions);

      if (actions !== undefined) {
        narration.actions = actions;
      }

      addAssetMetadata(asset.file, asset.durationSeconds);
      return narration;
    }

    if (step.kind === "pause") {
      const pause: PauseStep = {
        kind: "pause",
        durationSeconds: step.durationSeconds,
        focus: "environment",
      };
      const actions = copyActions(step.actions);

      if (actions !== undefined) {
        pause.actions = actions;
      }

      return pause;
    }

    const entry = resolveCatalogEntry(step.sound.soundId, path);

    if (entry.placement !== "event") {
      throw new Error(
        `Sound is not valid for an event at ${path}: ${step.sound.soundId}`,
      );
    }

    if (!Object.hasOwn(policy.eventProfiles, entry.profile)) {
      throw new Error(`Missing materialization policy for profile: ${entry.profile}`);
    }

    const profile = policy.eventProfiles[entry.profile];
    const intent = resolveIntent(step.sound);
    const direction = profile.directionOverride ?? intent.direction;
    const distance = profile.distanceOverride ?? intent.distance;
    const gain = profile.gainByProminence[intent.prominence];
    const pan = profile.panByDirection[direction];
    const lowpassHz = profile.lowpassByDistance[distance];

    assertFiniteNonNegative(gain, `Event gain for ${step.id}`);
    assertPan(pan, `Event pan for ${step.id}`);

    if (profile.fadeInSeconds !== undefined) {
      assertFinitePositive(profile.fadeInSeconds, `Event fade-in for ${step.id}`);
    }

    if (lowpassHz !== undefined) {
      assertFinitePositive(lowpassHz, `Event low-pass for ${step.id}`);
    }

    const event: EventStep = {
      kind: "event",
      id: step.id,
      file: entry.file,
      beforeSeconds: step.beforeSeconds,
      afterSeconds: step.afterSeconds,
      focus: "environment",
      gain,
      pan,
    };

    if (profile.fadeInSeconds !== undefined) {
      event.fadeInSeconds = profile.fadeInSeconds;
    }

    if (lowpassHz !== undefined) {
      event.lowpassHz = lowpassHz;
    }

    addAssetMetadata(entry.file, entry.durationSeconds);
    return event;
  });

  return {
    scene: {
      openingSeconds: plan.openingSeconds,
      focusRampSeconds: policy.focusRampSeconds,
      layers,
      steps,
      tailSeconds: plan.tailSeconds,
    },
    assetMetadata,
  };
}
