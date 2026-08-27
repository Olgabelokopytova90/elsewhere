import { createJourneyPlan } from "./openai-ai-director.js";

const request =
  "Create a nighttime ocean journey lasting about 45 seconds. Use quiet cinematic narration, persistent ocean ambience, footsteps in soft sand after the first narration, one distant gull event later, meaningful narrator-free pauses, and a short ocean-only ending.";

try {
  const plan = await createJourneyPlan(request);

  console.log("AI Director JourneyPlan validated successfully.");
  console.log(JSON.stringify(plan, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
