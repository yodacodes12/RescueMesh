import React from 'react';
import { CircleHelp, Flame, HeartPulse, TriangleAlert, Waves } from 'lucide-react-native';
import type { EmergencyType } from '../mesh/core/types';

export const TYPE_LABEL: Record<EmergencyType, string> = {
  MEDICAL: 'Medical',
  TRAPPED: 'Trapped',
  FIRE: 'Fire',
  FLOOD: 'Flood',
  OTHER: 'Other',
};

export function TypeIcon({ type, size = 22, color }: { type: EmergencyType; size?: number; color: string }) {
  const p = { size, color, strokeWidth: 2.2 };
  switch (type) {
    case 'MEDICAL':
      return <HeartPulse {...p} />;
    case 'TRAPPED':
      return <TriangleAlert {...p} />;
    case 'FIRE':
      return <Flame {...p} />;
    case 'FLOOD':
      return <Waves {...p} />;
    default:
      return <CircleHelp {...p} />;
  }
}
