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

export async function createSectionJourneyPlan(
  request: JourneyRequest,
  outline: JourneyOutline,
  sectionIndex: number,
): Promise<JourneyPlan> {
  validateJourneyRequest(request);
  validateJourneyOutline(outline);

  if (outline.targetDurationSeconds !== request.durationSeconds) {
    throw new Error(
      "JourneyOutline target duration does not match JourneyRequest",
    );
  }

  if (
    !Number.isInteger(sectionIndex) ||
    sectionIndex < 0 ||
    sectionIndex >= outline.sections.length
  ) {
    throw new RangeError("sectionIndex must identify an outline section");
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
      instructions: SECTION_DIRECTOR_INSTRUCTIONS,
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
  return plan;
}
