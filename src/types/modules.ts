import type { ChineseData } from '@/lib/data';

export type ModuleId =
  | 'basic_definition'
  | 'audio_speech'
  | 'root_morphology'
  | 'youtube_clips'
  | 'visual_mnemonic'
  | 'micro_story'
  | 'community_notes'
  | 'memory_dynamics';

export type PresetMode = 'sprint' | 'mastery' | 'focus' | 'custom';

export interface ModuleMeta {
  id: ModuleId;
  /** i18n key under the `modules` namespace. */
  name: string;
  /** i18n key under the `modules` namespace. */
  description: string;
  icon: string;
  tier: 0 | 1;
  defaultOpen: boolean;
  minHeight: number;
  aspectRatio?: string;
  badgeText?: string;
}

export interface WordModuleProps {
  word: string;
  chineseData: ChineseData | null;
  content?: string | null;
  currentUserId?: string;
  onWordClick?: (word: string) => void;
  onScrollToNotes?: () => void;
  onPlayAudio?: (type: 'US' | 'UK') => void;
  audioShortcuts?: { us: string; uk: string; youtube?: string };
  showTooltip?: boolean;
  loading?: boolean;
  error?: string | null;
}

export interface ModuleConfigState {
  version: 1;
  preset: PresetMode;
  modules: Record<ModuleId, boolean>;
  collapsedModules: Record<ModuleId, boolean>;
  tempExpandedModules: Record<ModuleId, boolean>;
  moduleOrder: ModuleId[];
  hydrated: boolean;
}

export const MODULE_IDS = [
  'basic_definition',
  'audio_speech',
  'root_morphology',
  'youtube_clips',
  'visual_mnemonic',
  'micro_story',
  'community_notes',
  'memory_dynamics',
] as const satisfies readonly ModuleId[];

export const BUILTIN_PRESET_MODES = ['sprint', 'mastery', 'focus'] as const satisfies readonly PresetMode[];

export const MODULE_REGISTRY: Record<ModuleId, ModuleMeta> = {
  basic_definition: {
    id: 'basic_definition',
    name: 'basic_definition.name',
    description: 'basic_definition.description',
    icon: 'book-open',
    tier: 0,
    defaultOpen: true,
    minHeight: 220,
  },
  audio_speech: {
    id: 'audio_speech',
    name: 'audio_speech.name',
    description: 'audio_speech.description',
    icon: 'volume-2',
    tier: 0,
    defaultOpen: true,
    minHeight: 72,
  },
  root_morphology: {
    id: 'root_morphology',
    name: 'root_morphology.name',
    description: 'root_morphology.description',
    icon: 'network',
    tier: 1,
    defaultOpen: true,
    minHeight: 120,
    badgeText: 'Morphology',
  },
  youtube_clips: {
    id: 'youtube_clips',
    name: 'youtube_clips.name',
    description: 'youtube_clips.description',
    icon: 'play-circle',
    tier: 1,
    defaultOpen: false,
    minHeight: 260,
    aspectRatio: '16 / 9',
    badgeText: 'YouGlish',
  },
  visual_mnemonic: {
    id: 'visual_mnemonic',
    name: 'visual_mnemonic.name',
    description: 'visual_mnemonic.description',
    icon: 'image',
    tier: 1,
    defaultOpen: false,
    minHeight: 160,
    badgeText: 'Visual AI',
  },
  micro_story: {
    id: 'micro_story',
    name: 'micro_story.name',
    description: 'micro_story.description',
    icon: 'sparkles',
    tier: 1,
    defaultOpen: false,
    minHeight: 160,
    badgeText: 'DeepSeek',
  },
  community_notes: {
    id: 'community_notes',
    name: 'community_notes.name',
    description: 'community_notes.description',
    icon: 'sticky-note',
    tier: 1,
    defaultOpen: true,
    minHeight: 220,
  },
  memory_dynamics: {
    id: 'memory_dynamics',
    name: 'memory_dynamics.name',
    description: 'memory_dynamics.description',
    icon: 'activity',
    tier: 1,
    defaultOpen: false,
    minHeight: 120,
    badgeText: 'SM-2',
  },
};

export const PRESET_CONFIGS: Record<PresetMode, Record<ModuleId, boolean>> = {
  sprint: {
    basic_definition: true,
    audio_speech: true,
    root_morphology: true,
    youtube_clips: false,
    visual_mnemonic: false,
    micro_story: false,
    community_notes: true,
    memory_dynamics: true,
  },
  mastery: {
    basic_definition: true,
    audio_speech: true,
    root_morphology: true,
    youtube_clips: true,
    visual_mnemonic: true,
    micro_story: true,
    community_notes: true,
    memory_dynamics: false,
  },
  focus: {
    basic_definition: true,
    audio_speech: true,
    root_morphology: true,
    youtube_clips: false,
    visual_mnemonic: true,
    micro_story: false,
    community_notes: false,
    memory_dynamics: false,
  },
  custom: {
    basic_definition: true,
    audio_speech: true,
    root_morphology: true,
    youtube_clips: false,
    visual_mnemonic: false,
    micro_story: false,
    community_notes: true,
    memory_dynamics: false,
  },
};

function cloneModuleRecord(record: Record<ModuleId, boolean>): Record<ModuleId, boolean> {
  return MODULE_IDS.reduce((result, id) => {
    result[id] = Boolean(record[id]);
    return result;
  }, {} as Record<ModuleId, boolean>);
}

