import { create } from 'zustand';
import type { FlightResult, RocketDesign } from './physics/types.ts';
import {
  campaignStateSchema,
  committedStateSchema,
  designsStateSchema,
  revisionsStateSchema,
  settingsSchema,
  type CampaignState,
  type CommittedState,
  type CompletionRecord,
  type DesignsState,
  type FlightRecord,
  type MissionId,
  type RevisionsState,
  type Settings,
} from './schema.ts';
import { loadSlice, saveSlice } from './persist.ts';
import { missionById } from './campaign/catalog.ts';

export interface PlaybackState {
  tSec: number;
  multiplier: number;
  paused: boolean;
}

export interface UiState {
  /** Blueprint part under selection (card ⇄ drawing binding). */
  selectedPartId: string | null;
  /** Open explain/handbook popover concept. */
  explainId: string | null;
  /** Equation variable binding under hover (cross-highlighting). */
  hoveredBinding: string | null;
}

interface DaedalusStore {
  // persisted
  campaign: CampaignState;
  designs: DesignsState;
  committed: CommittedState;
  revisions: RevisionsState;
  settings: Settings;
  // ephemeral
  preview: FlightResult | null;
  previewStale: boolean;
  playback: PlaybackState;
  ui: UiState;

  design(missionId: MissionId): RocketDesign;
  setDesign(missionId: MissionId, design: RocketDesign): void;
  resetToPreset(missionId: MissionId): void;
  setPreview(result: FlightResult | null, stale: boolean): void;
  /** Freeze the design + seed as a flight record (entering FRR → flight). */
  commitLaunch(missionId: MissionId, record: FlightRecord): void;
  completeMission(missionId: MissionId, completion: CompletionRecord): void;
  unlockSandbox(): void;
  setPlayback(p: Partial<PlaybackState>): void;
  setUi(p: Partial<UiState>): void;
}

/** REV letter for the next flight of a mission: A, B, C… */
export function revLetter(revisions: RevisionsState, missionId: MissionId): string {
  const n = revisions[missionId]?.length ?? 0;
  return String.fromCharCode(65 + Math.min(n, 25));
}

export const useStore = create<DaedalusStore>()((set, get) => ({
  campaign: loadSlice('campaign', campaignStateSchema, { completions: {} }),
  designs: loadSlice('designs', designsStateSchema, {}),
  committed: loadSlice('committed', committedStateSchema, {}),
  revisions: loadSlice('revisions', revisionsStateSchema, {}),
  settings: loadSlice('settings', settingsSchema, { sandboxUnlocked: false }),
  preview: null,
  previewStale: true,
  playback: { tSec: 0, multiplier: 1, paused: false },
  ui: { selectedPartId: null, explainId: null, hoveredBinding: null },

  design(missionId) {
    const d = get().designs[missionId];
    if (d) return d;
    const mission = missionById(missionId);
    if (!mission) throw new Error(`unknown mission: ${missionId}`);
    return mission.preset();
  },

  setDesign(missionId, design) {
    const designs = { ...get().designs, [missionId]: design };
    saveSlice('designs', designs);
    set({ designs, previewStale: true });
  },

  resetToPreset(missionId) {
    const mission = missionById(missionId);
    if (!mission) return;
    const designs = { ...get().designs, [missionId]: mission.preset() };
    saveSlice('designs', designs);
    set({ designs, previewStale: true });
  },

  setPreview(result, stale) {
    set({ preview: result, previewStale: stale });
  },

  commitLaunch(missionId, record) {
    const committed = { ...get().committed, [missionId]: record };
    const list = [...(get().revisions[missionId] ?? []), record];
    const revisions = { ...get().revisions, [missionId]: list };
    saveSlice('committed', committed);
    saveSlice('revisions', revisions);
    set({ committed, revisions });
  },

  completeMission(missionId, completion) {
    const campaign: CampaignState = {
      completions: { ...get().campaign.completions, [missionId]: completion },
    };
    saveSlice('campaign', campaign);
    set({ campaign });
  },

  unlockSandbox() {
    const settings = { ...get().settings, sandboxUnlocked: true };
    saveSlice('settings', settings);
    set({ settings });
  },

  setPlayback(p) {
    set({ playback: { ...get().playback, ...p } });
  },

  setUi(p) {
    set({ ui: { ...get().ui, ...p } });
  },
}));
