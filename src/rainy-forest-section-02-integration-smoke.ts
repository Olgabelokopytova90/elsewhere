import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import type { NarrationAssetMap } from "./journey-materializer.js";
import { materializeJourneyPlan } from "./journey-materializer.js";
import {
  rainyForestMaterializationPolicy,
  rainyForestSoundCatalog,
} from "./rainy-forest-materialization-poc-fixture.js";
import { rainyForestSection01Plan } from "./rainy-forest-section-01-poc-fixture.js";
import { rainyForestSection02Plan } from "./rainy-forest-section-02-poc-fixture.js";
import { compileScene } from "./scene-compiler.js";
import { deriveSectionExitState } from "./section-continuity.js";

const narrationFiles = [
  "output/tts/rainy-forest/section-02/narration-01.wav",
  "output/tts/rainy-forest/section-02/narration-02.wav",
  "output/tts/rainy-forest/section-02/narration-03.wav",
  "output/tts/rainy-forest/section-02/narration-04.wav",
];

const expectedNarrationIds = [
  "narrowing-path",
  "rain-on-slope",
  "opening-between-trees",
  "rain-lightening-ahead",
];

const SANITY_TOLERANCE_SECONDS = 0.001;
const PREVIOUS_SECTION_01_POC_RESOLVED_DURATION_SECONDS = 97.45;

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
  const narrationSteps = rainyForestSection02Plan.steps.filter(
    (step) => step.kind === "narration",
  );

  if (narrationSteps.length !== expectedNarrationIds.length) {
    throw new Error("Rainy Forest Section 2 must contain exactly four narrations");
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
    rainyForestSection02Plan,
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
  const narrationClips = narrationFiles.map((file) =>
    requireClip(resolvedScene.clips, file),
  );

  const totalNarrationDurationSeconds = Object.values(narrationAssets)
    .reduce((total, asset) => total + asset.durationSeconds, 0);
  const targetDurationSeconds = rainyForestSection02Plan.targetDurationSeconds;
  const driftSeconds = resolvedScene.durationSeconds - targetDurationSeconds;
  const tailStartSeconds =
    resolvedScene.durationSeconds - rainyForestSection02Plan.tailSeconds;
  const sectionLocalFootstepsCoverageSeconds =
    resolvedScene.durationSeconds - footsteps.startSeconds;
  const footstepsMetadataDurationSeconds =
    rainyForestSoundCatalog["wet-trail-footsteps"].durationSeconds;
  const footstepsCoverageMarginSeconds =
    footstepsMetadataDurationSeconds - sectionLocalFootstepsCoverageSeconds;
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
  const entryContinuity = deriveSectionExitState(rainyForestSection01Plan);
  const exitContinuity = deriveSectionExitState(rainyForestSection02Plan);
  const inheritedAtEntryLayerIds = entryContinuity.activeLayers.map(
    (layer) => layer.layerId,
  );
  const activeAtExitLayerIds = exitContinuity.activeLayers.map(
    (layer) => layer.layerId,
  );
  const activeAtExitLayerIdSet = new Set(activeAtExitLayerIds);
  const stoppedDuringSectionLayerIds = inheritedAtEntryLayerIds.filter(
    (layerId) => !activeAtExitLayerIdSet.has(layerId),
  );
  const firstTwoTargetSeconds =
    rainyForestSection01Plan.targetDurationSeconds + targetDurationSeconds;
  const firstTwoResolvedSeconds =
    PREVIOUS_SECTION_01_POC_RESOLVED_DURATION_SECONDS +
    resolvedScene.durationSeconds;
  const firstTwoCumulativeDriftSeconds =
    firstTwoResolvedSeconds - firstTwoTargetSeconds;

  assertApproximately(totalNarrationDurationSeconds, 33.15, "Narration total");
  assertApproximately(resolvedScene.durationSeconds, 120.15, "Resolved duration");
  assertApproximately(driftSeconds, -4.85, "Duration drift");
  assertApproximately(tailStartSeconds, 116.15, "Tail start");
  assertApproximately(footsteps.startSeconds, 5, "Local footsteps start");
  assertApproximately(
    sectionLocalFootstepsCoverageSeconds,
    115.15,
    "Local footsteps coverage",
  );
  assertApproximately(waterDrip.startSeconds, 58.55, "Water drip start");
  assertApproximately(waterDripEndSeconds, 59.55, "Water drip end");
  assertApproximately(firstTwoResolvedSeconds, 217.6, "First two resolved total");
  assertApproximately(firstTwoCumulativeDriftSeconds, -2.4, "Cumulative drift");

  if (footsteps.durationSeconds !== undefined) {
    throw new Error("Unstopped footsteps must not receive a resolved duration");
  }

  if (
    forest.startSeconds !== 0 ||
    rain.startSeconds !== 0 ||
    forestCoverageMarginSeconds < 0 ||
    rainCoverageMarginSeconds < 0 ||
    footstepsCoverageMarginSeconds < 0
  ) {
    throw new Error("Rainy Forest Section 2 layer coverage is insufficient");
  }

  if (
    JSON.stringify(inheritedAtEntryLayerIds) !==
      JSON.stringify(["forest-bed", "canopy-rain", "trail-steps"]) ||
    JSON.stringify(activeAtExitLayerIds) !==
      JSON.stringify(["forest-bed", "canopy-rain", "trail-steps"]) ||
    stoppedDuringSectionLayerIds.length !== 0
  ) {
    throw new Error("Rainy Forest Section 2 continuity state is unexpected");
  }

  console.log("Rainy Forest Section 2 integration compiled successfully.");
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
  }

  console.log("\nSECTION-LOCAL COMPILED TIMING");
  console.log(`totalNarrationDurationSeconds: ${totalNarrationDurationSeconds}`);
  console.log(`targetDurationSeconds: ${targetDurationSeconds}`);
  console.log(`resolvedSceneDurationSeconds: ${resolvedScene.durationSeconds}`);
  console.log(`driftSeconds: ${driftSeconds}`);
  console.log(`tailStartSeconds: ${tailStartSeconds}`);
  console.log(`tailEndSeconds: ${resolvedScene.durationSeconds}`);
  console.log(`resolvedFootstepsStartSeconds: ${footsteps.startSeconds}`);
  console.log(`resolvedFootstepsDurationSeconds: ${String(footsteps.durationSeconds)}`);
  console.log(
    `sectionLocalFootstepsCoverageSeconds: ${sectionLocalFootstepsCoverageSeconds}`,
  );
  console.log(`footstepsMetadataDurationSeconds: ${footstepsMetadataDurationSeconds}`);
  console.log(`footstepsCoverageMarginSeconds: ${footstepsCoverageMarginSeconds}`);
  console.log(`forestRequiredCoverageSeconds: ${resolvedScene.durationSeconds}`);
  console.log(`forestMetadataDurationSeconds: ${forestMetadataDurationSeconds}`);
  console.log(`forestCoverageMarginSeconds: ${forestCoverageMarginSeconds}`);
  console.log(`rainRequiredCoverageSeconds: ${resolvedScene.durationSeconds}`);
  console.log(`rainMetadataDurationSeconds: ${rainMetadataDurationSeconds}`);
  console.log(`rainCoverageMarginSeconds: ${rainCoverageMarginSeconds}`);
  console.log(`waterDripStartSeconds: ${waterDrip.startSeconds}`);
  console.log(`waterDripDurationSeconds: ${waterDripDurationSeconds}`);
  console.log(`waterDripEndSeconds: ${waterDripEndSeconds}`);

  console.log("\nSEMANTIC SECTION 2 EXIT CONTINUITY");
  console.log(JSON.stringify(exitContinuity, null, 2));
  console.log(
    `inheritedAtEntryLayerIds: ${JSON.stringify(inheritedAtEntryLayerIds)}`,
  );
  console.log(`activeAtExitLayerIds: ${JSON.stringify(activeAtExitLayerIds)}`);
  console.log(
    `stoppedDuringSectionLayerIds: ${JSON.stringify(stoppedDuringSectionLayerIds)}`,
  );
  console.log(
    "Semantic continuity: trail-steps was active entering Section 2 and remains active at exit.",
  );
  console.log(
    "Section-local representation: trail-steps begins at local 5 seconds only as the self-contained plan's technical start anchor; this is not a semantic restart.",
  );

  console.log("\nCUMULATIVE POC TIMING DIAGNOSTIC");
  console.log(
    `previousSection01PocResolvedDurationSeconds: ${PREVIOUS_SECTION_01_POC_RESOLVED_DURATION_SECONDS}`,
  );
  console.log(`firstTwoTargetSeconds: ${firstTwoTargetSeconds}`);
  console.log(`firstTwoResolvedSeconds: ${firstTwoResolvedSeconds}`);
  console.log(`firstTwoCumulativeDriftSeconds: ${firstTwoCumulativeDriftSeconds}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
