import OpenAI from "openai";
import type { JourneyPlan } from "./journey-plan-types.js";
import { validateJourneyPlan } from "./journey-plan-validator.js";

const DIRECTOR_INSTRUCTIONS = `You are the Scene Director for Elsewhere, an immersive cinematic audio experience.

Your job is to direct what the listener experiences, not to act as an audio engineer.

Directing principles:
- Use cinematic, sensory narration.
- Narration should help the listener construct the location through concrete sensory description and changes in the environment.
- Leave meaningful narrator-free pauses.
- Let environmental sound carry parts of the experience without narration.
- Avoid conventional meditation language.
- Do not tell the listener to relax or clear their mind.
- Do not give breathing instructions.
- Do not tell the listener what to focus on or comment on their attention.
- Do not use language about directing, holding, clearing, controlling, or shifting the listener's attention.
- Redirect perception indirectly by describing what becomes visible, audible, distant, close, dark, wet, still, or moving.
- Do not verbally announce every sound immediately before it occurs.
- Narration should not run continuously.
- Environmental ambience should remain important to the experience.

Night Ocean POC policy:
- Target approximately 45 seconds.
- Use 3 or 4 narration beats.
- The environment must establish the location before the first narration. Allow the ocean to play alone for 2–4 seconds before the narrator begins.
- Use ocean-night-calm as persistent ambience starting at sceneStart, and never stop it.
- Use sand-footsteps-soft as a triggered layer.
- Start footsteps with a startLayer action in the first pause after the first narration.
- Keep footsteps active for part of the journey, then stop them later with a stopLayer action.
- Prefer stopping footsteps during a narrator-free pause, before the final environmental ending.
- Footsteps must be stopped before tailSeconds begins and must not remain active during the tail.
- Include exactly one distant gull event later in the scene.
- Include meaningful narrator-free pauses.
- End with a short ocean-only tail: the persistent ocean remains active and triggered footsteps have already stopped.
- Use only the semantic sound IDs allowed by the response schema.
- Do not emit physical file paths.
- Do not emit renderer or DSP fields.
- Do not emit absolute timestamps.

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
      minimum: 2,
      maximum: 4,
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
    soundIntent: {
      type: "object",
      additionalProperties: false,
      properties: {
        soundId: {
          type: "string",
          enum: [
            "ocean-night-calm",
            "sand-footsteps-soft",
            "gull-distant-single",
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
        sound: { $ref: "#/$defs/soundIntent" },
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
        sound: { $ref: "#/$defs/soundIntent" },
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

export async function createJourneyPlan(
  request: string,
): Promise<JourneyPlan> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey === undefined || apiKey.length === 0) {
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
      instructions: DIRECTOR_INSTRUCTIONS,
      input: request,
      text: {
        format: {
          type: "json_schema",
          name: "journey_plan",
          strict: true,
          schema: JOURNEY_PLAN_SCHEMA,
        },
      },
    });
  } catch (cause) {
    throw new Error("OpenAI AI Director request failed", { cause });
  }

  if (response.status !== "completed") {
    throw new Error("OpenAI AI Director returned an incomplete response");
  }

  for (const output of response.output) {
    if (output.type !== "message") {
      continue;
    }

    for (const content of output.content) {
      if (content.type === "refusal") {
        throw new Error(
          `OpenAI AI Director refused the request: ${content.refusal}`,
        );
      }
    }
  }

  if (response.output_text.length === 0) {
    throw new Error("OpenAI AI Director returned no structured output");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(response.output_text);
  } catch (cause) {
    throw new Error(
      "OpenAI AI Director returned malformed structured output",
      { cause },
    );
  }

  try {
    return validateJourneyPlan(parsed);
  } catch (cause) {
    throw new Error("OpenAI AI Director returned an invalid JourneyPlan", {
      cause,
    });
  }
}
