import type {
  AudioClip,
  GainPoint,
  ResolvedScene,
} from "./audio-types.js";
import type {
  AssetMetadata,
  ContinuousLayer,
  Focus,
  LayerAction,
  SemanticScene,
} from "./scene-types.js";

type ClipEntry = {
  clip: AudioClip;
  sequence: number;
};

type LayerState = {
  layer: ContinuousLayer;
  assetDuration: number;
  clip?: AudioClip;
  startSeconds?: number;
  stopSeconds?: number;
};

type FocusInterval = {
  startSeconds: number;
  endSeconds: number;
  focus: Focus;
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

  if (
    !Number.isFinite(scene.focusRampSeconds) ||
    scene.focusRampSeconds < 0
  ) {
    throw new RangeError(
      "focusRampSeconds must be a finite non-negative number",
    );
  }

  let cursor = scene.openingSeconds;
  let sequence = 0;
  const clipEntries: ClipEntry[] = [];
  const focusIntervals: FocusInterval[] = [];
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

  const addFocusInterval = (
    focus: Focus,
    startSeconds: number,
    endSeconds: number,
  ): void => {
    const previous = focusIntervals[focusIntervals.length - 1];

    if (
      previous !== undefined &&
      previous.focus === focus &&
      previous.endSeconds === startSeconds
    ) {
      previous.endSeconds = endSeconds;
      return;
    }

    focusIntervals.push({ focus, startSeconds, endSeconds });
  };

  addFocusInterval("environment", 0, scene.openingSeconds);

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

    if (
      layer.gainByFocus.narration !== layer.gainByFocus.environment &&
      (!Number.isFinite(layer.gainByFocus.narration) ||
        layer.gainByFocus.narration < 0 ||
        !Number.isFinite(layer.gainByFocus.environment) ||
        layer.gainByFocus.environment < 0)
    ) {
      throw new Error(
        `Layer focus gains must be finite non-negative numbers: ${layer.id}`,
      );
    }

    const state: LayerState = {
      layer,
      assetDuration,
    };

    layerStates.set(layer.id, state);

    if (layer.start.kind === "sceneStart") {
      state.startSeconds = 0;
      state.clip = createLayerClip(layer, 0);
      addClip(state.clip);
    }
  }

  const resolveActions = (
    actions: LayerAction[] | undefined,
    stepStart: number,
    stepDuration: number,
  ): void => {
    const chronologicalActions = (actions ?? [])
      .map((action, index) => ({ action, index }))
      .sort(
        (left, right) =>
          left.action.offsetSeconds - right.action.offsetSeconds ||
          left.index - right.index,
      );

    for (const { action } of chronologicalActions) {
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
    }

    const previousOffsetByLayerId = new Map<string, number>();

    for (const { action } of chronologicalActions) {
      if (previousOffsetByLayerId.get(action.layerId) === action.offsetSeconds) {
        throw new Error(
          `Layer actions for the same layer cannot share a timestamp: ${action.layerId}`,
        );
      }

      previousOffsetByLayerId.set(action.layerId, action.offsetSeconds);
    }

    for (const { action } of chronologicalActions) {
      const state = layerStates.get(action.layerId);

      if (state === undefined) {
        throw new Error(`Unknown layer id: ${action.layerId}`);
      }

      if (state.layer.start.kind === "sceneStart") {
        if (action.kind === "startLayer") {
          throw new Error(`Cannot trigger scene-start layer: ${action.layerId}`);
        }

        throw new Error(`Cannot stop scene-start layer: ${action.layerId}`);
      }

      const actionSeconds = stepStart + action.offsetSeconds;

      if (action.kind === "stopLayer") {
        if (state.startSeconds === undefined) {
          throw new Error(`Cannot stop layer before it starts: ${action.layerId}`);
        }

        if (state.stopSeconds !== undefined) {
          throw new Error(`Layer stopped more than once: ${action.layerId}`);
        }

        if (actionSeconds <= state.startSeconds) {
          throw new Error(`Layer stop must be after layer start: ${action.layerId}`);
        }

        state.stopSeconds = actionSeconds;
        continue;
      }

      if (state.startSeconds !== undefined) {
        if (state.stopSeconds !== undefined) {
          throw new Error(`Cannot restart stopped layer: ${action.layerId}`);
        }

        throw new Error(`Layer started more than once: ${action.layerId}`);
      }

      state.startSeconds = actionSeconds;
      state.clip = createLayerClip(state.layer, actionSeconds);
      addClip(state.clip);
    }
  };

  for (const step of scene.steps) {
    if (step.kind === "event") {
      const stepStart = cursor;

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
      addFocusInterval("environment", stepStart, cursor);
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
      addFocusInterval("narration", cursor, cursor + assetDuration);
      cursor += assetDuration;
      continue;
    }

    if (!Number.isFinite(step.durationSeconds) || step.durationSeconds < 0) {
      throw new RangeError("Pause duration must be a finite non-negative number");
    }

    resolveActions(step.actions, cursor, step.durationSeconds);
    addFocusInterval("environment", cursor, cursor + step.durationSeconds);
    cursor += step.durationSeconds;
  }

  const tailStart = cursor;
  cursor += scene.tailSeconds;
  addFocusInterval("environment", tailStart, cursor);

  for (let index = 0; index < focusIntervals.length; index += 1) {
    const interval = focusIntervals[index];

    if (interval.focus !== "environment") {
      continue;
    }

    const previous = focusIntervals[index - 1];
    const next = focusIntervals[index + 1];
    const adjacentNarrationBoundaryCount =
      (previous?.focus === "narration" ? 1 : 0) +
      (next?.focus === "narration" ? 1 : 0);
    const requiredDuration =
      scene.focusRampSeconds * adjacentNarrationBoundaryCount;

    if (interval.endSeconds - interval.startSeconds < requiredDuration) {
      throw new Error("Environment focus interval is too short for focus ramps");
    }
  }

  const createGlobalGainPoints = (layer: ContinuousLayer): GainPoint[] => {
    const points: GainPoint[] = [];

    const addPoint = (atSeconds: number, gain: number): void => {
      const previous = points[points.length - 1];

      if (
        previous !== undefined &&
        previous.atSeconds === atSeconds &&
        previous.gain === gain
      ) {
        return;
      }

      if (previous !== undefined && previous.atSeconds >= atSeconds) {
        throw new Error("Generated gain envelope points must be strictly ordered");
      }

      points.push({ atSeconds, gain });
    };

    addPoint(0, layer.gainByFocus.environment);

    for (let index = 1; index < focusIntervals.length; index += 1) {
      const previous = focusIntervals[index - 1];
      const current = focusIntervals[index];
      const boundary = current.startSeconds;

      if (
        previous.focus === "environment" &&
        current.focus === "narration"
      ) {
        addPoint(
          boundary - scene.focusRampSeconds,
          layer.gainByFocus.environment,
        );
        addPoint(boundary, layer.gainByFocus.narration);
      } else if (
        previous.focus === "narration" &&
        current.focus === "environment"
      ) {
        addPoint(boundary, layer.gainByFocus.narration);
        addPoint(
          boundary + scene.focusRampSeconds,
          layer.gainByFocus.environment,
        );
      }
    }

    const finalFocus = focusIntervals[focusIntervals.length - 1]?.focus;
    addPoint(
      cursor,
      finalFocus === "narration"
        ? layer.gainByFocus.narration
        : layer.gainByFocus.environment,
    );

    return points;
  };

  const gainAtTime = (points: GainPoint[], atSeconds: number): number => {
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];

      if (current.atSeconds === atSeconds) {
        return current.gain;
      }

      if (current.atSeconds > atSeconds) {
        const previous = points[index - 1];
        const progress =
          (atSeconds - previous.atSeconds) /
          (current.atSeconds - previous.atSeconds);

        return previous.gain + (current.gain - previous.gain) * progress;
      }
    }

    return points[points.length - 1].gain;
  };

  for (const state of layerStates.values()) {
    if (state.startSeconds === undefined || state.clip === undefined) {
      throw new Error(`Triggered layer was never started: ${state.layer.id}`);
    }

    const activeEndSeconds = state.stopSeconds ?? cursor;
    const requiredDuration = activeEndSeconds - state.startSeconds;

    if (state.stopSeconds !== undefined) {
      state.clip.durationSeconds = requiredDuration;

      if (state.layer.fadeOutSeconds !== undefined) {
        if (
          !Number.isFinite(state.layer.fadeOutSeconds) ||
          state.layer.fadeOutSeconds <= 0 ||
          state.layer.fadeOutSeconds > requiredDuration
        ) {
          throw new RangeError(
            `Layer fade-out duration must be finite, positive, and no greater than its active duration: ${state.layer.id}`,
          );
        }

        state.clip.fadeOutSeconds = state.layer.fadeOutSeconds;
      }
    }

    if (state.assetDuration < requiredDuration) {
      throw new Error(
        `Layer asset is too short for the resolved scene: ${state.layer.id}`,
      );
    }

    if (
      state.layer.gainByFocus.narration ===
      state.layer.gainByFocus.environment
    ) {
      state.clip.gain = state.layer.gainByFocus.environment;
      continue;
    }

    if (requiredDuration <= 0) {
      throw new Error(
        `Focus-dependent layer has no active duration: ${state.layer.id}`,
      );
    }

    const crossesFocusTransition = focusIntervals.some(
      (interval, index) =>
        index > 0 &&
        interval.startSeconds > state.startSeconds! &&
        interval.startSeconds < activeEndSeconds,
    );

    if (scene.focusRampSeconds === 0) {
      if (crossesFocusTransition) {
        throw new Error(
          `Focus ramp must be positive for focus-dependent layer: ${state.layer.id}`,
        );
      }

      const activeFocus =
        focusIntervals.find(
          (interval) =>
            interval.startSeconds <= state.startSeconds! &&
            state.startSeconds! < interval.endSeconds,
        )?.focus ?? focusIntervals[focusIntervals.length - 1]?.focus;
      const activeGain =
        activeFocus === "narration"
          ? state.layer.gainByFocus.narration
          : state.layer.gainByFocus.environment;

      state.clip.gainEnvelope = [
        { atSeconds: 0, gain: activeGain },
        { atSeconds: requiredDuration, gain: activeGain },
      ];
      continue;
    }

    const globalPoints = createGlobalGainPoints(state.layer);
    const gainEnvelope: GainPoint[] = [
      {
        atSeconds: 0,
        gain: gainAtTime(globalPoints, state.startSeconds),
      },
    ];

    const addRelativePoint = (point: GainPoint): void => {
      const previous = gainEnvelope[gainEnvelope.length - 1];

      if (
        previous.atSeconds === point.atSeconds &&
        previous.gain === point.gain
      ) {
        return;
      }

      if (previous.atSeconds >= point.atSeconds) {
        throw new Error("Generated gain envelope points must be strictly ordered");
      }

      gainEnvelope.push(point);
    };

    for (const point of globalPoints) {
      if (
        point.atSeconds > state.startSeconds &&
        point.atSeconds <= activeEndSeconds
      ) {
        addRelativePoint({
          atSeconds: point.atSeconds - state.startSeconds,
          gain: point.gain,
        });
      }
    }

    addRelativePoint({
      atSeconds: requiredDuration,
      gain: gainAtTime(globalPoints, activeEndSeconds),
    });

    state.clip.gainEnvelope = gainEnvelope;
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
