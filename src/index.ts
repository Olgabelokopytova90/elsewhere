import {
  forestAssetMetadata,
  forestScene,
} from "./forest-scene.js";
import { renderResolvedScene } from "./renderer.js";
import { compileScene } from "./scene-compiler.js";

const resolvedScene = compileScene(
  forestScene,
  forestAssetMetadata,
);

await renderResolvedScene(
  resolvedScene,
  "output/forest-directed-v4.wav",
);
