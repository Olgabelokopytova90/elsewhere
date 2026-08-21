import type { AudioClip, ResolvedScene } from "./audio-types.js";
import type {
  AssetMetadata,
  ContinuousLayer,
  SemanticScene,
  StartLayerAction,
} from "./scene-types.js";

type ClipEntry = {
  clip: AudioClip;
  sequence: number;
};

type LayerState = {
  layer: ContinuousLayer;
  assetDuration: number;
  startSeconds?: number;
};

export function compileScene(
  scene: SemanticScene,
  assetMetadata: AssetMetadata,
): ResolvedScene {
  if (!Number.isFinite(scene.openingSeconds) || scene.openingSeconds < 0) {
    throw new RangeError("openingSeconds must be a finite non-negative number");
  }

  if (!Number.isFinite(scene.tailSeconds) || scene.tailSeconds < 0) {
    throw new RangeError("tailSeconds must be a finite non-negative number");
  }

  if (scene.focusRampSeconds !== 0) {
    throw new RangeError("focusRampSeconds is not supported yet and must be 0");
  }

  let cursor = scene.openingSeconds;
  let sequence = 0;
  const clipEntries: ClipEntry[] = [];
  const layerStates = new Map<string, LayerState>();

  const addClip = (clip: AudioClip): void => {
    clipEntries.push({ clip, sequence });
    sequence += 1;
  };

  const createLayerClip = (
    layer: ContinuousLayer,
    startSeconds: number,
  ): AudioClip => {
    const clip: AudioClip = {
      file: layer.file,
      startSeconds,
      gain: layer.gainByFocus.environment,
    };

    if (layer.pan !== undefined) {
      clip.pan = layer.pan;
    }

    if (layer.fadeInSeconds !== undefined) {
      clip.fadeInSeconds = layer.fadeInSeconds;
    }

    if (layer.lowpassHz !== undefined) {
      clip.lowpassHz = layer.lowpassHz;
    }

    return clip;
  };

  for (const layer of scene.layers) {
    if (layerStates.has(layer.id)) {
      throw new Error(`Duplicate layer id: ${layer.id}`);
    }

    if (!Object.hasOwn(assetMetadata, layer.file)) {
      throw new Error(`Missing asset metadata for: ${layer.file}`);
    }

    const assetDuration = assetMetadata[layer.file].durationSeconds;

    if (!Number.isFinite(assetDuration) || assetDuration <= 0) {
      throw new RangeError(
        `Asset duration must be a finite positive number: ${layer.file}`,
      );
    }

    if (layer.gainByFocus.narration !== layer.gainByFocus.environment) {
      throw new Error(
        `Focus-dependent layer gains are not supported yet: ${layer.id}`,
      );
    }

    const state: LayerState = {
      layer,
      assetDuration,
    };

    layerStates.set(layer.id, state);

    if (layer.start.kind === "sceneStart") {
      state.startSeconds = 0;
      addClip(createLayerClip(layer, 0));
    }
  }

  const resolveActions = (
    actions: StartLayerAction[] | undefined,
    stepStart: number,
    stepDuration: number,
  ): void => {
    for (const action of actions ?? []) {
      if (!Number.isFinite(action.offsetSeconds) || action.offsetSeconds < 0) {
        throw new RangeError(
          "Layer action offset must be a finite non-negative number",
        );
      }

      if (action.offsetSeconds >= stepDuration) {
        throw new RangeError(
          "Layer action offset must be less than the containing step duration",
        );
      }

      const state = layerStates.get(action.layerId);

      if (state === undefined) {
        throw new Error(`Unknown layer id: ${action.layerId}`);
      }

      if (state.layer.start.kind === "sceneStart") {
        throw new Error(`Cannot trigger scene-start layer: ${action.layerId}`);
      }

      if (state.startSeconds !== undefined) {
        throw new Error(`Layer started more than once: ${action.layerId}`);
      }

      const startSeconds = stepStart + action.offsetSeconds;
      state.startSeconds = startSeconds;
      addClip(createLayerClip(state.layer, startSeconds));
    }
  };

  for (const step of scene.steps) {
    if (step.kind === "event") {
      if (!Number.isFinite(step.beforeSeconds) || step.beforeSeconds < 0) {
        throw new RangeError(
          "Event beforeSeconds must be a finite non-negative number",
        );
      }

      if (!Number.isFinite(step.afterSeconds) || step.afterSeconds < 0) {
        throw new RangeError(
          "Event afterSeconds must be a finite non-negative number",
        );
      }

      if (!Object.hasOwn(assetMetadata, step.file)) {
        throw new Error(`Missing asset metadata for: ${step.file}`);
      }

      const assetDuration = assetMetadata[step.file].durationSeconds;

      if (!Number.isFinite(assetDuration) || assetDuration <= 0) {
        throw new RangeError(
          `Asset duration must be a finite positive number: ${step.file}`,
        );
      }

      cursor += step.beforeSeconds;

      const clip: AudioClip = {
        file: step.file,
        startSeconds: cursor,
      };

      if (step.gain !== undefined) {
        clip.gain = step.gain;
      }

      if (step.pan !== undefined) {
        clip.pan = step.pan;
      }

      if (step.fadeInSeconds !== undefined) {
        clip.fadeInSeconds = step.fadeInSeconds;
      }

      if (step.lowpassHz !== undefined) {
        clip.lowpassHz = step.lowpassHz;
      }

      addClip(clip);

      cursor += assetDuration;
      cursor += step.afterSeconds;
      continue;
    }

    if (step.kind === "narration") {
      if (!Object.hasOwn(assetMetadata, step.file)) {
        throw new Error(`Missing asset metadata for: ${step.file}`);
      }

      const assetDuration = assetMetadata[step.file].durationSeconds;

      if (!Number.isFinite(assetDuration) || assetDuration <= 0) {
        throw new RangeError(
          `Asset duration must be a finite positive number: ${step.file}`,
        );
      }

      addClip({
        file: step.file,
        startSeconds: cursor,
        gain: step.gain,
      });

      resolveActions(step.actions, cursor, assetDuration);
      cursor += assetDuration;
      continue;
    }

    if (!Number.isFinite(step.durationSeconds) || step.durationSeconds < 0) {
      throw new RangeError("Pause duration must be a finite non-negative number");
    }

    resolveActions(step.actions, cursor, step.durationSeconds);
    cursor += step.durationSeconds;
  }

  cursor += scene.tailSeconds;

  for (const state of layerStates.values()) {
    if (state.startSeconds === undefined) {
      throw new Error(`Triggered layer was never started: ${state.layer.id}`);
    }

    const requiredDuration = cursor - state.startSeconds;

    if (state.assetDuration < requiredDuration) {
      throw new Error(
        `Layer asset is too short for the resolved scene: ${state.layer.id}`,
      );
    }
  }

  clipEntries.sort(
    (left, right) =>
      left.clip.startSeconds - right.clip.startSeconds ||
      left.sequence - right.sequence,
  );

  return {
    durationSeconds: cursor,
    clips: clipEntries.map(({ clip }) => clip),
  };
}
