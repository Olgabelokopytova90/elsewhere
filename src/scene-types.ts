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
  fadeOutSeconds?: number;
  lowpassHz?: number;
};

export type StartLayerAction = {
  kind: "startLayer";
  layerId: string;
  offsetSeconds: number;
};

export type StopLayerAction = {
  kind: "stopLayer";
  layerId: string;
  offsetSeconds: number;
};

export type LayerAction =
  | StartLayerAction
  | StopLayerAction;

export type NarrationStep = {
  kind: "narration";
  id: string;
  file: string;
  gain: number;
  focus: "narration";
  actions?: LayerAction[];
};

export type PauseStep = {
  kind: "pause";
  durationSeconds: number;
  focus: "environment";
  actions?: LayerAction[];
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
