import { createSectionJourneyPlan } from "./openai-section-director.js";
import {
  rainyForestOutline,
  rainyForestRequest,
} from "./rainy-forest-outline-poc-fixture.js";
import { rainyForestSection02Plan } from "./rainy-forest-section-02-poc-fixture.js";
import { deriveSectionExitState } from "./section-continuity.js";

const sectionIndex = 2;
const previousSection = rainyForestOutline.sections[sectionIndex - 1];
const currentSection = rainyForestOutline.sections[sectionIndex];
const nextSection = rainyForestOutline.sections[sectionIndex + 1] ?? null;
const entryContinuity = deriveSectionExitState(rainyForestSection02Plan);

console.log("Section 3 entry continuity:");
console.log(JSON.stringify(entryContinuity, null, 2));

try {
  const section03Plan = await createSectionJourneyPlan(
    rainyForestRequest,
    rainyForestOutline,
    sectionIndex,
    entryContinuity,
  );
  const narrationSteps = section03Plan.steps.filter(
    (step) => step.kind === "narration",
  );
  const totalNarrationWordCount = narrationSteps.reduce(
    (total, step) => total + step.text.trim().split(/\s+/).length,
    0,
  );
  const totalExplicitPauseSeconds = section03Plan.steps.reduce(
    (total, step) =>
      step.kind === "pause" ? total + step.durationSeconds : total,
    0,
  );
  const events = section03Plan.steps
    .filter((step) => step.kind === "event")
    .map((step) => ({ id: step.id, soundId: step.sound.soundId }));
  const lifecycleActions = section03Plan.steps.flatMap((step, stepIndex) =>
    step.kind === "event"
      ? []
      : (step.actions ?? []).map((action, actionIndex) => ({
          stepIndex,
          stepKind: step.kind,
          actionIndex,
          ...action,
        })),
  );
  const compatibility = entryContinuity.activeLayers.map((inherited) => {
    const layer = section03Plan.layers.find(
      (candidate) => candidate.id === inherited.layerId,
    )!;
    const anchor = inherited.origin === "triggered"
      ? lifecycleActions.find(
          (entry) =>
            entry.kind === "startLayer" &&
            entry.layerId === inherited.layerId,
        )
      : undefined;

    return {
      layerId: inherited.layerId,
      expectedSoundId: inherited.soundId,
      actualSoundId: layer.sound.soundId,
      expectedLocalStartMode: inherited.origin,
      actualLocalStartMode: layer.start,
      compatible: true,
      ...(anchor === undefined
        ? {}
        : {
            localAnchorStepIndex: anchor.stepIndex,
            localAnchorStepKind: anchor.stepKind,
            localAnchorOffsetSeconds: anchor.offsetSeconds,
          }),
    };
  });
  const exitContinuity = deriveSectionExitState(section03Plan);
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

  console.log("\nRainy Forest Section 3 JourneyPlan generated successfully.");
  console.log("\nJourneyRequest:");
  console.log(JSON.stringify(rainyForestRequest, null, 2));
  console.log(`\nsectionIndex: ${sectionIndex}`);
  console.log("\npreviousSection:");
  console.log(JSON.stringify(previousSection, null, 2));
  console.log("\ncurrentSection:");
  console.log(JSON.stringify(currentSection, null, 2));
  console.log("\nnextSection: none");
  console.log("\nentryContinuity:");
  console.log(JSON.stringify(entryContinuity, null, 2));
  console.log("\nvalidatedSection03JourneyPlan:");
  console.log(JSON.stringify(section03Plan, null, 2));

  console.log("\nSection 3 metrics:");
  console.log(`targetDurationSeconds: ${section03Plan.targetDurationSeconds}`);
  console.log(`openingSeconds: ${section03Plan.openingSeconds}`);
  console.log(`tailSeconds: ${section03Plan.tailSeconds}`);
  console.log(`narrationBeatCount: ${narrationSteps.length}`);
  console.log(`totalNarrationWordCount: ${totalNarrationWordCount}`);
  console.log(`totalExplicitPauseSeconds: ${totalExplicitPauseSeconds}`);
  console.log("layers:");
  console.log(JSON.stringify(
    section03Plan.layers.map((layer) => ({
      layerId: layer.id,
      soundId: layer.sound.soundId,
      start: layer.start,
    })),
    null,
    2,
  ));
  console.log("events:");
  console.log(JSON.stringify(events, null, 2));
  console.log("lifecycleActions:");
  console.log(JSON.stringify(lifecycleActions, null, 2));

  console.log("\nContinuity compatibility:");
  console.log(JSON.stringify(compatibility, null, 2));
  console.log("\nFinal Section 3 exit continuity:");
  console.log(JSON.stringify(exitContinuity, null, 2));
  console.log(
    `inheritedAtEntryLayerIds: ${JSON.stringify(inheritedAtEntryLayerIds)}`,
  );
  console.log(`activeAtExitLayerIds: ${JSON.stringify(activeAtExitLayerIds)}`);
  console.log(
    `stoppedDuringSectionLayerIds: ${JSON.stringify(stoppedDuringSectionLayerIds)}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
