import type { CcTraceMeta, HttpPair } from "../shared/types.js";

declare global {
  interface Window {
    ccTraceData?: HttpPair[];
    ccTraceMeta?: CcTraceMeta;
  }
}
