import type { JourneyRequest } from "./journey-outline-types.js";
import { createJourneyOutline } from "./openai-journey-outliner.js";

const request: JourneyRequest = {
  destination: "rainy forest",
  durationSeconds: 300,
  mood: "calm exploratory",
};

try {
  const outline = await createJourneyOutline(request);
  const allocatedDurationSeconds = outline.sections.reduce(
    (total, section) => total + section.targetDurationSeconds,
    0,
  );

  console.log("Journey Outline generated successfully.");
  console.log("\nrequest:");
  console.log(JSON.stringify(request, null, 2));
  console.log("\noutline:");
  console.log(JSON.stringify(outline, null, 2));
  console.log(`\nsectionCount: ${outline.sections.length}`);

  for (const section of outline.sections) {
    console.log(`\nsectionId: ${section.id}`);
    console.log(`purpose: ${section.purpose}`);
    console.log(`description: ${section.description}`);
    console.log(`targetDurationSeconds: ${section.targetDurationSeconds}`);
  }

  console.log(`\nallocatedDurationSeconds: ${allocatedDurationSeconds}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
