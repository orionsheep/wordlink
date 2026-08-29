'use client';

import { useEffect, useState } from 'react';
import type { WordModuleProps, ModuleId } from '@/types/modules';
import { useModuleConfig } from '@/context/ModuleConfigContext';
import BasicDefModule from './BasicDefModule';
import AudioSpeechModule from './AudioSpeechModule';
import RootMorphologyModule from './RootMorphologyModule';
import YouTubeClipsModule from './YouTubeClipsModule';
import VisualMnemonicModule from './VisualMnemonicModule';
import CommunityNotesModule from './CommunityNotesModule';
import MemoryDynamicsModule from './MemoryDynamicsModule';
import GhostBadgesBar from './GhostBadgesBar';

interface WordModulesProps extends WordModuleProps {
  /** Audio controls live in WordDetail's title bar by default. */
  audioInHeader?: boolean;
}

export default function WordModules(props: WordModulesProps) {
  const { word } = props;
  const { isModuleVisible, isModuleCollapsed, toggleCollapse, resetTempExpanded, moduleOrder, reorderModules } = useModuleConfig();
  const [draggedId, setDraggedId] = useState<ModuleId | null>(null);
  const [dragOverId, setDragOverId] = useState<ModuleId | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => resetTempExpanded(), 0);
    return () => window.clearTimeout(timer);
  }, [word, resetTempExpanded]);

  const handleDragStart = (id: ModuleId) => (e: React.DragEvent) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (id: ModuleId) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== id) {
      setDragOverId(id);
    }
  };

  const handleDrop = (targetId: ModuleId) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }
    const currentOrder = [...moduleOrder];
    const fromIndex = currentOrder.indexOf(draggedId);
    const toIndex = currentOrder.indexOf(targetId);
    if (fromIndex !== -1 && toIndex !== -1) {
      const [removed] = currentOrder.splice(fromIndex, 1);
      currentOrder.splice(toIndex, 0, removed);
      reorderModules(currentOrder);
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const renderModule = (id: ModuleId) => {
    if (!isModuleVisible(id)) return null;
    if (id === 'audio_speech' && props.audioInHeader) return null;

    const baseProps = {
      ...props,
      collapsed: isModuleCollapsed(id),
      onToggle: () => toggleCollapse(id),
    };

    let component: React.ReactNode = null;
    switch (id) {
      case 'basic_definition':
        component = <BasicDefModule {...baseProps} />;
        break;
      case 'audio_speech':
        component = <AudioSpeechModule {...baseProps} />;
        break;
      case 'root_morphology':
        component = <RootMorphologyModule {...baseProps} />;
        break;
      case 'youtube_clips':
        component = <YouTubeClipsModule {...baseProps} />;
        break;
      case 'visual_mnemonic':
        component = <VisualMnemonicModule {...baseProps} />;
        break;
      case 'community_notes':
        component = <CommunityNotesModule {...baseProps} />;
        break;
      case 'memory_dynamics':
        component = <MemoryDynamicsModule {...baseProps} />;
        break;
      default:
        return null;
    }

    return (
      <div
        key={id}
        draggable
        onDragStart={handleDragStart(id)}
        onDragOver={handleDragOver(id)}
        onDrop={handleDrop(id)}
        onDragEnd={handleDragEnd}
        className={`group/module relative transition-all duration-200 ${
          draggedId === id ? 'opacity-30 scale-[0.98]' : ''
        } ${dragOverId === id ? 'rounded-lg ring-2 ring-blue-500/50 bg-blue-500/5' : ''}`}
      >
        {component}
      </div>
    );
  };

  return (
    <div className="space-y-6" data-word-modules-root={word}>
      {moduleOrder.map(renderModule)}
      <GhostBadgesBar />
    </div>
  );
}
