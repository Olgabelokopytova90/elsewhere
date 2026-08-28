import type {
  JourneyOutline,
  JourneyRequest,
} from "./journey-outline-types.js";

export const rainyForestRequest: JourneyRequest = {
  destination: "rainy forest",
  durationSeconds: 300,
  mood: "calm exploratory",
};

export const rainyForestOutline: JourneyOutline = {
  targetDurationSeconds: 300,
  sections: [
    {
      id: "forest-threshold",
      purpose: "Arrival and sensory orientation",
      description: "Ease the listener into the rainy forest as an observer, allowing the unfamiliar space to settle around them. Establish a calm pace and invite attention toward the immediate shelter, moisture, distance, and living presence of the environment. Guidance is sparse, leaving room for unhurried environmental discovery.",
      targetDurationSeconds: 95,
    },
    {
      id: "deeper-path",
      purpose: "Exploration and expanding awareness",
      description: "Carry the listener farther into the forest with a gentle sense of forward curiosity. Perception broadens from nearby details to the larger terrain and its subtle shifts, suggesting that the rain is revealing rather than obscuring the landscape. Selective guidance encourages wandering attention without imposing a fixed story.",
      targetDurationSeconds: 125,
    },
    {
      id: "rain-clearing",
      purpose: "Rest, integration, and soft departure",
      description: "Let exploration resolve into a more settled relationship with the forest. The listener pauses within the environment, noticing its continuity and quiet resilience as the sense of movement relaxes. Leave generous space for presence and reflection, then guide a gradual emotional release rather than an abrupt ending.",
      targetDurationSeconds: 80,
    },
  ],
};
