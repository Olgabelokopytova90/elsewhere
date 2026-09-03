import OpenAI from "openai";
import type {
  JourneyOutline,
  JourneyRequest,
} from "./journey-outline-types.js";
import {
  validateJourneyOutline,
  validateJourneyRequest,
} from "./journey-outline-validator.js";
import type { JourneyPlan } from "./journey-plan-types.js";
import { validateJourneyPlan } from "./journey-plan-validator.js";
import type { SectionContinuity } from "./section-continuity.js";
import { validateSectionContinuity } from "./section-continuity.js";

const SECTION_DIRECTOR_INSTRUCTIONS = `You are the Section Director for Elsewhere, an immersive cinematic audio experience.

Create one detailed semantic JourneyPlan for the selected section of an accepted longer JourneyOutline. Direct what the listener experiences; do not act as an audio engineer.

Section principles:
- Preserve the selected section target duration exactly in targetDurationSeconds.
- Use the complete outline and adjacent section context to make this section part of a continuing journey.
- This first-section POC must establish the rainy forest, create a real sense of arrival, begin movement or exploration, and point naturally toward the deeper path.
- Do not emotionally resolve or summarize the complete journey.
- Do not fade or stop the foundational environment at the end.
- Use rainy-forest-ambience as a continuous sceneStart layer.
- rain-canopy-steady may be an additional sceneStart layer if useful.
- wet-trail-footsteps may only be a triggered layer. Start it later with a startLayer action during a narrator-free pause; it may remain active at section end.
- Prefer zero or one subtle event using water-drip-near or bird-distant-single. Avoid event spam.
- Use only sound IDs allowed by the response schema.
- Do not emit files, physical assets, DSP values, renderer settings, or absolute timestamps.

Pacing principles for this 95-second first-section POC:
- Use openingSeconds from 5 through 8 so the environment arrives before narration.
- Prefer three concise narration beats; two to four is acceptable.
- Aim for approximately 45 to 60 total narration words.
- Use at least two meaningful narrator-free pauses, preferably around 8 to 18 seconds each.
- Aim for approximately 35 to 50 seconds of explicit pause time overall.
- Prefer tailSeconds around 3 to 6 as a local environmental transition buffer, not a journey conclusion.
- Avoid one-second connective pauses, micro-step proliferation, and dozens of small steps.
- Additional section duration should primarily create environmental experience, not proportionally more narration.
- Narration establishes or redirects sensory perception, yields, and returns only when the spatial or perceptual situation meaningfully changes.

Narration style:
- Write cinematic, restrained, sensory, natural, spatial, and selective narration.
- Use concrete sensory description and let the environment carry the experience.
- Do not use generic meditation language or instructions.
- Do not write relax, take a breath, breathe, clear your mind, focus your attention, bring your attention, become aware, let go, release, or emotional-release instructions.
- Do not discuss the listener's attention, awareness, or mindfulness in user-facing narration.
- Do not literally announce every sound before it occurs.

The JSON Schema owns the response structure.`;

const MIDDLE_SECTION_DIRECTOR_INSTRUCTIONS = `You are the Section Director for Elsewhere, an immersive cinematic audio experience.

Create one detailed semantic JourneyPlan for the selected middle section of an accepted longer JourneyOutline. Direct what the listener experiences; do not act as an audio engineer.

Continuity principles:
- Entry continuity lists semantic layers already present from the previous section.
- Redeclare every inherited layer using its exact layerId and soundId. Never rename or replace an inherited identity.
- An inherited layer with origin sceneStart must be redeclared with start sceneStart. Do not add startLayer or stopLayer actions for it.
- An inherited layer with origin triggered must be redeclared with start triggered. Give it exactly one technical local startLayer anchor with offsetSeconds 0 in the earliest narration or pause step.
- That technical anchor keeps this section independently valid; it is not a journey-level restart.
- An inherited triggered layer may later be stopped if the listener physically stops or the terrain meaningfully changes. Do not stop it merely because the section ends.
- The future journey assembler, not you, will handle physical source continuation and technical transitions.

Section principles:
- Preserve the selected section target duration exactly in targetDurationSeconds.
- This is a middle section. The listener is already inside the rainy forest; do not narratively re-arrive or re-establish it as newly appearing.
- Deepen movement into the forest, broaden spatial perception, reveal changing terrain or rain behavior, and build gentle forward curiosity.
- Progress toward the later rain-clearing section without emotionally resolving or concluding the complete journey.
- Do not fade or stop foundational sceneStart environment layers.
- Use only sound IDs allowed by the response schema.
- Prefer zero or one significant event using water-drip-near or bird-distant-single. Avoid event spam.
- Do not emit files, physical assets, DSP values, renderer settings, source offsets, crossfades, or absolute timestamps.

Pacing principles for this 125-second middle-section POC:
- Use approximately 4 through 7 openingSeconds as section-local narrator-free environmental time. The world is already active.
- Prefer three or four concise narration beats totaling approximately 60 to 80 words. These are creative targets, not structural invariants.
- Narration must remain a minority of the section.
- Use approximately 55 to 70 seconds of explicit narrator-free pause time across three or four substantial environmental intervals.
- Prefer tailSeconds around 3 through 6 as a middle-section transition, not a journey conclusion.
- Avoid micro-pauses, excessive step counts, and continuous audiobook-style prose.
- Additional duration should primarily create environmental experience rather than proportionally more narration.

Narration style:
- Write cinematic, restrained, sensory, natural, spatial, and selective narration.
- Redirect perception indirectly through concrete environmental description and let the environment carry the experience.
- Do not use generic meditation language or instructions.
- Do not write relax, take a breath, breathe, clear your mind, focus your attention, bring your attention, become aware, awareness, mindfulness, let go, release, or emotional-release instructions.
- Do not comment explicitly on the listener's attention.
- Do not literally announce every sound before it occurs.

The JSON Schema owns the response structure.`;

