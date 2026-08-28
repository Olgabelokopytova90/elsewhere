import { generateNarrationAssets } from "./openai-narration-tts.js";
import { rainyForestSection01Plan } from "./rainy-forest-section-01-poc-fixture.js";

const expectedNarrationIds = [
  "arrival-under-canopy",
  "nearby-forest",
  "path-ahead",
];

function countWords(text: string): number {
  const words = text.trim().split(/\s+/);
  return words.length === 1 && words[0] === "" ? 0 : words.length;
}

try {
  const narrationSteps = rainyForestSection01Plan.steps.filter(
    (step) => step.kind === "narration",
  );

  if (narrationSteps.length !== expectedNarrationIds.length) {
    throw new Error("Rainy Forest Section 1 must contain three narrations");
  }

  for (let index = 0; index < narrationSteps.length; index += 1) {
    if (narrationSteps[index].id !== expectedNarrationIds[index]) {
      throw new Error(
        `Unexpected Rainy Forest Section 1 narration order: ${narrationSteps[index].id}`,
      );
    }
  }

  const narrationAssets = await generateNarrationAssets(
    rainyForestSection01Plan,
    "output/tts/rainy-forest/section-01",
  );
  const totalNarrationWordCount = narrationSteps.reduce(
    (total, step) => total + countWords(step.text),
    0,
  );
  const totalNarrationDurationSeconds = Object.values(narrationAssets)
    .reduce((total, asset) => total + asset.durationSeconds, 0);
  const observedNarrationWordsPerMinute =
    totalNarrationWordCount / (totalNarrationDurationSeconds / 60);
  const totalExplicitPauseSeconds = rainyForestSection01Plan.steps
    .filter((step) => step.kind === "pause")
    .reduce((total, step) => total + step.durationSeconds, 0);
  const eventBeforeAfterSeconds = rainyForestSection01Plan.steps
    .filter((step) => step.kind === "event")
    .reduce(
      (total, step) => total + step.beforeSeconds + step.afterSeconds,
      0,
    );
  const knownNonNarrationSeconds =
    rainyForestSection01Plan.openingSeconds +
    totalExplicitPauseSeconds +
    eventBeforeAfterSeconds +
    rainyForestSection01Plan.tailSeconds;
  const remainingTargetBudgetBeforeEventAudioSeconds =
    rainyForestSection01Plan.targetDurationSeconds -
    knownNonNarrationSeconds -
    totalNarrationDurationSeconds;

  console.log(
    "Rainy Forest Section 1 narration TTS generated successfully.",
  );

  for (const step of narrationSteps) {
    const asset = narrationAssets[step.id];
    console.log(`\nnarrationId: ${step.id}`);
    console.log(`file: ${asset.file}`);
    console.log(`durationSeconds: ${asset.durationSeconds}`);
    console.log(`sourceText: ${asset.sourceText}`);
  }

  console.log(`\nnarrationBeatCount: ${narrationSteps.length}`);
  console.log(`totalNarrationWordCount: ${totalNarrationWordCount}`);
  console.log(
    `totalNarrationDurationSeconds: ${totalNarrationDurationSeconds}`,
  );
  console.log(
    `observedNarrationWordsPerMinute: ${observedNarrationWordsPerMinute}`,
  );
  console.log(
    `sectionTargetDurationSeconds: ${rainyForestSection01Plan.targetDurationSeconds}`,
  );
  console.log(`openingSeconds: ${rainyForestSection01Plan.openingSeconds}`);
  console.log(`totalExplicitPauseSeconds: ${totalExplicitPauseSeconds}`);
  console.log(`eventBeforeAfterSeconds: ${eventBeforeAfterSeconds}`);
  console.log(`tailSeconds: ${rainyForestSection01Plan.tailSeconds}`);
  console.log(`knownNonNarrationSeconds: ${knownNonNarrationSeconds}`);
  console.log(
    `remainingTargetBudgetBeforeEventAudioSeconds: ${remainingTargetBudgetBeforeEventAudioSeconds}`,
  );
  console.log(
    "remainingTargetBudgetBeforeEventAudioSeconds excludes the unknown physical duration of water-drip-near and is not final section drift.",
  );
  console.log("\nNarrationAssetMap:");
  console.log(JSON.stringify(narrationAssets, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
