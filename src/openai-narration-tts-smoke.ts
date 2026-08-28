import type { JourneyPlan } from "./journey-plan-types.js";
import { generateNarrationAssets } from "./openai-narration-tts.js";

const nightOceanPlan: JourneyPlan = {
  targetDurationSeconds: 45,
  openingSeconds: 3,
  layers: [
    {
      id: "ocean",
      sound: {
        soundId: "ocean-night-calm",
        direction: "center",
        distance: "far",
        prominence: "background",
      },
      start: "sceneStart",
      entrance: "immediate",
    },
    {
      id: "footsteps",
      sound: {
        soundId: "sand-footsteps-soft",
        direction: "left",
        distance: "near",
        prominence: "normal",
      },
      start: "triggered",
      entrance: "gentle",
    },
  ],
  steps: [
    {
      kind: "narration",
      id: "shoreline-arrival",
      text: "Night gathers along the shoreline. A thin wash of foam finds the dark sand, then slips back.",
      actions: [],
    },
    {
      kind: "pause",
      durationSeconds: 6,
      actions: [
        {
          kind: "startLayer",
          layerId: "footsteps",
          offsetSeconds: 0,
        },
      ],
    },
    {
      kind: "narration",
      id: "walking-waterline",
      text: "Along the waterline, each step leaves a darker print for only a moment. The tide reaches close, cool and silver at its edge.",
      actions: [],
    },
    {
      kind: "pause",
      durationSeconds: 5,
      actions: [],
    },
    {
      kind: "event",
      id: "distant-gull",
      sound: {
        soundId: "gull-distant-single",
        direction: "right",
        distance: "far",
        prominence: "background",
      },
      beforeSeconds: 1,
      afterSeconds: 2,
    },
    {
      kind: "narration",
      id: "open-water",
      text: "Beyond the small breaking waves, the sea becomes one broad field of blackglass, lifted and lowered by moonless swells.",
      actions: [],
    },
    {
      kind: "pause",
      durationSeconds: 5,
      actions: [
        {
          kind: "stopLayer",
          layerId: "footsteps",
          offsetSeconds: 1,
        },
      ],
    },
    {
      kind: "narration",
      id: "shoreline-remains",
      text: "The last footprints soften behind you. Far out, the ocean keeps its patient, unbroken rhythm.",
      actions: [],
    },
  ],
  tailSeconds: 5,
};

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
