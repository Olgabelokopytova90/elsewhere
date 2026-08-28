export type JourneyRequest = {
  destination: string;
  durationSeconds: number;
  mood?: string;
};

export type JourneyOutlineSection = {
  id: string;
  purpose: string;
  description: string;
  targetDurationSeconds: number;
};

export type JourneyOutline = {
  targetDurationSeconds: number;
  sections: JourneyOutlineSection[];
};
