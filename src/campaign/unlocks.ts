/** Unlock state is DERIVED from campaign completions — never stored. */
import type { CampaignState, MissionId } from '../schema.ts';
import { MISSIONS } from './catalog.ts';
import type { Feature, Mission } from './types.ts';

export function missionIndex(id: MissionId): number {
  const m = MISSIONS.find((x) => x.id === id);
  return m ? m.index : -1;
}

export function isCompleted(campaign: CampaignState, id: MissionId): boolean {
  return campaign.completions[id] !== undefined;
}

/** A mission is playable when every earlier mission is completed. */
export function isMissionUnlocked(campaign: CampaignState, id: MissionId): boolean {
  const idx = missionIndex(id);
  if (idx < 0) return false;
  return MISSIONS.every((m) => m.index >= idx || isCompleted(campaign, m.id));
}

/** The frontier: first not-yet-completed mission (undefined = campaign done). */
export function frontierMission(campaign: CampaignState): Mission | undefined {
  return MISSIONS.find((m) => !isCompleted(campaign, m.id));
}

export function campaignComplete(campaign: CampaignState): boolean {
  return frontierMission(campaign) === undefined;
}

/** Features accumulate: available in mission M if introduced at or before M. */
export function featureAvailable(feature: Feature, missionId: MissionId): boolean {
  const idx = missionIndex(missionId);
  for (const m of MISSIONS) {
    if (m.index > idx) break;
    if (m.newFeatures.includes(feature)) return true;
  }
  return false;
}

/** Handbook concepts unlocked once their mission is reachable. */
export function conceptsUnlocked(campaign: CampaignState): Set<string> {
  const out = new Set<string>();
  for (const m of MISSIONS) {
    if (isMissionUnlocked(campaign, m.id)) for (const c of m.newConcepts) out.add(c);
  }
  return out;
}