const FINAL_SECTION_DIRECTOR_INSTRUCTIONS = `You are the Section Director for Elsewhere, an immersive cinematic audio experience.

Create one detailed semantic JourneyPlan for the selected final section of an accepted longer JourneyOutline. Direct what the listener experiences; do not act as an audio engineer.

Continuity principles:
- Entry continuity lists semantic layers already present from the previous section.
- Redeclare every inherited layer using its exact layerId and soundId. Never rename or replace an inherited identity.
- An inherited layer with origin sceneStart must be redeclared with start sceneStart. Do not add startLayer or stopLayer actions for it.
- An inherited layer with origin triggered must be redeclared with start triggered. Give it exactly one technical local startLayer anchor with offsetSeconds 0 in the earliest narration or pause step.
- That technical anchor keeps this section independently valid; it is not a journey-level restart.
- The future journey assembler, not you, will handle physical source continuation and technical transitions.

Final-section principles:
- Preserve the selected section target duration exactly in targetDurationSeconds. Do not compensate for drift in earlier sections.
- The listener is already deep inside the rainy forest. Do not reintroduce the forest, narrate entering it, describe rain as newly starting, or describe inherited footsteps as newly appearing.
- Let the existing environment and footsteps continue as rain, terrain, space, or light gradually open and soften.
- Let movement become less central as the listener reaches or pauses in a lighter or clearer space.
- Create complete journey closure through spatial, sensory, cinematic changes and environmental stillness.
- Do not translate outline concepts such as reflection or emotional release into user-facing therapeutic, motivational, meditative, or instructional language.
- Do not fade or stop foundational sceneStart environment layers. They may remain active through the final tail.
- An inherited triggered footsteps layer may later be stopped if that corresponds to a meaningful physical transition such as reaching the clearing or pausing movement. Strongly prefer this when it naturally supports the ending, but do not stop it merely because the section ends.
- Use only sound IDs allowed by the response schema.
- Prefer zero or one event using water-drip-near or bird-distant-single. A quiet final section with no event is welcome.
- Do not emit files, physical assets, DSP values, renderer settings, source offsets, crossfades, or absolute timestamps.

Pacing principles for this 80-second final-section POC:
- Use approximately 3 through 5 openingSeconds as section-local narrator-free environmental time. The world is already active.
- Prefer three concise narration beats; two or three is acceptable.
- Aim for approximately 45 to 55 total narration words. These are creative targets, not structural invariants.
- Narration must remain a minority of the section.
- Use approximately 38 to 45 seconds of explicit narrator-free pause time across two or three substantial environmental intervals.
- Use approximately 6 through 9 tailSeconds so the environmental world remains after the final narration.
- Do not fill the tail with narration.
- Avoid micro-pauses, excessive step counts, and continuous audiobook-style prose.

Narration style:
- Write cinematic, restrained, sensory, natural, spatial, and selective narration.
- Redirect perception indirectly through concrete changes in rain, space, terrain, light, and movement.
- Do not write relax, take a breath, breathe, clear your mind, focus your attention, bring your attention, become aware, awareness, mindfulness, let go, release, release emotion, carry this feeling with you, or emotional-release instructions.
- Do not tell the listener how to feel, what to reflect on, or what to release.
- Do not end with generic declarations that the listener feels at peace or that the journey is complete.
- Let the final physical image and environmental tail carry the ending.
- Do not literally announce every sound before it occurs.

The JSON Schema owns the response structure.`;

