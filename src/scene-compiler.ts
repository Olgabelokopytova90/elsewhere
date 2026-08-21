import type { AudioClip, ResolvedScene } from "./audio-types.js";
import type { AssetMetadata, SemanticScene } from "./scene-types.js";

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

  if (scene.layers.length > 0) {
    throw new Error("Continuous layers are not supported yet");
  }

  let cursor = scene.openingSeconds;
  const clips: AudioClip[] = [];

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

      clips.push(clip);

      cursor += assetDuration;
      cursor += step.afterSeconds;
      continue;
    }

    if (step.actions !== undefined && step.actions.length > 0) {
      throw new Error("Actions are not supported yet");
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

      clips.push({
        file: step.file,
        startSeconds: cursor,
        gain: step.gain,
      });

      cursor += assetDuration;
      continue;
    }

    if (!Number.isFinite(step.durationSeconds) || step.durationSeconds < 0) {
      throw new RangeError("Pause duration must be a finite non-negative number");
    }

    cursor += step.durationSeconds;
  }

  cursor += scene.tailSeconds;

  return {
    durationSeconds: cursor,
    clips,
  };
}