export function modulesForPreset(preset: PresetMode): Record<ModuleId, boolean> {
  return cloneModuleRecord(PRESET_CONFIGS[preset] || PRESET_CONFIGS.mastery);
}

export function emptyModuleRecord(value = false): Record<ModuleId, boolean> {
  return MODULE_IDS.reduce((result, id) => {
    result[id] = value;
    return result;
  }, {} as Record<ModuleId, boolean>);
}

export function collapsedModulesFromDefaults(): Record<ModuleId, boolean> {
  return MODULE_IDS.reduce((result, id) => {
    result[id] = !MODULE_REGISTRY[id].defaultOpen;
    return result;
  }, {} as Record<ModuleId, boolean>);
}

export function createDefaultModuleConfig(): ModuleConfigState {
  return {
    version: 1,
    preset: 'mastery',
    modules: modulesForPreset('mastery'),
    collapsedModules: collapsedModulesFromDefaults(),
    tempExpandedModules: emptyModuleRecord(),
    moduleOrder: [...MODULE_IDS],
    hydrated: false,
  };
}

function isPreset(value: unknown): value is PresetMode {
  return value === 'sprint' || value === 'mastery' || value === 'focus' || value === 'custom';
}

function readBooleanRecord(value: unknown): Partial<Record<ModuleId, boolean>> {
  if (!value || typeof value !== 'object') return {};
  const source = value as Record<string, unknown>;
  return MODULE_IDS.reduce((result, id) => {
    if (typeof source[id] === 'boolean') result[id] = source[id] as boolean;
    return result;
  }, {} as Partial<Record<ModuleId, boolean>>);
}

function sanitizeOrder(rawOrder: unknown): ModuleId[] {
  const result: ModuleId[] = [];
  if (Array.isArray(rawOrder)) {
    for (const item of rawOrder) {
      if (typeof item === 'string' && (MODULE_IDS as readonly string[]).includes(item) && !result.includes(item as ModuleId)) {
        result.push(item as ModuleId);
      }
    }
  }
  for (const id of MODULE_IDS) {
    if (!result.includes(id)) {
      result.push(id);
    }
  }
  return result;
}

export function sanitizeModuleConfig(value: unknown): Omit<ModuleConfigState, 'hydrated'> {
  const fallback = createDefaultModuleConfig();
  if (!value || typeof value !== 'object') {
    return {
      version: 1,
      preset: fallback.preset,
      modules: fallback.modules,
      collapsedModules: fallback.collapsedModules,
      tempExpandedModules: fallback.tempExpandedModules,
      moduleOrder: fallback.moduleOrder,
    };
  }

  const source = value as Record<string, unknown>;
  // Unknown storage versions are intentionally discarded instead of being
  // guessed at; this keeps a future schema from corrupting the current UI.
  if (source.version !== undefined && source.version !== 1) {
    return {
      version: 1,
      preset: fallback.preset,
      modules: fallback.modules,
      collapsedModules: fallback.collapsedModules,
      tempExpandedModules: fallback.tempExpandedModules,
      moduleOrder: fallback.moduleOrder,
    };
  }
  const preset = isPreset(source.preset) ? source.preset : fallback.preset;
  const storedModules = readBooleanRecord(source.modules);
  const storedCollapsed = readBooleanRecord(source.collapsedModules);
  const moduleOrder = sanitizeOrder(source.moduleOrder);
  const presetModules = modulesForPreset(preset);
  const modules = MODULE_IDS.reduce((result, id) => {
    result[id] = MODULE_REGISTRY[id].tier === 0
      ? true
      : preset === 'custom' && typeof storedModules[id] === 'boolean'
        ? storedModules[id] as boolean
        : presetModules[id];
    return result;
  }, {} as Record<ModuleId, boolean>);
  const collapsedModules = MODULE_IDS.reduce((result, id) => {
    result[id] = typeof storedCollapsed[id] === 'boolean'
      ? storedCollapsed[id] as boolean
      : !MODULE_REGISTRY[id].defaultOpen;
    return result;
  }, {} as Record<ModuleId, boolean>);

  return {
    version: 1,
    preset,
    modules,
    collapsedModules,
    tempExpandedModules: emptyModuleRecord(),
    moduleOrder,
  };
}

export function assertModuleRegistryComplete(): true {
  const ids = new Set(MODULE_IDS);
  if (ids.size !== 8 || Object.keys(MODULE_REGISTRY).length !== MODULE_IDS.length) {
    throw new Error('Module registry must contain exactly eight unique modules');
  }
  for (const id of MODULE_IDS) {
    const meta = MODULE_REGISTRY[id];
    if (!meta || meta.id !== id || (meta.tier !== 0 && meta.tier !== 1) || meta.minHeight <= 0) {
      throw new Error(`Invalid module registry entry: ${id}`);
    }
  }
  for (const mode of ['sprint', 'mastery', 'focus', 'custom'] as const) {
    const preset = PRESET_CONFIGS[mode];
    for (const id of MODULE_IDS) {
      if (typeof preset?.[id] !== 'boolean') {
        throw new Error(`Preset ${mode} is missing module ${id}`);
      }
    }
  }
  return true;
}

assertModuleRegistryComplete();
