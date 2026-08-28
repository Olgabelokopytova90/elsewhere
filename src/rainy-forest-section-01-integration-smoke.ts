import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import type {
  NarrationAssetMap,
} from "./journey-materializer.js";
import { materializeJourneyPlan } from "./journey-materializer.js";
import {
  rainyForestMaterializationPolicy,
  rainyForestSoundCatalog,
} from "./rainy-forest-materialization-poc-fixture.js";
import { rainyForestSection01Plan } from "./rainy-forest-section-01-poc-fixture.js";
import { compileScene } from "./scene-compiler.js";

const narrationFiles = [
  "output/tts/rainy-forest/section-01/narration-01.wav",
  "output/tts/rainy-forest/section-01/narration-02.wav",
  "output/tts/rainy-forest/section-01/narration-03.wav",
];

const expectedNarrationIds = [
  "arrival-under-canopy",
  "nearby-forest",
  "path-ahead",
];

const SANITY_TOLERANCE_SECONDS = 0.001;

function assertApproximately(
  actual: number,
  expected: number,
  name: string,
): void {
  if (Math.abs(actual - expected) > SANITY_TOLERANCE_SECONDS) {
    throw new Error(`${name} expected approximately ${expected}, received ${actual}`);
  }
}

function probeDuration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        file,
      ],
      { encoding: "utf8" },
      (error, stdout) => {
        if (error !== null) {
          reject(new Error(`Failed to probe narration WAV: ${file}`, {
            cause: error,
          }));
          return;
        }

        const durationSeconds = Number(stdout.trim());

        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
          reject(new Error(`Narration WAV duration is invalid: ${file}`));
          return;
        }

        resolve(durationSeconds);
      },
    );
  });
}

async function createNarrationAssets(): Promise<NarrationAssetMap> {
  const narrationSteps = rainyForestSection01Plan.steps.filter(
    (step) => step.kind === "narration",
  );

  if (narrationSteps.length !== 3) {
    throw new Error("Rainy Forest Section 1 must contain exactly three narrations");
  }

  const narrationAssets = Object.create(null) as NarrationAssetMap;

  for (let index = 0; index < narrationSteps.length; index += 1) {
    const narration = narrationSteps[index];
    const file = narrationFiles[index];

    if (narration.id !== expectedNarrationIds[index]) {
      throw new Error(`Unexpected Rainy Forest narration order: ${narration.id}`);
    }

    try {
      const fileStats = await stat(file);

      if (!fileStats.isFile() || fileStats.size <= 0) {
        throw new Error();
      }
    } catch {
      throw new Error(`Narration WAV is missing or empty: ${file}`);
    }

    narrationAssets[narration.id] = {
      file,
      durationSeconds: await probeDuration(file),
      sourceText: narration.text,
    };
  }

  return narrationAssets;
}

function requireClip(
  clips: ReturnType<typeof compileScene>["clips"],
  file: string,
) {
  const clip = clips.find((candidate) => candidate.file === file);

  if (clip === undefined) {
    throw new Error(`Expected resolved clip is missing: ${file}`);
  }

  return clip;
}

function getSemanticExitState() {
  const activeTriggeredLayerIds = new Set<string>();
  const explicitlyStoppedLayerIds = new Set<string>();

  for (const step of rainyForestSection01Plan.steps) {
    if (step.kind === "event") {
      continue;
    }

    for (const action of step.actions ?? []) {
      if (action.kind === "startLayer") {
        activeTriggeredLayerIds.add(action.layerId);
      } else {
        activeTriggeredLayerIds.delete(action.layerId);
        explicitlyStoppedLayerIds.add(action.layerId);
      }
    }
  }

  const sceneStartLayers = rainyForestSection01Plan.layers
    .filter((layer) => layer.start === "sceneStart")
    .map((layer) => ({ id: layer.id, soundId: layer.sound.soundId }));
  const activeTriggeredLayers = rainyForestSection01Plan.layers
    .filter((layer) => activeTriggeredLayerIds.has(layer.id))
    .map((layer) => ({ id: layer.id, soundId: layer.sound.soundId }));
  const explicitlyStoppedLayers = rainyForestSection01Plan.layers
    .filter((layer) => explicitlyStoppedLayerIds.has(layer.id))
    .map((layer) => ({ id: layer.id, soundId: layer.sound.soundId }));

  return {
    sceneStartLayers,
    activeTriggeredLayers,
    explicitlyStoppedLayers,
  };
}

