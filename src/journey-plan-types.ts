export type Direction =
  | "left"
  | "center"
  | "right";

export type Distance =
  | "near"
  | "mid"
  | "far";

export type Prominence =
  | "background"
  | "normal"
  | "foreground";

export type Entrance =
  | "immediate"
  | "gentle";

export type SoundIntent = {
  soundId: string;
  direction?: Direction;
  distance?: Distance;
  prominence?: Prominence;
};

export type DirectedLayer = {
  id: string;
  sound: SoundIntent;
  start: "sceneStart" | "triggered";
  entrance?: Entrance;
};

export type StartLayerCue = {
  kind: "startLayer";
  layerId: string;
  offsetSeconds: number;
};

export type StopLayerCue = {
  kind: "stopLayer";
  layerId: string;
  offsetSeconds: number;
};

export type LayerCue =
  | StartLayerCue
  | StopLayerCue;

export type JourneyNarration = {
  kind: "narration";
  id: string;
  text: string;
  actions?: LayerCue[];
};

export type JourneyPause = {
  kind: "pause";
  durationSeconds: number;
  actions?: LayerCue[];
};

export type JourneyEvent = {
  kind: "event";
  id: string;
  sound: SoundIntent;
  beforeSeconds: number;
  afterSeconds: number;
};

export type JourneyStep =
  | JourneyNarration
  | JourneyPause
  | JourneyEvent;

export type JourneyPlan = {
  targetDurationSeconds: number;
  openingSeconds: number;
  layers: DirectedLayer[];
  steps: JourneyStep[];
  tailSeconds: number;
};
