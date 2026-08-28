import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import type {
  NarrationAssetMap,
  SoundCatalog,
} from "./journey-materializer.js";
import { materializeJourneyPlan } from "./journey-materializer.js";
import {
  nightOceanMaterializationPolicy,
  nightOceanPlan,
  nightOceanSoundCatalog,
} from "./night-ocean-poc-fixture.js";
import { compileScene } from "./scene-compiler.js";

const narrationFiles = [
  "output/tts/night-ocean/narration-01.wav",
  "output/tts/night-ocean/narration-02.wav",
  "output/tts/night-ocean/narration-03.wav",
  "output/tts/night-ocean/narration-04.wav",
];

const expectedNarrationIds = [
  "shoreline-arrival",
  "walking-waterline",
  "open-water",
  "shoreline-remains",
];

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
  const narrationSteps = nightOceanPlan.steps.filter(
    (step) => step.kind === "narration",
  );

  if (narrationSteps.length !== narrationFiles.length) {
    throw new Error("Night Ocean plan must contain exactly four narrations");
  }

  const narrationAssets = Object.create(null) as NarrationAssetMap;

  for (let index = 0; index < narrationSteps.length; index += 1) {
    const narration = narrationSteps[index];
    const file = narrationFiles[index];

    if (narration.id !== expectedNarrationIds[index]) {
      throw new Error(`Unexpected Night Ocean narration order: ${narration.id}`);
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

function verifyInsufficientFootstepsCoverage(
  narrationAssets: NarrationAssetMap,
): void {
  const insufficientCatalog: SoundCatalog = {
    ...nightOceanSoundCatalog,
    "sand-footsteps-soft": {
      ...nightOceanSoundCatalog["sand-footsteps-soft"],
      durationSeconds: 30,
    },
  };
  const materialized = materializeJourneyPlan(
    nightOceanPlan,
    insufficientCatalog,
    narrationAssets,
    nightOceanMaterializationPolicy,
  );

  try {
    compileScene(materialized.scene, materialized.assetMetadata);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        "Layer asset is too short for the resolved scene: footsteps"
    ) {
      return;
    }

    throw error;
  }

  throw new Error("Expected 30-second footsteps coverage to be rejected");
}

try {
  const narrationAssets = await createNarrationAssets();

  verifyInsufficientFootstepsCoverage(narrationAssets);

  const materialized = materializeJourneyPlan(
    nightOceanPlan,
    nightOceanSoundCatalog,
    narrationAssets,
    nightOceanMaterializationPolicy,
  );
  const resolvedScene = compileScene(
    materialized.scene,
    materialized.assetMetadata,
  );
  const footsteps = resolvedScene.clips.find(
    (clip) => clip.file === "synthetic/footsteps.wav",
  );

  if (
    footsteps === undefined ||
    footsteps.durationSeconds === undefined
  ) {
    throw new Error("Resolved stopped footsteps clip is missing");
  }

  const totalNarrationDurationSeconds = Object.values(narrationAssets)
    .reduce((total, asset) => total + asset.durationSeconds, 0);
  const driftSeconds =
    resolvedScene.durationSeconds - nightOceanPlan.targetDurationSeconds;
  const footstepsEndSeconds =
    footsteps.startSeconds + footsteps.durationSeconds;
  const tailStartSeconds =
    resolvedScene.durationSeconds - nightOceanPlan.tailSeconds;
  const footstepsStoppedBeforeTail = footstepsEndSeconds <= tailStartSeconds;

  if (!footstepsStoppedBeforeTail) {
    throw new Error("Footsteps must stop before the Night Ocean tail");
  }

  console.log("Narration integration compiled successfully.");

  for (const step of nightOceanPlan.steps) {
    if (step.kind !== "narration") {
      continue;
    }

    const asset = narrationAssets[step.id];
    console.log(`\nnarrationId: ${step.id}`);
    console.log(`file: ${asset.file}`);
    console.log(`durationSeconds: ${asset.durationSeconds}`);
  }

  console.log("\n30SecondFootstepsCoverageRejected: true");
  console.log(`totalNarrationDurationSeconds: ${totalNarrationDurationSeconds}`);
  console.log(`targetDurationSeconds: ${nightOceanPlan.targetDurationSeconds}`);
  console.log(`resolvedSceneDurationSeconds: ${resolvedScene.durationSeconds}`);
  console.log(`driftSeconds: ${driftSeconds}`);
  console.log(`footstepsStartSeconds: ${footsteps.startSeconds}`);
  console.log(`footstepsEndSeconds: ${footstepsEndSeconds}`);
  console.log(`footstepsDurationSeconds: ${footsteps.durationSeconds}`);
  console.log(`tailStartSeconds: ${tailStartSeconds}`);
  console.log(`footstepsStoppedBeforeTail: ${footstepsStoppedBeforeTail}`);
  console.log(
    `oceanMetadataCoverageSeconds: ${nightOceanSoundCatalog["ocean-night-calm"].durationSeconds}`,
  );
  console.log(
    `footstepsMetadataCoverageSeconds: ${nightOceanSoundCatalog["sand-footsteps-soft"].durationSeconds}`,
  );
  console.log(
    `footstepsCoverageMarginSeconds: ${nightOceanSoundCatalog["sand-footsteps-soft"].durationSeconds - footsteps.durationSeconds}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
