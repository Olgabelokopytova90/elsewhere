import type { JourneyPlan } from "./journey-plan-types.js";
import { createSectionJourneyPlan } from "./openai-section-director.js";
import {
  rainyForestOutline,
  rainyForestRequest,
} from "./rainy-forest-outline-poc-fixture.js";

const sectionIndex = 0;

function countWords(text: string): number {
  const words = text.trim().split(/\s+/);
  return words.length === 1 && words[0] === "" ? 0 : words.length;
}

function inspectTriggeredLayers(plan: JourneyPlan): string[] {
  const activeByLayerId = new Map(
    plan.layers
      .filter((layer) => layer.start === "triggered")
      .map((layer) => [layer.id, false]),
  );

  for (const step of plan.steps) {
    if (!("actions" in step) || step.actions === undefined) {
      continue;
    }

    const actions = step.actions
      .map((action, index) => ({ action, index }))
      .sort(
        (left, right) =>
          left.action.offsetSeconds - right.action.offsetSeconds ||
          left.index - right.index,
      );

    for (const { action } of actions) {
      if (!activeByLayerId.has(action.layerId)) {
        continue;
      }

      activeByLayerId.set(
        action.layerId,
        action.kind === "startLayer",
      );
    }
  }

  return [...activeByLayerId]
    .filter(([, active]) => active)
    .map(([layerId]) => layerId);
}

try {
  const plan = await createSectionJourneyPlan(
    rainyForestRequest,
    rainyForestOutline,
    sectionIndex,
  );
  const currentSection = rainyForestOutline.sections[sectionIndex];
  const previousSection = rainyForestOutline.sections[sectionIndex - 1];
  const nextSection = rainyForestOutline.sections[sectionIndex + 1];
  const narrationSteps = plan.steps.filter(
    (step) => step.kind === "narration",
  );
  const pauseSteps = plan.steps.filter((step) => step.kind === "pause");
  const eventSteps = plan.steps.filter((step) => step.kind === "event");
  const totalNarrationWordCount = narrationSteps.reduce(
    (total, step) => total + countWords(step.text),
    0,
  );
  const totalExplicitPauseSeconds = pauseSteps.reduce(
    (total, step) => total + step.durationSeconds,
    0,
  );
  const sceneStartLayerIds = plan.layers
    .filter((layer) => layer.start === "sceneStart")
    .map((layer) => layer.id);
  const triggeredLayerIds = plan.layers
    .filter((layer) => layer.start === "triggered")
    .map((layer) => layer.id);
  const triggeredLayersActiveAtEnd = inspectTriggeredLayers(plan);

  console.log("Section JourneyPlan generated successfully.");
  console.log("\nJourneyRequest:");
  console.log(JSON.stringify(rainyForestRequest, null, 2));
  console.log(`\nsectionIndex: ${sectionIndex}`);
  console.log("\ncurrentSection:");
  console.log(JSON.stringify(currentSection, null, 2));
  console.log("\npreviousSection:");
  console.log(previousSection === undefined
    ? "none"
    : JSON.stringify(previousSection, null, 2));
  console.log("\nnextSection:");
  console.log(nextSection === undefined
    ? "none"
    : JSON.stringify(nextSection, null, 2));
  console.log("\nJourneyPlan:");
  console.log(JSON.stringify(plan, null, 2));
  console.log(`\ntargetDurationSeconds: ${plan.targetDurationSeconds}`);
  console.log(`openingSeconds: ${plan.openingSeconds}`);
  console.log(`tailSeconds: ${plan.tailSeconds}`);
  console.log(`narrationBeatCount: ${narrationSteps.length}`);
  console.log(`totalNarrationWordCount: ${totalNarrationWordCount}`);
  console.log(`totalExplicitPauseSeconds: ${totalExplicitPauseSeconds}`);

  console.log("\nlayers:");
  for (const layer of plan.layers) {
    console.log(
      JSON.stringify({
        id: layer.id,
        soundId: layer.sound.soundId,
        start: layer.start,
      }),
    );
  }

  console.log("\nevents:");
  for (const event of eventSteps) {
    console.log(
      JSON.stringify({
        id: event.id,
        soundId: event.sound.soundId,
        beforeSeconds: event.beforeSeconds,
        afterSeconds: event.afterSeconds,
      }),
    );
  }

  console.log("\nactions:");
  for (let stepIndex = 0; stepIndex < plan.steps.length; stepIndex += 1) {
    const step = plan.steps[stepIndex];

    if (!("actions" in step) || step.actions === undefined) {
      continue;
    }

    for (const action of step.actions) {
      console.log(
        JSON.stringify({
          containingStepKind: step.kind,
          containingStepId: "id" in step ? step.id : undefined,
          containingStepIndex: stepIndex,
          kind: action.kind,
          layerId: action.layerId,
          offsetSeconds: action.offsetSeconds,
        }),
      );
    }
  }

  console.log(`\nsceneStartLayerIds: ${JSON.stringify(sceneStartLayerIds)}`);
  console.log(`triggeredLayerIds: ${JSON.stringify(triggeredLayerIds)}`);
  console.log(
    `triggeredLayersActiveAtEnd: ${JSON.stringify(triggeredLayersActiveAtEnd)}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
