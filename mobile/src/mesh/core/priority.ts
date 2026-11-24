/**
 * Priority-aware forwarding. Same formula as backend priority_service.py:
 *
 *   score = BASE_WEIGHT[priority] + min(ageMinutes * 2, 600)
 *
 * Higher score is forwarded first. Age is added so LOW requests are not
 * starved: after ~5h a LOW request is forwarded like a fresh HIGH one, but it
 * can never overtake a fresh CRITICAL request.
 */
import type { EmergencyType, Priority, SOSMessage } from './types';

export const BASE_WEIGHT: Record<Priority, number> = {
  CRITICAL: 1000,
  HIGH: 700,
  MEDIUM: 400,
  LOW: 100,
};
const AGE_WEIGHT_PER_MINUTE = 2;
const AGE_CAP = 600;

export function priorityScore(msg: Pick<SOSMessage, 'priority' | 'created_at'>, now: number = Date.now()): number {
  const ageMin = Math.max(0, (now - Date.parse(msg.created_at)) / 60_000);
  return BASE_WEIGHT[msg.priority] + Math.min(ageMin * AGE_WEIGHT_PER_MINUTE, AGE_CAP);
}

/** Default priority suggested in the Create SOS form (user can change it). */
export const SUGGESTED_PRIORITY: Record<EmergencyType, Priority> = {
  MEDICAL: 'CRITICAL',
  TRAPPED: 'CRITICAL',
  FIRE: 'HIGH',
  FLOOD: 'HIGH',
  OTHER: 'MEDIUM',
};

export const PRIORITY_DESCRIPTION: Record<Priority, string> = {
  CRITICAL: 'Life-threatening: medical emergency or people trapped',
  HIGH: 'Immediate rescue or evacuation needed',
  MEDIUM: 'Food, water or essential supplies',
  LOW: 'General assistance, not urgent',
};
