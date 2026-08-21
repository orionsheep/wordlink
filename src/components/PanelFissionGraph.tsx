'use client';

/* The force-graph package exposes runtime-shaped nodes/links without a
 * usable TypeScript generic. Keep the boundary explicit and normalize IDs in
 * the helpers below. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useRef, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { GraphData } from '@/lib/data';
import { useSettings } from '@/context/SettingsContext';
import { useDeviceType } from '@/lib/hooks';
import { useTranslations } from 'next-intl';
import WordTooltip from './WordTooltip';
import { Eye, EyeOff, ZoomIn, ZoomOut, Settings, X, RefreshCw } from 'lucide-react';
import { forceCollide, forceRadial } from 'd3-force';

// Dynamically import ForceGraph2D with no SSR
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
    ssr: false,
    loading: () => <div className="text-neutral-400">Loading Graph...</div>
});

interface PanelFissionGraphProps {
    word: string | null;
    onNodeClick?: (node: string) => void;
}

// Particle system
interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    opacity: number;
    color: string;
}

interface GraphSettings {
    level1Size: number;
    level2Size: number;
    level1FontSize: number;
    level2FontSize: number;
    chargeStrength: number;
    level1LinkDistance: number;
    level2LinkDistance: number;
    collisionRadius: number; // Collision padding multiplier
    lockNodeOnDrag: boolean; // If true, nodes stay fixed where dropped
    showHoverTooltip: boolean;
}

type GraphEndpoint = string | number | { id?: string | number } | null | undefined;

/** Normalize force-graph endpoints, which are strings before simulation and
 * node objects after d3 has resolved the links. Exported for pure tests. */
export function getGraphNodeId(endpoint: GraphEndpoint): string | null {
    if (typeof endpoint === 'string' || typeof endpoint === 'number') return String(endpoint);
    if (endpoint && endpoint.id !== undefined && endpoint.id !== null) return String(endpoint.id);
    return null;
}

export function isGraphLinkBetween(link: { source?: GraphEndpoint; target?: GraphEndpoint }, firstId: string, secondId: string): boolean {
    const source = getGraphNodeId(link.source);
    const target = getGraphNodeId(link.target);
    return (source === firstId && target === secondId) || (source === secondId && target === firstId);
}

function isGraphNeighbor(hoveredNode: any, node: any, links: any[]): boolean {
    if (!hoveredNode || !node) return false;
    const hoveredId = getGraphNodeId(hoveredNode.id);
    const nodeId = getGraphNodeId(node.id);
    if (!hoveredId || !nodeId || hoveredId === nodeId) return false;
    return links.some((link) => isGraphLinkBetween(link, hoveredId, nodeId));
}

function firstTranslation(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.split(/[,;\s，；、]/)[0]?.trim() || '';
}

const defaultGraphSettings: GraphSettings = {
    level1Size: 1.4,
    level2Size: 0.8,
    level1FontSize: 13,
    level2FontSize: 10,
    chargeStrength: -4000, // Balanced repulsion - not too strong
    level1LinkDistance: 180, // Closer to center
    level2LinkDistance: 100, // Compact but readable
    collisionRadius: 40, // Prevents overlap without pushing too far
    lockNodeOnDrag: false, // Default: bounce back (natural physics)
    showHoverTooltip: true,
};

const mobileGraphSettings: GraphSettings = {
    level1Size: 2.8,
    level2Size: 2.0,
    level1FontSize: 12,
    level2FontSize: 11,
    chargeStrength: -3000,
    level1LinkDistance: 140,
    level2LinkDistance: 80,
    collisionRadius: 35,
    lockNodeOnDrag: false,
    showHoverTooltip: false,
};