const JOURNEY_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    targetDurationSeconds: {
      type: "number",
      exclusiveMinimum: 0,
    },
    openingSeconds: {
      type: "number",
      minimum: 5,
      maximum: 8,
    },
    layers: {
      type: "array",
      items: { $ref: "#/$defs/layer" },
    },
    steps: {
      type: "array",
      items: {
        anyOf: [
          { $ref: "#/$defs/narration" },
          { $ref: "#/$defs/pause" },
          { $ref: "#/$defs/event" },
        ],
      },
    },
    tailSeconds: {
      type: "number",
      minimum: 0,
    },
  },
  required: [
    "targetDurationSeconds",
    "openingSeconds",
    "layers",
    "steps",
    "tailSeconds",
  ],
  $defs: {
    layerSoundIntent: {
      type: "object",
      additionalProperties: false,
      properties: {
        soundId: {
          type: "string",
          enum: [
            "rainy-forest-ambience",
            "rain-canopy-steady",
            "wet-trail-footsteps",
          ],
        },
        direction: {
          type: "string",
          enum: ["left", "center", "right"],
        },
        distance: {
          type: "string",
          enum: ["near", "mid", "far"],
        },
        prominence: {
          type: "string",
          enum: ["background", "normal", "foreground"],
        },
      },
      required: ["soundId", "direction", "distance", "prominence"],
    },
    eventSoundIntent: {
      type: "object",
      additionalProperties: false,
      properties: {
        soundId: {
          type: "string",
          enum: ["water-drip-near", "bird-distant-single"],
        },
        direction: {
          type: "string",
          enum: ["left", "center", "right"],
        },
        distance: {
          type: "string",
          enum: ["near", "mid", "far"],
        },
        prominence: {
          type: "string",
          enum: ["background", "normal", "foreground"],
        },
      },
      required: ["soundId", "direction", "distance", "prominence"],
    },
    action: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: {
          type: "string",
          enum: ["startLayer", "stopLayer"],
        },
        layerId: { type: "string" },
        offsetSeconds: {
          type: "number",
          minimum: 0,
        },
      },
      required: ["kind", "layerId", "offsetSeconds"],
    },
    layer: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        sound: { $ref: "#/$defs/layerSoundIntent" },
        start: {
          type: "string",
          enum: ["sceneStart", "triggered"],
        },
        entrance: {
          type: "string",
          enum: ["immediate", "gentle"],
        },
      },
      required: ["id", "sound", "start", "entrance"],
    },
    narration: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: {
          type: "string",
          enum: ["narration"],
        },
        id: { type: "string" },
        text: { type: "string" },
        actions: {
          type: "array",
          items: { $ref: "#/$defs/action" },
        },
      },
      required: ["kind", "id", "text", "actions"],
    },
    pause: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: {
          type: "string",
          enum: ["pause"],
        },
        durationSeconds: {
          type: "number",
          minimum: 0,
        },
        actions: {
          type: "array",
          items: { $ref: "#/$defs/action" },
        },
      },
      required: ["kind", "durationSeconds", "actions"],
    },
    event: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: {
          type: "string",
          enum: ["event"],
        },
        id: { type: "string" },
        sound: { $ref: "#/$defs/eventSoundIntent" },
        beforeSeconds: {
          type: "number",
          minimum: 0,
        },
        afterSeconds: {
          type: "number",
          minimum: 0,
        },
      },
      required: [
        "kind",
        "id",
        "sound",
        "beforeSeconds",
        "afterSeconds",
      ],
    },
  },
} as const;

function validateRainyForestPolicy(plan: JourneyPlan): void {
  const foundation = plan.layers.find(
    (layer) => layer.sound.soundId === "rainy-forest-ambience",
  );

  if (foundation === undefined || foundation.start !== "sceneStart") {
    throw new Error(
      "OpenAI Section Director must establish rainy-forest-ambience at sceneStart",
    );
  }

  for (const layer of plan.layers) {
    if (
      layer.sound.soundId === "rain-canopy-steady" &&
      layer.start !== "sceneStart"
    ) {
      throw new Error(
        "OpenAI Section Director must start rain-canopy-steady at sceneStart",
      );
    }

    if (
      layer.sound.soundId === "wet-trail-footsteps" &&
      layer.start !== "triggered"
    ) {
      throw new Error(
        "OpenAI Section Director must use wet-trail-footsteps as a triggered layer",
      );
    }
  }
}