try {
  const narrationAssets = await createNarrationAssets();
  const materialized = materializeJourneyPlan(
    rainyForestSection01Plan,
    rainyForestSoundCatalog,
    narrationAssets,
    rainyForestMaterializationPolicy,
  );
  const resolvedScene = compileScene(
    materialized.scene,
    materialized.assetMetadata,
  );

  const forest = requireClip(
    resolvedScene.clips,
    "synthetic/rainy-forest-ambience.wav",
  );
  const rain = requireClip(
    resolvedScene.clips,
    "synthetic/rain-canopy-steady.wav",
  );
  const footsteps = requireClip(
    resolvedScene.clips,
    "synthetic/wet-trail-footsteps.wav",
  );
  const waterDrip = requireClip(
    resolvedScene.clips,
    "synthetic/water-drip-near.wav",
  );

  for (const file of narrationFiles) {
    requireClip(resolvedScene.clips, file);
  }

  const totalNarrationDurationSeconds = Object.values(narrationAssets)
    .reduce((total, asset) => total + asset.durationSeconds, 0);
  const targetDurationSeconds = rainyForestSection01Plan.targetDurationSeconds;
  const driftSeconds = resolvedScene.durationSeconds - targetDurationSeconds;
  const tailStartSeconds =
    resolvedScene.durationSeconds - rainyForestSection01Plan.tailSeconds;
  const inferredFootstepsActiveDurationSeconds =
    resolvedScene.durationSeconds - footsteps.startSeconds;
  const footstepsMetadataDurationSeconds =
    rainyForestSoundCatalog["wet-trail-footsteps"].durationSeconds;
  const footstepsCoverageMarginSeconds =
    footstepsMetadataDurationSeconds - inferredFootstepsActiveDurationSeconds;
  const forestMetadataDurationSeconds =
    rainyForestSoundCatalog["rainy-forest-ambience"].durationSeconds;
  const rainMetadataDurationSeconds =
    rainyForestSoundCatalog["rain-canopy-steady"].durationSeconds;
  const forestCoverageMarginSeconds =
    forestMetadataDurationSeconds - resolvedScene.durationSeconds;
  const rainCoverageMarginSeconds =
    rainMetadataDurationSeconds - resolvedScene.durationSeconds;
  const waterDripDurationSeconds =
    rainyForestSoundCatalog["water-drip-near"].durationSeconds;
  const waterDripEndSeconds =
    waterDrip.startSeconds + waterDripDurationSeconds;
  const footstepsContinueThroughTail =
    footsteps.startSeconds < tailStartSeconds &&
    footsteps.durationSeconds === undefined;
  const exitState = getSemanticExitState();

  assertApproximately(totalNarrationDurationSeconds, 25.45, "Narration total");
  assertApproximately(resolvedScene.durationSeconds, 97.45, "Resolved duration");
  assertApproximately(driftSeconds, 2.45, "Duration drift");
  assertApproximately(tailStartSeconds, 93.45, "Tail start");
  assertApproximately(footsteps.startSeconds, 18.45, "Footsteps start");
  assertApproximately(
    inferredFootstepsActiveDurationSeconds,
    79,
    "Footsteps active duration",
  );
  assertApproximately(waterDrip.startSeconds, 45.3, "Water drip start");
  assertApproximately(waterDripEndSeconds, 46.3, "Water drip end");

  if (footsteps.durationSeconds !== undefined) {
    throw new Error("Unstopped footsteps must not receive a resolved duration");
  }

  if (!footstepsContinueThroughTail) {
    throw new Error("Footsteps must remain active through the section tail");
  }

  if (
    forest.startSeconds !== 0 ||
    rain.startSeconds !== 0 ||
    forestCoverageMarginSeconds < 0 ||
    rainCoverageMarginSeconds < 0 ||
    footstepsCoverageMarginSeconds < 0
  ) {
    throw new Error("Rainy Forest layer coverage is insufficient");
  }

  if (
    waterDrip.gain !== 0.45 ||
    waterDrip.pan !== -0.6 ||
    waterDrip.lowpassHz !== 12000 ||
    waterDrip.fadeInSeconds !== 0.03
  ) {
    throw new Error("Water drip materialization does not match policy");
  }

  console.log("Rainy Forest Section 1 integration compiled successfully.");
  console.log("\nNARRATION WAV ARTIFACTS");

  for (const narrationId of expectedNarrationIds) {
    const asset = narrationAssets[narrationId];
    console.log(`narrationId: ${narrationId}`);
    console.log(`file: ${asset.file}`);
    console.log(`durationSeconds: ${asset.durationSeconds}`);
  }

  console.log("\nCOMPILED SECTION TIMING");
  console.log(`totalNarrationDurationSeconds: ${totalNarrationDurationSeconds}`);
  console.log(`targetDurationSeconds: ${targetDurationSeconds}`);
  console.log(`resolvedSceneDurationSeconds: ${resolvedScene.durationSeconds}`);
  console.log(`driftSeconds: ${driftSeconds}`);
  console.log(`tailStartSeconds: ${tailStartSeconds}`);
  console.log(`footstepsStartSeconds: ${footsteps.startSeconds}`);
  console.log(`resolvedFootstepsDurationSeconds: ${String(footsteps.durationSeconds)}`);
  console.log(
    `inferredFootstepsSectionLocalActiveDurationSeconds: ${inferredFootstepsActiveDurationSeconds}`,
  );
  console.log(`footstepsMetadataDurationSeconds: ${footstepsMetadataDurationSeconds}`);
  console.log(`footstepsCoverageMarginSeconds: ${footstepsCoverageMarginSeconds}`);
  console.log(`footstepsContinueThroughTail: ${footstepsContinueThroughTail}`);
  console.log(`forestRequiredCoverageSeconds: ${resolvedScene.durationSeconds}`);
  console.log(`forestMetadataDurationSeconds: ${forestMetadataDurationSeconds}`);
  console.log(`forestCoverageMarginSeconds: ${forestCoverageMarginSeconds}`);
  console.log(`rainRequiredCoverageSeconds: ${resolvedScene.durationSeconds}`);
  console.log(`rainMetadataDurationSeconds: ${rainMetadataDurationSeconds}`);
  console.log(`rainCoverageMarginSeconds: ${rainCoverageMarginSeconds}`);
  console.log(`waterDripStartSeconds: ${waterDrip.startSeconds}`);
  console.log(`waterDripDurationSeconds: ${waterDripDurationSeconds}`);
  console.log(`waterDripEndSeconds: ${waterDripEndSeconds}`);

  console.log("\nSEMANTIC EXIT STATE");
  console.log(`sceneStartActiveLayers: ${JSON.stringify(exitState.sceneStartLayers)}`);
  console.log(
    `triggeredActiveAtExitLayers: ${JSON.stringify(exitState.activeTriggeredLayers)}`,
  );
  console.log(
    `explicitlyStoppedLayers: ${JSON.stringify(exitState.explicitlyStoppedLayers)}`,
  );
  console.log(
    "ResolvedScene boundary coverage does not encode journey-level continuation intent.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
