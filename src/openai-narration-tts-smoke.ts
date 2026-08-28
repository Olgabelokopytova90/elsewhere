import { nightOceanPlan } from "./night-ocean-poc-fixture.js";
import { generateNarrationAssets } from "./openai-narration-tts.js";

try {
  const narrationAssets = await generateNarrationAssets(
    nightOceanPlan,
    "output/tts/night-ocean",
  );
  let totalNarrationDurationSeconds = 0;

  console.log("Narration TTS generated successfully.");

  for (const step of nightOceanPlan.steps) {
    if (step.kind !== "narration") {
      continue;
    }

    const asset = narrationAssets[step.id];
    totalNarrationDurationSeconds += asset.durationSeconds;
    console.log(`\nnarrationId: ${step.id}`);
    console.log(`file: ${asset.file}`);
    console.log(`durationSeconds: ${asset.durationSeconds}`);
    console.log(`sourceText: ${asset.sourceText}`);
  }

  console.log(
    `\ntotalNarrationDurationSeconds: ${totalNarrationDurationSeconds}`,
  );
  console.log("\nNarrationAssetMap:");
  console.log(JSON.stringify(narrationAssets, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