function validateContinuityCompatibility(
  plan: JourneyPlan,
  continuity: SectionContinuity,
): void {
  const earliestActionStepIndex = plan.steps.findIndex(
    (step) => step.kind === "narration" || step.kind === "pause",
  );

  for (const inherited of continuity.activeLayers) {
    const layer = plan.layers.find(
      (candidate) => candidate.id === inherited.layerId,
    );

    if (layer === undefined) {
      throw new Error(
        `OpenAI Section Director omitted inherited layer: ${inherited.layerId}`,
      );
    }

    if (layer.sound.soundId !== inherited.soundId) {
      throw new Error(
        `OpenAI Section Director changed inherited soundId for layer: ${inherited.layerId}`,
      );
    }

    if (layer.start !== inherited.origin) {
      throw new Error(
        `OpenAI Section Director used an incompatible start mode for inherited layer: ${inherited.layerId}`,
      );
    }

    if (inherited.origin !== "triggered") {
      continue;
    }

    const localAnchor = plan.steps.flatMap((step, stepIndex) =>
      step.kind === "event"
        ? []
        : (step.actions ?? [])
            .filter(
              (action) =>
                action.kind === "startLayer" &&
                action.layerId === inherited.layerId,
            )
            .map((action) => ({ action, stepIndex })),
    )[0];

    if (
      localAnchor === undefined ||
      localAnchor.stepIndex !== earliestActionStepIndex ||
      localAnchor.action.offsetSeconds !== 0
    ) {
      throw new Error(
        `OpenAI Section Director must anchor inherited triggered layer at offset 0 in the earliest narration or pause step: ${inherited.layerId}`,
      );
    }
  }
}

export async function createSectionJourneyPlan(
  request: JourneyRequest,
  outline: JourneyOutline,
  sectionIndex: number,
  continuity?: SectionContinuity,
): Promise<JourneyPlan> {
  validateJourneyRequest(request);
  validateJourneyOutline(outline);

  if (
    !Number.isInteger(sectionIndex) ||
    sectionIndex < 0 ||
    sectionIndex >= outline.sections.length
  ) {
    throw new RangeError("sectionIndex must identify an outline section");
  }

  let validatedContinuity: SectionContinuity | undefined;

  if (continuity !== undefined) {
    validatedContinuity = validateSectionContinuity(continuity);
  }

  if (sectionIndex === 0) {
    if (
      validatedContinuity !== undefined &&
      validatedContinuity.activeLayers.length > 0
    ) {
      throw new Error("First section continuity must be empty");
    }
  } else if (validatedContinuity === undefined) {
    throw new Error("SectionContinuity is required for non-first sections");
  }

  if (outline.targetDurationSeconds !== request.durationSeconds) {
    throw new Error(
      "JourneyOutline target duration does not match JourneyRequest",
    );
  }

  const currentSection = outline.sections[sectionIndex];
  const previousSection = outline.sections[sectionIndex - 1] ?? null;
  const nextSection = outline.sections[sectionIndex + 1] ?? null;
  const sectionContext = {
    request,
    outline,
    sectionIndex,
    isFirstSection: sectionIndex === 0,
    isFinalSection: sectionIndex === outline.sections.length - 1,
    previousSection,
    currentSection,
    nextSection,
    ...(validatedContinuity === undefined
      ? {}
      : { entryContinuity: validatedContinuity }),
  };
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  const openai = new OpenAI({ apiKey, maxRetries: 0 });
  let response;

  try {
    response = await openai.responses.create({
      model: "gpt-5.6-terra",
      reasoning: {
        effort: "low",
      },
      instructions:
        sectionIndex === 0
          ? SECTION_DIRECTOR_INSTRUCTIONS
          : sectionIndex === outline.sections.length - 1
            ? FINAL_SECTION_DIRECTOR_INSTRUCTIONS
            : MIDDLE_SECTION_DIRECTOR_INSTRUCTIONS,
      input: `Section context:\n${JSON.stringify(sectionContext)}`,
      text: {
        format: {
          type: "json_schema",
          name: "section_journey_plan",
          strict: true,
          schema: JOURNEY_PLAN_SCHEMA,
        },
      },
    });
  } catch (cause) {
    throw new Error("OpenAI Section Director request failed", { cause });
  }

  if (response.status !== "completed") {
    throw new Error("OpenAI Section Director returned an incomplete response");
  }

  for (const output of response.output) {
    if (output.type !== "message") {
      continue;
    }

    for (const content of output.content) {
      if (content.type === "refusal") {
        throw new Error(
          `OpenAI Section Director refused the request: ${content.refusal}`,
        );
      }
    }
  }

  if (response.output_text.length === 0) {
    throw new Error("OpenAI Section Director returned no structured output");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(response.output_text);
  } catch (cause) {
    throw new Error(
      "OpenAI Section Director returned malformed structured output",
      { cause },
    );
  }

  let plan: JourneyPlan;

  try {
    plan = validateJourneyPlan(parsed);
  } catch (cause) {
    throw new Error("OpenAI Section Director returned an invalid JourneyPlan", {
      cause,
    });
  }

  if (plan.targetDurationSeconds !== currentSection.targetDurationSeconds) {
    throw new Error(
      "OpenAI Section Director target duration does not match the outline section",
    );
  }

  validateRainyForestPolicy(plan);

  if (validatedContinuity !== undefined) {
    validateContinuityCompatibility(plan, validatedContinuity);
  }

  return plan;
}
