import { renderResolvedScene } from "./renderer.js";
import { basicScene } from "./timeline.js";

await renderResolvedScene(basicScene, "output/forest-directed-v4.wav");
