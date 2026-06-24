// ============================================================================
// inference.ts — Shared CLI factory for the in-process InferenceService.
// ============================================================================

import { InferenceService } from "../server/index.js";

export interface InferenceHandle {
  inference: InferenceService;
  shutdown: () => void;
}

export function createInference(): InferenceHandle {
  const inference = InferenceService.create();
  return {
    inference,
    shutdown: () => inference.shutdown(),
  };
}