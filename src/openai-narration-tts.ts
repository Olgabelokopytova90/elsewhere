import { execFile } from "node:child_process";
import {
  mkdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import OpenAI from "openai";
import type { JourneyPlan } from "./journey-plan-types.js";
import { validateJourneyPlan } from "./journey-plan-validator.js";
import type { NarrationAssetMap } from "./journey-materializer.js";

const NARRATION_VOICE = "marin";

const NARRATION_INSTRUCTIONS =
  "Speak as a quiet cinematic storyteller: warm, intimate, natural, and restrained. Use a slightly slower pace than ordinary conversation, but do not sound sleepy. Let punctuation create natural pauses. Avoid exaggerated breathiness, ASMR, meditation-guide cadence, and announcer delivery. Speak the supplied text exactly; do not add, remove, paraphrase, or repeat words.";

function probeNarrationDuration(
  file: string,
  narrationId: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        file,
      ],
      { encoding: "utf8" },
      (error, stdout) => {
        if (error !== null) {
          reject(
            new Error(
              `Failed to probe narration duration: ${narrationId}`,
              { cause: error },
            ),
          );
          return;
        }

        const durationSeconds = Number(stdout.trim());

        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
          reject(
            new Error(
              `Narration duration must be finite and positive: ${narrationId}`,
            ),
          );
          return;
        }

        resolve(durationSeconds);
      },
    );
  });
}

export async function generateNarrationAssets(
  plan: JourneyPlan,
  outputDirectory: string,
): Promise<NarrationAssetMap> {
  validateJourneyPlan(plan);

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  try {
    await mkdir(outputDirectory, { recursive: true });
  } catch (cause) {
    throw new Error("Failed to create narration output directory", { cause });
  }

  const client = new OpenAI({ apiKey, maxRetries: 0 });
  const narrationSteps = plan.steps.filter(
    (step) => step.kind === "narration",
  );
  const narrationAssets = Object.create(null) as NarrationAssetMap;

  for (let index = 0; index < narrationSteps.length; index += 1) {
    const narration = narrationSteps[index];
    const number = String(index + 1).padStart(2, "0");
    const finalFile = join(outputDirectory, `narration-${number}.wav`);
    const temporaryFile = join(
      outputDirectory,
      `narration-${number}.tmp.wav`,
    );
    let bytes: Buffer;

    try {
      const response = await client.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice: NARRATION_VOICE,
        input: narration.text,
        instructions: NARRATION_INSTRUCTIONS,
        response_format: "wav",
      });
      bytes = Buffer.from(await response.arrayBuffer());
    } catch (cause) {
      throw new Error(
        `OpenAI narration TTS request failed: ${narration.id}`,
        { cause },
      );
    }

    if (bytes.length === 0) {
      throw new Error(
        `OpenAI narration TTS returned empty audio: ${narration.id}`,
      );
    }

    try {
      await writeFile(temporaryFile, bytes);
      const temporaryFileStats = await stat(temporaryFile);

      if (temporaryFileStats.size <= 0) {
        throw new Error("Written narration audio is empty");
      }
    } catch (cause) {
      await rm(temporaryFile, { force: true }).catch(() => undefined);
      throw new Error(`Failed to write narration audio: ${narration.id}`, {
        cause,
      });
    }

    let durationSeconds: number;

    try {
      durationSeconds = await probeNarrationDuration(
        temporaryFile,
        narration.id,
      );
      await rm(finalFile, { force: true });
      await rename(temporaryFile, finalFile);
    } catch (error) {
      await rm(temporaryFile, { force: true }).catch(() => undefined);

      if (
        error instanceof Error &&
        (error.message ===
          `Failed to probe narration duration: ${narration.id}` ||
          error.message ===
            `Narration duration must be finite and positive: ${narration.id}`)
      ) {
        throw error;
      }

      throw new Error(`Failed to write narration audio: ${narration.id}`, {
        cause: error,
      });
    }

    narrationAssets[narration.id] = {
      file: finalFile,
      durationSeconds,
      sourceText: narration.text,
    };
  }

  return narrationAssets;
}
