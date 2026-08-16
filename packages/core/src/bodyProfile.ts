import type { BodyProfile } from './types.js';

export interface TorsoWidths {
  chest: number;
  waist: number;
  hip: number;
}

export function torsoWidths(baseW: number, profile: BodyProfile): TorsoWidths {
  if (profile === 'female') {
    return { chest: baseW * 1.16, waist: baseW * 1.06, hip: baseW * 1.32 };
  }
  return { chest: baseW * 1.06, waist: baseW * 0.96, hip: baseW * 1.2 };
}
