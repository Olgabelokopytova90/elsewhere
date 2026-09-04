import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import type { NarrationAssetMap } from "./journey-materializer.js";
import { materializeJourneyPlan } from "./journey-materializer.js";
import {
  rainyForestMaterializationPolicy,
  rainyForestSoundCatalog,
} from "./rainy-forest-materialization-poc-fixture.js";
import { rainyForestSection02Plan } from "./rainy-forest-section-02-poc-fixture.js";
import { rainyForestSection03Plan } from "./rainy-forest-section-03-poc-fixture.js";
import { compileScene } from "./scene-compiler.js";
import { deriveSectionExitState } from "./section-continuity.js";

const narrationFiles = [
  "output/tts/rainy-forest/section-03/narration-01.wav",
  "output/tts/rainy-forest/section-03/narration-02.wav",
  "output/tts/rainy-forest/section-03/narration-03.wav",
];

const expectedNarrationIds = [
  "opening-clearing",
  "arrival-moss",
  "open-hush",
];

const SANITY_TOLERANCE_SECONDS = 0.001;
const SECTION_01_TARGET_SECONDS = 95;
const SECTION_01_RESOLVED_SECONDS = 97.45;
const SECTION_02_TARGET_SECONDS = 125;
const SECTION_02_RESOLVED_SECONDS = 120.15;

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
  const narrationSteps = rainyForestSection03Plan.steps.filter(
    (step) => step.kind === "narration",
  );

  if (narrationSteps.length !== expectedNarrationIds.length) {
    throw new Error("Rainy Forest Section 3 must contain exactly three narrations");
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

try {
  const narrationAssets = await createNarrationAssets();
  const materialized = materializeJourneyPlan(
    rainyForestSection03Plan,
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
  const bird = requireClip(
    resolvedScene.clips,
    "synthetic/bird-distant-single.wav",
  );
  const narrationClips = narrationFiles.map((file) =>
    requireClip(resolvedScene.clips, file),
  );

  const totalNarrationDurationSeconds = Object.values(narrationAssets)
    .reduce((total, asset) => total + asset.durationSeconds, 0);
  const targetDurationSeconds = rainyForestSection03Plan.targetDurationSeconds;
  const driftSeconds = resolvedScene.durationSeconds - targetDurationSeconds;
  const tailStartSeconds =
    resolvedScene.durationSeconds - rainyForestSection03Plan.tailSeconds;
  const footstepsStopSeconds =
    footsteps.startSeconds + (footsteps.durationSeconds ?? Number.NaN);
  const requiredFootstepsCoverageSeconds = footsteps.durationSeconds ?? Number.NaN;
  const footstepsMetadataDurationSeconds =
    rainyForestSoundCatalog["wet-trail-footsteps"].durationSeconds;
  const footstepsCoverageMarginSeconds =
    footstepsMetadataDurationSeconds - requiredFootstepsCoverageSeconds;
  const forestMetadataDurationSeconds =
    rainyForestSoundCatalog["rainy-forest-ambience"].durationSeconds;
  const rainMetadataDurationSeconds =
    rainyForestSoundCatalog["rain-canopy-steady"].durationSeconds;
  const forestCoverageMarginSeconds =
    forestMetadataDurationSeconds - resolvedScene.durationSeconds;
  const rainCoverageMarginSeconds =
    rainMetadataDurationSeconds - resolvedScene.durationSeconds;
  const birdMetadataDurationSeconds =
    rainyForestSoundCatalog["bird-distant-single"].durationSeconds;
  const birdEndSeconds = bird.startSeconds + birdMetadataDurationSeconds;
  const entryContinuity = deriveSectionExitState(rainyForestSection02Plan);
  const exitContinuity = deriveSectionExitState(rainyForestSection03Plan);
  const entryActiveLayerIds = entryContinuity.activeLayers.map(
    (layer) => layer.layerId,
  );
  const exitActiveLayerIds = exitContinuity.activeLayers.map(
    (layer) => layer.layerId,
  );
  const exitActiveLayerIdSet = new Set(exitActiveLayerIds);
  const stoppedLayerIds = entryActiveLayerIds.filter(
    (layerId) => !exitActiveLayerIdSet.has(layerId),
  );
  const wholeJourneyTargetSeconds =
    SECTION_01_TARGET_SECONDS + SECTION_02_TARGET_SECONDS + targetDurationSeconds;
  const wholeJourneySectionSumSeconds =
    SECTION_01_RESOLVED_SECONDS +
    SECTION_02_RESOLVED_SECONDS +
    resolvedScene.durationSeconds;
  const wholeJourneySectionSumDriftSeconds =
    wholeJourneySectionSumSeconds - wholeJourneyTargetSeconds;
  const wholeJourneySectionSumDriftPercent =
    (wholeJourneySectionSumDriftSeconds / wholeJourneyTargetSeconds) * 100;

  assertApproximately(totalNarrationDurationSeconds, 24.3, "Narration total");
  assertApproximately(resolvedScene.durationSeconds, 87.3, "Resolved duration");
  assertApproximately(driftSeconds, 7.3, "Duration drift");
  assertApproximately(tailStartSeconds, 79.3, "Tail start");
  assertApproximately(footsteps.startSeconds, 5, "Local footsteps start");
  assertApproximately(footstepsStopSeconds, 34.7, "Local footsteps stop");
  assertApproximately(requiredFootstepsCoverageSeconds, 29.7, "Footsteps coverage");
  assertApproximately(bird.startSeconds, 52.7, "Bird start");
  assertApproximately(birdEndSeconds, 54.7, "Bird end");
  assertApproximately(wholeJourneySectionSumSeconds, 304.9, "Section sum");
  assertApproximately(wholeJourneySectionSumDriftSeconds, 4.9, "Section sum drift");

  if (footsteps.durationSeconds === undefined) {
    throw new Error("Stopped footsteps must receive a resolved duration");
  }

  if (footsteps.fadeOutSeconds !== 0.05) {
    throw new Error("Stopped footsteps must preserve fadeOutSeconds 0.05");
  }

  if (
    forest.startSeconds !== 0 ||
    rain.startSeconds !== 0 ||
    forestCoverageMarginSeconds < 0 ||
    rainCoverageMarginSeconds < 0 ||
    footstepsCoverageMarginSeconds < 0
  ) {
    throw new Error("Rainy Forest Section 3 layer coverage is insufficient");
  }

  if (
    bird.gain !== 0.25 ||
    bird.pan !== 0.8 ||
    bird.lowpassHz !== 4000 ||
    bird.fadeInSeconds !== 0.1
  ) {
    throw new Error("Rainy Forest Section 3 bird DSP is unexpected");
  }

  if (
    JSON.stringify(entryActiveLayerIds) !==
      JSON.stringify(["forest-bed", "canopy-rain", "trail-steps"]) ||
    JSON.stringify(exitActiveLayerIds) !==
      JSON.stringify(["forest-bed", "canopy-rain"]) ||
    JSON.stringify(stoppedLayerIds) !== JSON.stringify(["trail-steps"])
  ) {
    throw new Error("Rainy Forest Section 3 continuity state is unexpected");
  }

  console.log("Rainy Forest Section 3 integration compiled successfully.");
  console.log("\nNARRATION WAV ARTIFACTS");

  for (let index = 0; index < expectedNarrationIds.length; index += 1) {
    const narrationId = expectedNarrationIds[index];
    const asset = narrationAssets[narrationId];
    const clip = narrationClips[index];
    console.log(`narrationId: ${narrationId}`);
    console.log(`file: ${asset.file}`);
    console.log(`durationSeconds: ${asset.durationSeconds}`);
    console.log(`startSeconds: ${clip.startSeconds}`);
    console.log(`endSeconds: ${clip.startSeconds + asset.durationSeconds}`);
    console.log(`sourceText: ${asset.sourceText}`);
  }

  console.log("\nSECTION-LOCAL COMPILED TIMING");
  console.log(`totalNarrationDurationSeconds: ${totalNarrationDurationSeconds}`);
  console.log(`targetDurationSeconds: ${targetDurationSeconds}`);
  console.log(`resolvedSceneDurationSeconds: ${resolvedScene.durationSeconds}`);
  console.log(`driftSeconds: ${driftSeconds}`);
  console.log(`tailStartSeconds: ${tailStartSeconds}`);
  console.log(`tailEndSeconds: ${resolvedScene.durationSeconds}`);
  console.log(`footstepsStartSeconds: ${footsteps.startSeconds}`);
  console.log(`footstepsStopSeconds: ${footstepsStopSeconds}`);
  console.log(`resolvedFootstepsDurationSeconds: ${footsteps.durationSeconds}`);
  console.log(`footstepsFadeOutSeconds: ${footsteps.fadeOutSeconds}`);
  console.log(`requiredFootstepsCoverageSeconds: ${requiredFootstepsCoverageSeconds}`);
  console.log(`footstepsMetadataDurationSeconds: ${footstepsMetadataDurationSeconds}`);
  console.log(`footstepsCoverageMarginSeconds: ${footstepsCoverageMarginSeconds}`);
  console.log(`forestRequiredCoverageSeconds: ${resolvedScene.durationSeconds}`);
  console.log(`forestMetadataDurationSeconds: ${forestMetadataDurationSeconds}`);
  console.log(`forestCoverageMarginSeconds: ${forestCoverageMarginSeconds}`);
  console.log(`rainRequiredCoverageSeconds: ${resolvedScene.durationSeconds}`);
  console.log(`rainMetadataDurationSeconds: ${rainMetadataDurationSeconds}`);
  console.log(`rainCoverageMarginSeconds: ${rainCoverageMarginSeconds}`);
  console.log(`birdStartSeconds: ${bird.startSeconds}`);
  console.log(`birdMetadataDurationSeconds: ${birdMetadataDurationSeconds}`);
  console.log(`birdEndSeconds: ${birdEndSeconds}`);
  console.log(`birdGain: ${bird.gain}`);
  console.log(`birdPan: ${bird.pan}`);
  console.log(`birdLowpassHz: ${bird.lowpassHz}`);
  console.log(`birdFadeInSeconds: ${bird.fadeInSeconds}`);

  console.log("\nFINAL SEMANTIC EXIT CONTINUITY");
  console.log(JSON.stringify(exitContinuity, null, 2));
  console.log(`entryActiveLayerIds: ${JSON.stringify(entryActiveLayerIds)}`);
  console.log(`exitActiveLayerIds: ${JSON.stringify(exitActiveLayerIds)}`);
  console.log(`stoppedLayerIds: ${JSON.stringify(stoppedLayerIds)}`);
  console.log(
    "Scene-start forest and rain remain semantically active; final journey fade/end behavior belongs to later assembler or renderer orchestration.",
  );

  console.log("\nWHOLE-JOURNEY SECTION-SUM TIMING DIAGNOSTIC");
  console.log("Section 1: target 95, resolved 97.45, drift +2.45");
  console.log("Section 2: target 125, resolved 120.15, drift -4.85");
  console.log(
    `Section 3: target ${targetDurationSeconds}, resolved ${resolvedScene.durationSeconds}, drift ${driftSeconds}`,
  );
  console.log(
    `Whole: target ${wholeJourneyTargetSeconds}, resolved ${wholeJourneySectionSumSeconds}, drift ${wholeJourneySectionSumDriftSeconds}`,
  );
  console.log(`wholeJourneyTargetSeconds: ${wholeJourneyTargetSeconds}`);
  console.log(`wholeJourneySectionSumSeconds: ${wholeJourneySectionSumSeconds}`);
  console.log(
    `wholeJourneySectionSumDriftSeconds: ${wholeJourneySectionSumDriftSeconds}`,
  );
  console.log(
    `wholeJourneySectionSumDriftPercent: ${wholeJourneySectionSumDriftPercent}`,
  );
  console.log(
    "This is the sum of independently compiled section durations, not an assembled rendered journey duration; it does not account for future boundary overlap, restart suppression, crossfades, source continuation, or tail/opening overlap.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