export default function PanelFissionGraph({ word, onNodeClick }: PanelFissionGraphProps) {
    const { showHoverTooltip: globalShowHoverTooltip, showGraphTooltip } = useSettings();
    const t = useTranslations();
    const deviceType = useDeviceType();
    const isMobile = deviceType === 'mobile';
    const initialSettings = isMobile ? mobileGraphSettings : defaultGraphSettings;
    const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
    // Initialize with window size
    const [dimensions, setDimensions] = useState({
        width: typeof window !== 'undefined' ? window.innerWidth / 2 : 800,
        height: typeof window !== 'undefined' ? window.innerHeight : 600
    });
    const [hoveredNode, setHoveredNode] = useState<any>(null);
    const [particles, setParticles] = useState<Particle[]>([]);
    const [showSettings, setShowSettings] = useState(false);
    const [showLevel2, setShowLevel2] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [uiSettings, setUiSettings] = useState<GraphSettings>({ ...initialSettings });
    const [settings, setSettings] = useState<GraphSettings>({ ...initialSettings });

    const resetToDefaults = () => {
        setUiSettings({ ...initialSettings });
        setSettings({ ...initialSettings });
    };

    const containerRef = useRef<HTMLDivElement>(null);
    const fgRef = useRef<any>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!word) {
            setData({ nodes: [], links: [] });
            return;
        }

        const fetchData = async () => {
            setIsLoading(true);
            try {
                const res = await fetch(`/api/fission?word=${encodeURIComponent(word)}`);
                const graphData = await res.json();

                if (graphData && Array.isArray(graphData.nodes)) {
                    // Pre-calculate clean sector-clustered radial celestial positions
                    const l1Nodes = graphData.nodes.filter((n: any) => n.level === 1);
                    const l2Nodes = graphData.nodes.filter((n: any) => n.level === 2);

                    const centerNode = graphData.nodes.find((n: any) => n.level === 0);
                    if (centerNode) {
                        centerNode.x = 0;
                        centerNode.y = 0;
                        centerNode.fx = 0;
                        centerNode.fy = 0;
                    }

                    // Group Level 1 nodes by meaning/color so synonyms of the same meaning form clear clusters
                    const meaningGroups = new Map<string, any[]>();
                    l1Nodes.forEach((node: any) => {
                        const key = node.color || 'default';
                        if (!meaningGroups.has(key)) meaningGroups.set(key, []);
                        meaningGroups.get(key)!.push(node);
                    });

                    const numGroups = meaningGroups.size || 1;
                    let groupIdx = 0;

                    meaningGroups.forEach((groupNodes) => {
                        const baseAngle = (groupIdx / numGroups) * 2 * Math.PI - Math.PI / 2;
                        const spread = (Math.PI * 1.5) / numGroups;

                        groupNodes.forEach((node, nodeIdx) => {
                            const count = groupNodes.length;
                            const subAngle = baseAngle + (count > 1 ? (nodeIdx / (count - 1) - 0.5) * spread : 0);
                            const r = 260 + (nodeIdx % 2) * 55;
                            node.x = Math.cos(subAngle) * r;
                            node.y = Math.sin(subAngle) * r;
                        });
                        groupIdx++;
                    });

                    // Level 2 nodes fan out outward from their Level 1 parents
                    l2Nodes.forEach((node: any, i: number) => {
                        const parentLink = graphData.links.find((l: any) => (l.target === node.id || l.target?.id === node.id));
                        const parentId = parentLink?.source?.id || parentLink?.source;
                        const parent = l1Nodes.find((n: any) => n.id === parentId);
                        if (parent && parent.x !== undefined && parent.y !== undefined) {
                            const parentAngle = Math.atan2(parent.y, parent.x);
                            const subAngle = parentAngle + ((i % 5) - 2) * 0.35;
                            const subR = 110 + (i % 3) * 25;
                            node.x = parent.x + Math.cos(subAngle) * subR;
                            node.y = parent.y + Math.sin(subAngle) * subR;
                        } else {
                            const angle = (i / (l2Nodes.length || 1)) * 2 * Math.PI;
                            node.x = Math.cos(angle) * 420;
                            node.y = Math.sin(angle) * 420;
                        }
                    });
                }

                setData(graphData);
            } catch (error) {
                console.error('Failed to fetch graph data', error);
            } finally {
                setTimeout(() => setIsLoading(false), 100); // Brief delay to prevent flash
            }
        };

        fetchData();
    }, [word, refreshKey]); // Include refreshKey to trigger refetch

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const { width, height } = containerRef.current.getBoundingClientRect();
                setDimensions({ width, height });
            }
        };

        // Initial size
        updateDimensions();

        // Robust Observer
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setDimensions({ width, height });
            }
        });

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        // Backup: Window resize
        window.addEventListener('resize', updateDimensions);

        // Keyboard shortcut for toggling Level 2
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key && e.key.toLowerCase() === 'h' && !e.repeat && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
                setShowLevel2(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateDimensions);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    // Auto-fit graph when data changes (word switch)
    useEffect(() => {
        if (fgRef.current && data.nodes.length > 0) {
            // Reheat simulation to ensure nodes expand before zooming
            fgRef.current.d3ReheatSimulation();

            setTimeout(() => {
                if (data.nodes.length < 5) {
                    // Small graph: Center and set comfortable zoom
                    fgRef.current?.centerAt(0, 0, 500);
                    fgRef.current?.zoom(1.2, 500);
                } else {
                    // Large graph: Zoom to fit all nodes with padding
                    fgRef.current?.zoomToFit(500, 60);
                }
            }, 300); // Allow simulation to expand
        }
    }, [data]);

    // Auto-fit graph when dimensions change (e.g., returning from immersive)
    useEffect(() => {
        // Only trigger if we have valid dimensions and data
        if (fgRef.current && dimensions.width > 0 && dimensions.height > 0 && data.nodes.length > 0) {
            setTimeout(() => {
                if (data.nodes.length < 5) {
                    fgRef.current?.centerAt(0, 0, 500);
                    fgRef.current?.zoom(1.2, 500);
                } else {
                    fgRef.current?.zoomToFit(500, 60);
                }
            }, 500); // Longer delay to ensure panel is fully rendered
        }
    }, [dimensions, data.nodes.length]);

    // Auto-refresh when returning from immersive mode
    useEffect(() => {
        const shouldAutoRefresh = sessionStorage.getItem('autoRefreshGraph');
        if (shouldAutoRefresh === 'true') {
            // Clear the flag
            sessionStorage.removeItem('autoRefreshGraph');
            // Trigger refresh
            setRefreshKey(prev => prev + 1);
        }
    }, []); // Run once on mount

    // Re-center logic merged into auto-fit effect above

    // Update forces when settings change or data updates
    useEffect(() => {
        if (fgRef.current && data.nodes.length > 0) {
            // Disable forceCenter to avoid pulling satellites into (0,0)
            fgRef.current.d3Force('center', null);

            // Celestial Radial Force: Guarantees Level 1 nodes form a spacious orbital ring around center
            fgRef.current.d3Force('radial', forceRadial((node: any) => {
                return node.level === 1 ? 270 : (node.level === 2 ? 420 : 0);
            }, 0, 0).strength((node: any) => {
                return node.level === 1 ? 0.9 : (node.level === 2 ? 0.35 : 0);
            }));

            // Repulsion to space out nodes within their orbits
            fgRef.current.d3Force('charge')?.strength(-7000);

            // Dynamic link distance
            fgRef.current.d3Force('link')?.distance((link: any) => {
                const source = typeof link.source === 'object' ? link.source : data.nodes.find((node) => node.id === link.source);
                const target = typeof link.target === 'object' ? link.target : data.nodes.find((node) => node.id === link.target);

                // Central node to Level 1 synonyms: 270px
                if (source?.level === 0 || target?.level === 0) {
                    return 270;
                }
                // Level 1 to Level 2 satellites: 120px
                if (source?.level === 2 || target?.level === 2) {
                    return 120;
                }
                // Cross-links between Level 1 synonyms
                return 220;
            });

            // Strict collision buffer
            fgRef.current.d3Force('collide', forceCollide((node: any) => {
                if (node.level === 0) return 90;
                if (node.level === 1) return 55;
                return 24;
            }).strength(1.0).iterations(8));

            // Reheat simulation
            fgRef.current.d3ReheatSimulation();

            // Auto-center and zoom to fit with comfortable padding
            const timer = setTimeout(() => {
                if (fgRef.current && data.nodes.length > 0) {
                    fgRef.current.zoomToFit(400, 90);
                }
            }, 350);
            return () => clearTimeout(timer);
        }
    }, [settings.chargeStrength, settings.level1LinkDistance, settings.level2LinkDistance, settings.collisionRadius, settings.level1Size, settings.level2Size, data]);

    // Initialize particle system - expanded coverage
    useEffect(() => {
        const particleCount = isMobile ? 50 : 200;
        const newParticles: Particle[] = Array.from({ length: particleCount }, () => ({
            // Expand distribution to 3x viewport size for zoom-out coverage
            x: (Math.random() - 0.5) * dimensions.width * 3,
            y: (Math.random() - 0.5) * dimensions.height * 3,
            vx: (Math.random() - 0.5) * 0.3, // Slower movement
            vy: (Math.random() - 0.5) * 0.3,
            size: Math.random() * 2 + 0.3, // Varying sizes: 0.3-2.3px
            opacity: Math.random() * 0.4 + 0.1, // 0.1-0.5 opacity
            color: ['#ffffff', '#ffffff', '#3b82f6', '#8b5cf6', '#ec4899', '#a78bfa'][Math.floor(Math.random() * 6)]
        }));
        setParticles(newParticles);
    }, [dimensions, isMobile]);

    const handleRefresh = () => {
        // Force component to remount by changing key
        setRefreshKey(prev => prev + 1);
    };

    const handleZoomIn = () => {
        if (fgRef.current) {
            fgRef.current.zoom(fgRef.current.zoom() * 1.5, 400);
        }
    };

    const handleZoomOut = () => {
        if (fgRef.current) {
            fgRef.current.zoom(fgRef.current.zoom() / 1.5, 400);
        }
    };

    // Removed visibleData memo to prevent layout jumps. 
    // We now control visibility in the render loop.

    if (!word) {
        return (
            <div className="h-full flex items-center justify-center text-neutral-500 bg-black font-light tracking-wider">
                {t('graph.selectWord').toUpperCase()}
            </div>
        );
    }

    return (
        <div ref={containerRef} className="absolute inset-0 bg-black overflow-hidden">
            {/* Enhanced Gradient Background - creates depth */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-950 via-black to-black opacity-60 pointer-events-none"></div>

            {/* Controls - Bottom bar on mobile, floating panel on desktop */}
            {isMobile ? (
                <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-3 px-4 py-3 bg-neutral-900/90 backdrop-blur-md border-t border-neutral-800 safe-area-bottom">
                    <button
                        onClick={handleRefresh}
                        className="mobile-touch-target flex items-center justify-center bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors border border-neutral-700"
                        title={t('graph.refreshGraph')}
                    >
                        <RefreshCw size={20} />
                    </button>
                    <button
                        onClick={handleZoomIn}
                        className="mobile-touch-target flex items-center justify-center bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors border border-neutral-700"
                        title={t('graph.zoomIn')}
                    >
                        <ZoomIn size={20} />
                    </button>
                    <button
                        onClick={handleZoomOut}
                        className="mobile-touch-target flex items-center justify-center bg-neutral-800 text-white rounded-lg hover:bg-neutral-700 transition-colors border border-neutral-700"
                        title={t('graph.zoomOut')}
                    >
                        <ZoomOut size={20} />
                    </button>
                    <button
                        onClick={() => setShowLevel2(!showLevel2)}
                        className={`mobile-touch-target flex items-center justify-center rounded-lg transition-colors border border-neutral-700 ${!showLevel2 ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-white hover:bg-neutral-700'}`}
                        title={t('graph.toggleSecondaryLinks')}
                    >
                        {showLevel2 ? <Eye size={20} /> : <EyeOff size={20} />}
                    </button>
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className={`mobile-touch-target flex items-center justify-center rounded-lg transition-colors border border-neutral-700 ${showSettings ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-white hover:bg-neutral-700'}`}
                        title={t('graph.adjustSettings')}
                    >
                        <Settings size={20} />
                    </button>
                </div>
            ) : (
                <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                    {/* Refresh */}
                    <button
                        onClick={handleRefresh}
                        className="p-2 bg-neutral-900/80 text-white rounded-lg hover:bg-neutral-800 transition-colors border border-neutral-800 backdrop-blur-sm"
                        title={t('graph.refreshGraph')}
                    >
                        <RefreshCw size={20} />
                    </button>
                    <button
                        onClick={handleZoomIn}
                        className="p-2 bg-neutral-900/80 text-white rounded-lg hover:bg-neutral-800 transition-colors border border-neutral-800 backdrop-blur-sm"
                        title={t('graph.zoomIn')}
                    >
                        <ZoomIn size={20} />
                    </button>
                    <button
                        onClick={handleZoomOut}
                        className="p-2 bg-neutral-900/80 text-white rounded-lg hover:bg-neutral-800 transition-colors border border-neutral-800 backdrop-blur-sm"
                        title={t('graph.zoomOut')}
                    >
                        <ZoomOut size={20} />
                    </button>
                    <button
                        onClick={() => setShowLevel2(!showLevel2)}
                        className={`p-2 rounded-lg transition-colors border border-neutral-800 backdrop-blur-sm ${!showLevel2 ? 'bg-blue-600 text-white' : 'bg-neutral-900/80 text-white hover:bg-neutral-800'}`}
                        title={`${t('graph.toggleSecondaryLinks')}(H)`}
                    >
                        {showLevel2 ? <Eye size={20} /> : <EyeOff size={20} />}
                    </button>
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className={`p-2 rounded-lg transition-colors border border-neutral-800 backdrop-blur-sm ${showSettings ? 'bg-blue-600 text-white' : 'bg-neutral-900/80 text-white hover:bg-neutral-800'}`}
                        title={t('graph.adjustSettings')}
                    >
                        <Settings size={20} />
                    </button>
                </div>
            )}

            {/* Settings Panel */}
            {showSettings && (
                <div className={`absolute z-20 w-64 bg-neutral-900/95 backdrop-blur-md border border-neutral-800 rounded-xl p-4 shadow-2xl ${isMobile ? 'bottom-16 left-1/2 -translate-x-1/2 max-h-[60vh] overflow-y-auto mobile-scroll' : 'top-4 right-16'}`}>
                    <div className="flex justify-between items-center mb-4 border-b border-neutral-800 pb-2">
                        <h3 className="text-white font-medium text-sm">{t('graph.graphSettings')}</h3>
                        <button onClick={() => setShowSettings(false)} className="text-neutral-400 hover:text-white">
                            <X size={16} />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-neutral-400">
                                <span>{t('graph.level1Size')}</span>
                                <span>{uiSettings.level1Size.toFixed(1)}x</span>
                            </div>
                            <input
                                type="range"
                                min="0.5"
                                max="3.0"
                                step="0.1"
                                value={uiSettings.level1Size}
                                onChange={(e) => setUiSettings({ ...uiSettings, level1Size: parseFloat(e.target.value) })}
                                onMouseUp={() => setSettings(uiSettings)}
                                onTouchEnd={() => setSettings(uiSettings)}
                                className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-neutral-400">
                                <span>{t('graph.level2Size')}</span>
                                <span>{uiSettings.level2Size.toFixed(1)}x</span>
                            </div>
                            <input
                                type="range"
                                min="0.3"
                                max="2.0"
                                step="0.1"
                                value={uiSettings.level2Size}
                                onChange={(e) => setUiSettings({ ...uiSettings, level2Size: parseFloat(e.target.value) })}
                                onMouseUp={() => setSettings(uiSettings)}
                                onTouchEnd={() => setSettings(uiSettings)}
                                className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-neutral-400">
                                <span>{t('graph.level1Font')}</span>
                                <span>{uiSettings.level1FontSize}px</span>
                            </div>
                            <input
                                type="range"
                                min="8"
                                max="24"
                                step="1"
                                value={uiSettings.level1FontSize}
                                onChange={(e) => setUiSettings({ ...uiSettings, level1FontSize: parseInt(e.target.value) })}
                                onMouseUp={() => setSettings(uiSettings)}
                                onTouchEnd={() => setSettings(uiSettings)}
                                className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-neutral-400">
                                <span>{t('graph.level2Font')}</span>
                                <span>{uiSettings.level2FontSize}px</span>
                            </div>
                            <input
                                type="range"
                                min="6"
                                max="18"
                                step="1"
                                value={uiSettings.level2FontSize}
                                onChange={(e) => setUiSettings({ ...uiSettings, level2FontSize: parseInt(e.target.value) })}
                                onMouseUp={() => setSettings(uiSettings)}
                                onTouchEnd={() => setSettings(uiSettings)}
                                className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-neutral-400">
                                <span>{t('graph.repulsion')}</span>
                                <span>{uiSettings.chargeStrength}</span>
                            </div>
                            <input
                                type="range"
                                min="-15000"
                                max="0"
                                step="50"
                                value={uiSettings.chargeStrength}
                                onChange={(e) => setUiSettings({ ...uiSettings, chargeStrength: parseInt(e.target.value) })}
                                onMouseUp={() => setSettings(uiSettings)}
                                onTouchEnd={() => setSettings(uiSettings)}
                                className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-neutral-400">
                                <span>{t('graph.l1Distance')}</span>
                                <span>{uiSettings.level1LinkDistance}</span>
                            </div>
                            <input
                                type="range"
                                min="50"
                                max="600"
                                step="1"
                                value={uiSettings.level1LinkDistance}
                                onChange={(e) => setUiSettings({ ...uiSettings, level1LinkDistance: parseInt(e.target.value) })}
                                onMouseUp={() => setSettings(uiSettings)}
                                onTouchEnd={() => setSettings(uiSettings)}
                                className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-neutral-400">
                                <span>{t('graph.l2Distance')}</span>
                                <span>{uiSettings.level2LinkDistance}</span>
                            </div>
                            <input
                                type="range"
                                min="20"
                                max="400"
                                step="5"
                                value={uiSettings.level2LinkDistance}
                                onChange={(e) => setUiSettings({ ...uiSettings, level2LinkDistance: parseInt(e.target.value) })}
                                onMouseUp={() => setSettings(uiSettings)}
                                onTouchEnd={() => setSettings(uiSettings)}
                                className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-neutral-400">
                                <span>{t('graph.collisionPadding')}</span>
                                <span>{uiSettings.collisionRadius}px</span>
                            </div>
                            <input
                                type="range"
                                min="10"
                                max="100"
                                step="5"
                                value={uiSettings.collisionRadius}
                                onChange={(e) => setUiSettings({ ...uiSettings, collisionRadius: parseInt(e.target.value) })}
                                onMouseUp={() => setSettings(uiSettings)}
                                onTouchEnd={() => setSettings(uiSettings)}
                                className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>

                        {/* Lock Node Toggle */}
                        <div className="flex items-center justify-between py-2 border-t border-neutral-800 mt-2">
                            <span className="text-xs text-neutral-400">{t('graph.lockNodeAfterDrag')}</span>
                            <button
                                onClick={() => {
                                    const newSettings = { ...uiSettings, lockNodeOnDrag: !uiSettings.lockNodeOnDrag };
                                    setUiSettings(newSettings);
                                    setSettings(newSettings);
                                }}
                                className={`relative w-10 h-5 rounded-full transition-colors ${uiSettings.lockNodeOnDrag ? 'bg-blue-600' : 'bg-neutral-700'}`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${uiSettings.lockNodeOnDrag ? 'translate-x-5' : ''}`} />
                            </button>
                        </div>

                        {/* Reset to Defaults Button */}
                        <button
                            onClick={resetToDefaults}
                            className="w-full mt-4 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-medium rounded-lg transition-colors border border-neutral-700"
                        >
                            {t('graph.resetToDefaults')}
                        </button>
                    </div>
                </div>
            )}

            {/* Floating Legend - hidden on mobile */}
            {!isMobile && (
            <div className="absolute bottom-4 left-4 z-20 bg-neutral-900/90 backdrop-blur-md rounded-lg p-3 border border-neutral-800 shadow-2xl max-w-xs">
                <div className="text-xs font-semibold text-neutral-400 mb-2 uppercase tracking-wider">{t('graph.connectionMeanings')}</div>
                <div className="flex flex-col gap-2">
                    {[
                        '#ef4444', // Type 1
                        '#3b82f6', // Type 2
                        '#10b981', // Type 3
                        '#f59e0b', // Type 4
                        '#8b5cf6', // Type 5
                        '#ec4899', // Type 6
                        '#06b6d4', // Type 7
                        '#f97316', // Type 8
                    ].map((color, index) => {
                        const meaningNum = (index + 1).toString();
                        const definition = data.definitions?.[meaningNum];

                        // Only show if we have a definition or it's one of the first 3 (default)
                        if (!definition && index > 2) return null;

                        return (
                            <div key={index} className="flex items-start gap-2">
                                <div className="w-3 h-3 rounded-full mt-0.5 flex-shrink-0" style={{ backgroundColor: color }}></div>
                                <div className="flex flex-col">
                                    <span className="text-xs font-medium text-neutral-300">
                                        {t('graph.type')} {meaningNum}
                                    </span>
                                    {definition && (
                                        <span className="text-[10px] text-neutral-500 leading-tight line-clamp-2" title={definition}>
                                            {definition.replace(/^SKM:.*?\|/, '')}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            )}

            {isLoading && (
                <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-neutral-800 bg-neutral-950/80 px-3 py-1 text-xs text-neutral-500 backdrop-blur-sm" role="status">
                    {t('graph.loadingGraph')}
                </div>
            )}
            <ForceGraph2D
                key={`panel-${word}-${refreshKey}`} // Include refreshKey to force remount on refresh
                ref={fgRef}
                width={dimensions.width}
                height={dimensions.height}
                graphData={data}
                nodeLabel={() => ''}
                nodeColor="color"
                nodeVal={(node: any) => node.level === 0 ? 24 : 8} // Central node 3x larger

                // Generous hit-testing area covering both the node and the text label
                nodePointerAreaPaint={(node: any, color, ctx) => {
                    if (!showLevel2 && node.level === 2) return;
                    const x = node.x ?? 0;
                    const y = node.y ?? 0;

                    // 1. Generous node circular hit-target (at least 20px-35px radius)
                    const radius = node.level === 0 ? 35 : node.level === 1 ? 24 : 16;
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
                    ctx.fill();

                    // 2. ALSO include the label pill area so clicking the word text activates the node
                    const fontSize = node.level === 0 ? 16 : node.level === 1 ? settings.level1FontSize : settings.level2FontSize;
                    let labelX = x;
                    let labelY = y;
                    if (node.level === 0) {
                        labelY = y + (node.val || 20) * 1.5 + fontSize;
                    } else {
                        const angle = Math.atan2(y, x);
                        const distance = (node.val || 10) * 1.4 + fontSize;
                        labelX = x + Math.cos(angle) * distance;
                        labelY = y + Math.sin(angle) * distance;
                    }
                    const label = String(node.name || '');
                    const estimatedWidth = Math.max(50, label.length * fontSize * 0.7 + 20);
                    const estimatedHeight = fontSize * 2.4;
                    ctx.fillRect(labelX - estimatedWidth / 2, labelY - estimatedHeight / 2, estimatedWidth, estimatedHeight);
                }}
                linkColor="color"
                linkWidth={1.5}
                backgroundColor="#000000"

                // Advanced physics for organic movement
                d3VelocityDecay={0.25}
                d3AlphaDecay={0.02}
                cooldownTicks={180}
                warmupTicks={0} // Start from clean pre-computed radial positions

                // Forces to fix central node


                onNodeHover={(node: any) => {
                    // Skip interaction for hidden L2 nodes
                    if (!showLevel2 && node?.level === 2) {
                        setHoveredNode(null);
                        if (containerRef.current) {
                            containerRef.current.style.cursor = 'default';
                        }
                        return;
                    }
                    setHoveredNode(node || null);
                    if (containerRef.current) {
                        containerRef.current.style.cursor = node ? 'pointer' : 'default';
                    }
                }}

                onNodeClick={(node: any) => {
                    // Skip click for hidden L2 nodes
                    if (!showLevel2 && node?.level === 2) return;
                    if (onNodeClick) {
                        onNodeClick(node.id);
                    }
                }}

                onNodeDrag={(node: any) => {
                    // Prevent dragging hidden L2 nodes by resetting their position
                    if (!showLevel2 && node?.level === 2) {
                        return false;
                    }
                }}

                onNodeDragEnd={(node: any) => {
                    // Only fix node position if lockNodeOnDrag is enabled
                    if (settings.lockNodeOnDrag && node) {
                        node.fx = node.x;
                        node.fy = node.y;
                    }
                }}

                nodeCanvasObject={(node, ctx, globalScale) => {
                    // Visibility check
                    if (!showLevel2 && node.level === 2) return;

                    const x = node.x ?? 0;
                    const y = node.y ?? 0;
                    const time = Date.now() / 1000;

                    // Fix central node position
                    if (node.level === 0) {
                        node.fx = 0;
                        node.fy = 0;
                    }

                    const isHovered = Boolean(hoveredNode && getGraphNodeId(hoveredNode.id) === getGraphNodeId(node.id));
                    const isNeighbor = isGraphNeighbor(hoveredNode, node, data.links);
                    const focusAlpha = hoveredNode && !isHovered && !isNeighbor && node.level !== 0 ? 0.25 : 1;

                    const scale = isHovered ? 1.3 : isNeighbor ? 1.15 : 1;
                    const pulse = node.level === 0 ? Math.sin(time + (node.val || 0)) * 0.15 + 1 : 1;
                    ctx.save();
                    ctx.globalAlpha = focusAlpha;

                    // Central Node - Dominant & Fixed
                    if (node.level === 0) {
                        // Multi-pass ethereal outer glow
                        const gradient = ctx.createRadialGradient(x, y, 0, x, y, node.val * 3.2 * pulse);
                        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.45)');
                        gradient.addColorStop(0.4, 'rgba(139, 92, 246, 0.2)');
                        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                        ctx.fillStyle = gradient;
                        ctx.beginPath();
                        ctx.arc(x, y, node.val * 3.2 * pulse, 0, 2 * Math.PI);
                        ctx.fill();

                        // Rotating cyber orbital dashed ring
                        ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)';
                        ctx.lineWidth = 1.5 / globalScale;
                        ctx.setLineDash([5 / globalScale, 5 / globalScale]);
                        ctx.lineDashOffset = -(time * 18);
                        ctx.beginPath();
                        ctx.arc(x, y, node.val * 1.45 * scale, 0, 2 * Math.PI);
                        ctx.stroke();
                        ctx.setLineDash([]); // Reset dash

                        // Core with luminous depth
                        ctx.fillStyle = '#ffffff';
                        if (!isMobile) {
                            ctx.shadowColor = '#60a5fa';
                            ctx.shadowBlur = 18 * pulse;
                        }
                        ctx.beginPath();
                        ctx.arc(x, y, node.val * 0.85 * scale, 0, 2 * Math.PI);
                        ctx.fill();
                        if (!isMobile) {
                            ctx.shadowBlur = 0;
                        }

                        // Colored inner ring
                        ctx.strokeStyle = node.color || '#3b82f6';
                        ctx.lineWidth = 2.5 / globalScale;
                        ctx.beginPath();
                        ctx.arc(x, y, node.val * 1.1 * scale, 0, 2 * Math.PI);
                        ctx.stroke();

                    } else {
                        // Level 1 & 2 nodes - Visual hierarchy
                        // Level 1: Direct connections (Larger)
                        // Level 2: Secondary connections (Smaller)
                        const isLevel1 = node.level === 1;

                        // Size multipliers from settings
                        const sizeMultiplier = isLevel1 ? settings.level1Size : settings.level2Size;
                        const brightness = isLevel1 ? 0.8 : 0.4;
                        const glowSize = isLevel1 ? 4.0 : 2.5;

                        // Glow
                        const gradient = ctx.createRadialGradient(x, y, 0, x, y, node.val * glowSize * scale * sizeMultiplier);
                        const nodeColor = node.color || '#fff';
                        gradient.addColorStop(0, nodeColor);
                        gradient.addColorStop(1, 'rgba(0,0,0,0)');
                        ctx.globalAlpha = focusAlpha * brightness * (isHovered || isNeighbor ? 1.2 : 1);
                        ctx.fillStyle = gradient;
                        ctx.beginPath();
                        ctx.arc(x, y, node.val * glowSize * scale * sizeMultiplier, 0, 2 * Math.PI);
                        ctx.fill();

                        // Core
                        ctx.fillStyle = nodeColor;
                        ctx.beginPath();
                        ctx.arc(x, y, node.val * 0.9 * scale * sizeMultiplier, 0, 2 * Math.PI);
                        ctx.fill();

                        // Inner highlight
                        ctx.fillStyle = '#fff';
                        ctx.beginPath();
                        ctx.arc(x, y, node.val * 0.35 * scale * sizeMultiplier, 0, 2 * Math.PI);
                        ctx.fill();
                    }

                    // Label drawing moved to onRenderFramePost to ensure top layer z-index
                    ctx.restore();
                }}




                linkCanvasObject={(link, ctx, globalScale) => {
                    const start = link.source as any;
                    const end = link.target as any;

                    if (typeof start !== 'object' || typeof end !== 'object') return;

                    // Visibility check - hide links to Level 2 nodes if toggled off
                    if (!showLevel2 && (start.level === 2 || end.level === 2)) return;

                    const hoveredId = getGraphNodeId(hoveredNode?.id);
                    const startId = getGraphNodeId(start.id);
                    const endId = getGraphNodeId(end.id);
                    const isHighlighted = Boolean(hoveredId && (startId === hoveredId || endId === hoveredId));
                    const isRelated = Boolean(hoveredId && (isHighlighted || isGraphLinkBetween(link, hoveredId, startId || '') || isGraphLinkBetween(link, hoveredId, endId || '')));

                    // Use the link's assigned color (based on meaning)
                    // If no color, fallback to a default
                    const linkColor = link.color || '#555';

                    ctx.save();
                    ctx.strokeStyle = linkColor;
                    ctx.lineWidth = (isHighlighted ? 2.5 : 1.5) / globalScale;
                    ctx.globalAlpha = hoveredNode && !isRelated ? 0.25 : (isHighlighted ? 0.9 : 0.6);
                    ctx.beginPath();
                    ctx.moveTo(start.x, start.y);
                    ctx.lineTo(end.x, end.y);
                    ctx.stroke();
                    ctx.restore();
                }}

                // Particle and Label rendering
                onRenderFramePost={(ctx: any, globalScale: number) => {
                    // 1. Draw labels (on top of nodes)
                    data.nodes.forEach((node: any) => {
                        if (!showLevel2 && node.level === 2) return;
                        const x = node.x ?? 0;
                        const y = node.y ?? 0;
                        const isHovered = Boolean(hoveredNode && getGraphNodeId(hoveredNode.id) === getGraphNodeId(node.id));
                        const isNeighbor = isGraphNeighbor(hoveredNode, node, data.links);
                        const focusAlpha = hoveredNode && !isHovered && !isNeighbor && node.level !== 0 ? 0.25 : 1;

                        // Check if we should show the combined tooltip
                        const showCombinedTooltip = globalShowHoverTooltip && showGraphTooltip && isHovered;

                        if (showCombinedTooltip) {
                            // Update tooltip position via ref for performance
                            if (tooltipRef.current && fgRef.current) {
                                const coords = fgRef.current.graph2ScreenCoords(x, y);
                                // Offset to be above the node
                                const screenY = coords.y - (node.val * 1.5 * globalScale) - 10;
                                tooltipRef.current.style.left = `${coords.x}px`;
                                tooltipRef.current.style.top = `${screenY}px`;
                                tooltipRef.current.style.transform = 'translate(-50%, -100%)';
                            }

                        } else if (node.level === 0 || node.level === 1 || isHovered || isNeighbor || globalScale > 2.2) {
                            // Standard Label Drawing (Clean celestial typography)
                            let labelOffsetMultiplier = 1.2;
                            if (node.level === 0) labelOffsetMultiplier = 1.5;
                            else if (node.level === 1) labelOffsetMultiplier = 1.4;
                            else labelOffsetMultiplier = 1.2;

                            let fontSize = 12 / globalScale;
                            if (node.level === 0) fontSize = 16 / globalScale;
                            else if (node.level === 1) fontSize = settings.level1FontSize / globalScale;
                            else fontSize = settings.level2FontSize / globalScale;
                            const labelPadding = 4 / globalScale;

                            let labelX = x;
                            let labelY = y;

                            if (node.level === 0) {
                                labelY = y + node.val * labelOffsetMultiplier + fontSize;
                            } else {
                                const angle = Math.atan2(y, x);
                                const distance = node.val * labelOffsetMultiplier + fontSize;
                                labelX = x + Math.cos(angle) * distance;
                                labelY = y + Math.sin(angle) * distance;
                            }

                            const label = String(node.name || '');
                            const rawTrans = firstTranslation(node.translation);
                            const hasCn = node.level === 1 && rawTrans.length > 0 && rawTrans.length <= 8 && /[\u4e00-\u9fff]/.test(rawTrans);
                            const englishFont = `${node.level === 0 ? '700 ' : '600 '}${fontSize}px "Inter", -apple-system, sans-serif`;
                            const chineseFont = `${Math.max(8, fontSize * 0.82)}px "Inter", -apple-system, sans-serif`;
                            ctx.save();
                            ctx.globalAlpha = focusAlpha;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.font = englishFont;
                            const englishWidth = ctx.measureText(label).width;
                            const chineseWidth = hasCn ? (() => { ctx.font = chineseFont; return ctx.measureText(rawTrans).width; })() : 0;
                            const textWidth = Math.max(englishWidth, chineseWidth);
                            const lineHeight = fontSize * 1.2;
                            const textHeight = hasCn ? lineHeight * 2 : lineHeight;
                            const padX = Math.max(6 / globalScale, labelPadding * 1.5);
                            const padY = Math.max(3 / globalScale, labelPadding * 0.8);
                            const boxW = textWidth + padX * 2;
                            const boxH = textHeight + padY * 2;
                            const boxX = labelX - boxW / 2;
                            const boxY = labelY - boxH / 2;
                            const radius = Math.min(6 / globalScale, boxH / 3);

                            // Smooth rounded pill backdrop (Cyber Glass)
                            ctx.beginPath();
                            if (typeof ctx.roundRect === 'function') {
                                ctx.roundRect(boxX, boxY, boxW, boxH, radius);
                            } else {
                                ctx.rect(boxX, boxY, boxW, boxH);
                            }

                            if (node.level === 0) {
                                ctx.fillStyle = 'rgba(10, 15, 30, 0.88)';
                                ctx.fill();
                                ctx.strokeStyle = 'rgba(96, 165, 250, 0.6)';
                                ctx.lineWidth = 1.2 / globalScale;
                                ctx.stroke();
                            } else if (isHovered) {
                                ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
                                ctx.fill();
                                ctx.strokeStyle = node.color || 'rgba(56, 189, 248, 0.8)';
                                ctx.lineWidth = 1.5 / globalScale;
                                ctx.stroke();
                            } else if (node.level === 1) {
                                ctx.fillStyle = 'rgba(8, 12, 22, 0.78)';
                                ctx.fill();
                                ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
                                ctx.lineWidth = 1 / globalScale;
                                ctx.stroke();
                            } else {
                                ctx.fillStyle = 'rgba(5, 5, 10, 0.7)';
                                ctx.fill();
                                ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
                                ctx.lineWidth = 1 / globalScale;
                                ctx.stroke();
                            }

                            ctx.font = englishFont;
                            ctx.fillStyle = node.level === 0 ? '#60a5fa' : '#ffffff';
                            ctx.fillText(label, labelX, hasCn ? labelY - lineHeight * 0.42 : labelY);
                            if (hasCn) {
                                ctx.font = chineseFont;
                                ctx.fillStyle = isHovered ? '#38bdf8' : '#94a3b8';
                                ctx.fillText(rawTrans, labelX, labelY + lineHeight * 0.55);
                            }
                            ctx.restore();
                        }
                    });

                    // 2. Draw particles
                    particles.forEach(p => {
                        ctx.save();
                        ctx.fillStyle = p.color;
                        ctx.globalAlpha = p.opacity;
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, p.size / globalScale, 0, 2 * Math.PI);
                        ctx.fill();

                        // Update particle position
                        p.x += p.vx;
                        p.y += p.vy;

                        // Wrap around expanded bounds (3x viewport)
                        const boundX = dimensions.width * 1.5;
                        const boundY = dimensions.height * 1.5;
                        if (p.x > boundX) p.x = -boundX;
                        if (p.x < -boundX) p.x = boundX;
                        if (p.y > boundY) p.y = -boundY;
                        if (p.y < -boundY) p.y = boundY;
                        ctx.restore();
                    });
                }}
            />
            {/* HTML Overlay Tooltip */}
            {globalShowHoverTooltip && showGraphTooltip && hoveredNode && (
                <div ref={tooltipRef} className="absolute pointer-events-none z-50" style={{ left: 0, top: 0 }}>
                    <WordTooltip
                        word={(hoveredNode as any).name}
                        phonetic={(hoveredNode as any).phonetic}
                        translation={(hoveredNode as any).translation}
                    />
                </div>
            )}
        </div>
    );
}
