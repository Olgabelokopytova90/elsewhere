import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AudioClip, GainPoint, ResolvedScene } from "./audio-types.js";

const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

function createPanFilters(pan: number): string[] {
  if (!Number.isFinite(pan) || pan < -1 || pan > 1) {
    throw new RangeError(`Pan must be between -1 and 1, received ${pan}`);
  }

  const leftGain = Math.cos(((pan + 1) * Math.PI) / 4);
  const rightGain = Math.sin(((pan + 1) * Math.PI) / 4);

  return [
    "pan=mono|c0=0.5*c0+0.5*c1",
    `pan=stereo|c0=${leftGain}*c0|c1=${rightGain}*c0`,
  ];
}

function createGainFilter(gain: number): string {
  if (!Number.isFinite(gain) || gain < 0) {
    throw new RangeError(
      `Gain must be a finite number greater than or equal to 0, received ${gain}`,
    );
  }

  return `volume=${gain}`;
}

function createGainEnvelopeFilter(gainEnvelope: GainPoint[]): string {
  if (gainEnvelope.length < 2 || gainEnvelope[0].atSeconds !== 0) {
    throw new RangeError("Gain envelope must start at 0 seconds and contain two points");
  }

  for (let index = 0; index < gainEnvelope.length; index += 1) {
    const point = gainEnvelope[index];

    if (
      !Number.isFinite(point.atSeconds) ||
      point.atSeconds < 0 ||
      !Number.isFinite(point.gain) ||
      point.gain < 0 ||
      (index > 0 && point.atSeconds <= gainEnvelope[index - 1].atSeconds)
    ) {
      throw new RangeError("Gain envelope points must have increasing times and non-negative gains");
    }
  }

  let expression = String(gainEnvelope[gainEnvelope.length - 1].gain);

  for (let index = gainEnvelope.length - 1; index > 0; index -= 1) {
    const previous = gainEnvelope[index - 1];
    const current = gainEnvelope[index];
    const gainChange = current.gain - previous.gain;
    const duration = current.atSeconds - previous.atSeconds;
    const linearGain = `${previous.gain}+(${gainChange})*(t-${previous.atSeconds})/${duration}`;

    expression = `if(lt(t,${current.atSeconds}),${linearGain},${expression})`;
  }

  return `volume='${expression}':eval=frame`;
}

function createFadeInFilter(fadeInSeconds: number): string {
  if (!Number.isFinite(fadeInSeconds) || fadeInSeconds <= 0) {
    throw new RangeError(
      `Fade-in duration must be a finite number greater than 0, received ${fadeInSeconds}`,
    );
  }

  return `afade=t=in:st=0:d=${fadeInSeconds}`;
}

function createLowpassFilter(lowpassHz: number): string {
  if (!Number.isFinite(lowpassHz) || lowpassHz <= 0) {
    throw new RangeError(
      `Low-pass frequency must be a finite number greater than 0, received ${lowpassHz}`,
    );
  }

  return `lowpass=f=${lowpassHz}`;
}

export async function renderResolvedScene(
  scene: ResolvedScene,
  outputPath: string,
): Promise<void> {
  const resolvedOutputPath = resolve(projectRoot, outputPath);

  await mkdir(dirname(resolvedOutputPath), { recursive: true });

  const inputArgs = scene.clips.flatMap((clip) => [
    "-i",
    resolve(projectRoot, clip.file),
  ]);

  const delayedInputs = scene.clips
    .map((clip: AudioClip, index) => {
      const filters = ["aresample=48000"];

      if (clip.gain !== undefined && clip.gainEnvelope !== undefined) {
        throw new RangeError("A clip cannot define both gain and gainEnvelope");
      }

      if (clip.gain !== undefined) {
        filters.push(createGainFilter(clip.gain));
      }

      if (clip.gainEnvelope !== undefined) {
        filters.push(createGainEnvelopeFilter(clip.gainEnvelope));
      }

      if (clip.lowpassHz !== undefined) {
        filters.push(createLowpassFilter(clip.lowpassHz));
      }

      if (clip.fadeInSeconds !== undefined) {
        filters.push(createFadeInFilter(clip.fadeInSeconds));
      }

      if (clip.pan !== undefined) {
        filters.push(...createPanFilters(clip.pan));
      }

      filters.push(`adelay=${clip.startSeconds * 1000}:all=1`);
      return `[${index}:a]${filters.join(",")}[clip${index}]`;
    })
    .join(";");

  const labels = scene.clips.map((_, index) => `[clip${index}]`).join("");
  const filter = [
    delayedInputs,
    `${labels}amix=inputs=${scene.clips.length}:duration=longest:dropout_transition=0:normalize=0[mix]`,
  ].join(";");

  const args = [
    "-y",
    ...inputArgs,
    "-filter_complex",
    filter,
    "-map",
    "[mix]",
    "-t",
    String(scene.durationSeconds),
    "-ar",
    "48000",
    "-ac",
    "2",
    "-c:a",
    "pcm_s24le",
    resolvedOutputPath,
  ];

  const ffmpeg = spawn("ffmpeg", args, { stdio: "inherit" });

  await new Promise<void>((resolve, reject) => {
    ffmpeg.once("error", reject);
    ffmpeg.once("close", (code) => {
      code === 0
        ? resolve()
        : reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });
}
