export type Focus = "narration" | "environment";

export type AssetMetadata = Record<
  string,
  {
    durationSeconds: number;
  }
>;

export type LayerStart =
  | { kind: "sceneStart" }
  | { kind: "triggered" };

export type ContinuousLayer = {
  id: string;
  file: string;
  start: LayerStart;
  gainByFocus: {
    narration: number;
    environment: number;
  };
  pan?: number;
  fadeInSeconds?: number;
  lowpassHz?: number;
};

export type StartLayerAction = {
  kind: "startLayer";
  layerId: string;
  offsetSeconds: number;
};

export type NarrationStep = {
  kind: "narration";
  id: string;
  file: string;
  gain: number;
  focus: "narration";
  actions?: StartLayerAction[];
};

export type PauseStep = {
  kind: "pause";
  durationSeconds: number;
  focus: "environment";
  actions?: StartLayerAction[];
};

export type EventStep = {
  kind: "event";
  id: string;
  file: string;
  beforeSeconds: number;
  afterSeconds: number;
  focus: "environment";
  gain?: number;
  pan?: number;
  fadeInSeconds?: number;
  lowpassHz?: number;
};

export type SceneStep =
  | NarrationStep
  | PauseStep
  | EventStep;

export type SemanticScene = {
  openingSeconds: number;
  focusRampSeconds: number;
  layers: ContinuousLayer[];
  steps: SceneStep[];
  tailSeconds: number;
};
