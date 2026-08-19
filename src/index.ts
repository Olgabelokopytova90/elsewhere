import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { basicScene } from "./timeline.js";

const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const outputPath = resolve(projectRoot, "output/basic-mix.wav");

await mkdir(dirname(outputPath), { recursive: true });

const inputArgs = basicScene.clips.flatMap((clip) => [
  "-i",
  resolve(projectRoot, clip.file),
]);

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

const delayedInputs = basicScene.clips
  .map((clip, index) => {
    const filters = ["aresample=48000"];

    if (clip.pan !== undefined) {
      filters.push(...createPanFilters(clip.pan));
    }

    filters.push(`adelay=${clip.startSeconds * 1000}:all=1`);
    return `[${index}:a]${filters.join(",")}[clip${index}]`;
  })
  .join(";");

const labels = basicScene.clips.map((_, index) => `[clip${index}]`).join("");
const filter = [
  delayedInputs,
  `${labels}amix=inputs=${basicScene.clips.length}:duration=longest:dropout_transition=0:normalize=0[mix]`,
].join(";");

const args = [
  "-y",
  ...inputArgs,
  "-filter_complex",
  filter,
  "-map",
  "[mix]",
  "-t",
  String(basicScene.durationSeconds),
  "-ar",
  "48000",
  "-ac",
  "2",
  "-c:a",
  "pcm_s24le",
  outputPath,
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
