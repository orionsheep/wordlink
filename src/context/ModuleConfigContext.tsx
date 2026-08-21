'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  MODULE_REGISTRY,
  createDefaultModuleConfig,
  emptyModuleRecord,
  modulesForPreset,
  sanitizeModuleConfig,
  type ModuleConfigState,
  type ModuleId,
  type PresetMode,
} from '@/types/modules';

export const MODULE_CONFIG_STORAGE_KEY = 'wordlink_module_config';

interface ModuleConfigContextValue extends ModuleConfigState {
  setPreset: (preset: PresetMode) => void;
  toggleModule: (id: ModuleId) => void;
  toggleCollapse: (id: ModuleId) => void;
  tempExpandModule: (id: ModuleId) => void;
  resetTempExpanded: () => void;
  isModuleVisible: (id: ModuleId) => boolean;
  isModuleCollapsed: (id: ModuleId) => boolean;
  reorderModules: (newOrder: ModuleId[]) => void;
  moveModule: (fromIndex: number, toIndex: number) => void;
  resetToDefault: () => void;
}

const ModuleConfigContext = createContext<ModuleConfigContextValue | undefined>(undefined);

function safeReadStorage(): unknown {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MODULE_CONFIG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function ModuleConfigProvider({ children }: { children: React.ReactNode }) {
  // Keep the server and first client render identical. Storage is read in an
  // effect so a user's saved preset can never cause a hydration mismatch.
  const [state, setState] = useState<ModuleConfigState>(() => createDefaultModuleConfig());

  useEffect(() => {
    const parsed = sanitizeModuleConfig(safeReadStorage());
    const timer = window.setTimeout(() => {
      setState(() => ({ ...parsed, hydrated: true }));
      if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
        performance.mark('wordlink-module-config-hydrated');
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Persist only durable fields. Temporary ghost expansions and hydration are
  // intentionally excluded, and changing a temporary flag does not write.
  const { hydrated, preset, modules, collapsedModules, moduleOrder } = state;
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(MODULE_CONFIG_STORAGE_KEY, JSON.stringify({
        version: 1,
        preset,
        modules,
        collapsedModules,
        moduleOrder,
      }));
    } catch {
      // Private browsing/quota failures must not make the UI unusable.
    }
  }, [hydrated, preset, modules, collapsedModules, moduleOrder]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== MODULE_CONFIG_STORAGE_KEY) return;
      try {
        const parsed = sanitizeModuleConfig(event.newValue ? JSON.parse(event.newValue) : null);
        setState((previous) => ({ ...parsed, hydrated: previous.hydrated }));
      } catch {
        // Ignore malformed values from another tab.
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const setPreset = useCallback((preset: PresetMode) => {
    setState((previous) => ({
      ...previous,
      preset,
      modules: modulesForPreset(preset),
      // The product contract keeps each user's fold preference across presets.
      collapsedModules: { ...previous.collapsedModules },
      tempExpandedModules: emptyModuleRecord(),
    }));
  }, []);

  const toggleModule = useCallback((id: ModuleId) => {
    const meta = MODULE_REGISTRY[id];
    if (!meta || meta.tier === 0) return;
    setState((previous) => ({
      ...previous,
      preset: 'custom',
      modules: { ...previous.modules, [id]: !previous.modules[id] },
      tempExpandedModules: { ...previous.tempExpandedModules, [id]: false },
    }));
  }, []);

  const toggleCollapse = useCallback((id: ModuleId) => {
    if (!MODULE_REGISTRY[id]) return;
    setState((previous) => ({
      ...previous,
      collapsedModules: { ...previous.collapsedModules, [id]: !previous.collapsedModules[id] },
    }));
  }, []);

  const tempExpandModule = useCallback((id: ModuleId) => {
    const meta = MODULE_REGISTRY[id];
    if (!meta || meta.tier === 0) return;
    // Keep the durable collapsed preference untouched. isModuleCollapsed()
    // treats this transient flag as an effective expansion for the current
    // word, so Ghost never writes a temporary UI action to localStorage.
    setState((previous) => ({
      ...previous,
      tempExpandedModules: { ...previous.tempExpandedModules, [id]: true },
    }));
  }, []);

  const resetTempExpanded = useCallback(() => {
    setState((previous) => ({ ...previous, tempExpandedModules: emptyModuleRecord() }));
  }, []);

  const resetToDefault = useCallback(() => {
    setState((previous) => ({
      ...createDefaultModuleConfig(),
      hydrated: previous.hydrated,
    }));
  }, []);

  const isModuleVisible = useCallback((id: ModuleId) => {
    const meta = MODULE_REGISTRY[id];
    if (!meta) return false;
    return meta.tier === 0 || Boolean(state.modules[id] || state.tempExpandedModules[id]);
  }, [state.modules, state.tempExpandedModules]);

  const isModuleCollapsed = useCallback((id: ModuleId) => {
    if (!MODULE_REGISTRY[id]) return false;
    return Boolean(state.collapsedModules[id] && !state.tempExpandedModules[id]);
  }, [state.collapsedModules, state.tempExpandedModules]);

  const reorderModules = useCallback((newOrder: ModuleId[]) => {
    setState((previous) => ({
      ...previous,
      moduleOrder: newOrder,
    }));
  }, []);

  const moveModule = useCallback((fromIndex: number, toIndex: number) => {
    setState((previous) => {
      const order = [...previous.moduleOrder];
      if (fromIndex < 0 || fromIndex >= order.length || toIndex < 0 || toIndex >= order.length) {
        return previous;
      }
      const [moved] = order.splice(fromIndex, 1);
      order.splice(toIndex, 0, moved);
      return {
        ...previous,
        moduleOrder: order,
      };
    });
  }, []);

  const value = useMemo<ModuleConfigContextValue>(() => ({
    ...state,
    setPreset,
    toggleModule,
    toggleCollapse,
    tempExpandModule,
    resetTempExpanded,
    isModuleVisible,
    isModuleCollapsed,
    reorderModules,
    moveModule,
    resetToDefault,
  }), [state, setPreset, toggleModule, toggleCollapse, tempExpandModule, resetTempExpanded, isModuleVisible, isModuleCollapsed, reorderModules, moveModule, resetToDefault]);

  return <ModuleConfigContext.Provider value={value}>{children}</ModuleConfigContext.Provider>;
}

export function useModuleConfig() {
  const context = useContext(ModuleConfigContext);
  if (!context) throw new Error('useModuleConfig must be used within ModuleConfigProvider');
  return context;
}

// Keep this export for older imports/tests that used the previous name.
export { MODULE_CONFIG_STORAGE_KEY as STORAGE_KEY };
