'use client';

import React from 'react';
import { X } from 'lucide-react';
import SettingsContent from './SettingsContent';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-2xl h-[600px] flex flex-col relative shadow-2xl">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors z-10"
                >
                    <X size={20} />
                </button>

                <SettingsContent />
            </div>
        </div>
    );
}
