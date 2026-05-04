'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { GraphData } from '@/lib/data';
import { useSettings } from '@/context/SettingsContext';
import { useTranslations } from 'next-intl';
import WordTooltip from './WordTooltip';
import { RefreshCw, Maximize2, Settings2, Eye, EyeOff, ZoomIn, ZoomOut, Settings, X } from 'lucide-react';
import { forceCollide } from 'd3-force';

// Dynamically import ForceGraph2D with no SSR
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
    ssr: false,
    loading: () => <div className="text-neutral-400">Loading graph...</div>
});

interface FissionGraphProps {
    word: string | null;
    onNodeClick?: (node: any) => void;
    mode?: 'dashboard' | 'immersive';
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
    collisionRadius: number;
    lockNodeOnDrag: boolean;
    showHoverTooltip: boolean;
}

const defaultGraphSettings: GraphSettings = {
    level1Size: 1.0,
    level2Size: 0.6,
    level1FontSize: 12,
    level2FontSize: 9,
    chargeStrength: -4000, // Balanced repulsion - not too strong
    level1LinkDistance: 180, // Closer to center
    level2LinkDistance: 100, // Compact but readable
    collisionRadius: 40, // Prevents overlap without pushing too far
    lockNodeOnDrag: false,
    showHoverTooltip: true,
};

export default function FissionGraph({ word, onNodeClick, mode = 'dashboard' }: FissionGraphProps) {
    const { showHoverTooltip: globalShowHoverTooltip, showGraphTooltip } = useSettings();
    const t = useTranslations();
    const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
    // Initialize with 0 to ensure we wait for actual container dimensions
    const [dimensions, setDimensions] = useState({
        width: 0,
        height: 0
    });
    const [hoveredNode, setHoveredNode] = useState<any>(null);
    const [particles, setParticles] = useState<Particle[]>([]);
    const [showSettings, setShowSettings] = useState(false);
    const [showLevel2, setShowLevel2] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [uiSettings, setUiSettings] = useState<GraphSettings>({ ...defaultGraphSettings });
    const [settings, setSettings] = useState<GraphSettings>({ ...defaultGraphSettings });

    const resetToDefaults = () => {
        setUiSettings({ ...defaultGraphSettings });
        setSettings({ ...defaultGraphSettings });
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
                const res = await fetch(`/api/fission?word=${word}`);
                const graphData = await res.json();

                setData(graphData);
            } catch (error) {
                console.error('Failed to fetch graph data', error);
            } finally {
                setTimeout(() => setIsLoading(false), 100);
            }
        };

        fetchData();
    }, [word, refreshKey]);

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const { width, height } = containerRef.current.getBoundingClientRect();
                if (width > 0 && height > 0) {
                    setDimensions({ width, height });
                }
            }
        };

        // Multiple measurement attempts to catch panel sizing
        updateDimensions();
        const timer1 = setTimeout(updateDimensions, 50);
        const timer2 = setTimeout(updateDimensions, 150);
        const timer3 = setTimeout(updateDimensions, 300);

        // Safety fallback: If still 0 after 800ms, try one last measure or use safe default
        // Do NOT use window.innerWidth as it breaks dashboard panel centering
        const safetyTimer = setTimeout(() => {
            setDimensions(prev => {
                if (prev.width === 0) {
                    const currentWidth = containerRef.current?.clientWidth || 0;
                    const currentHeight = containerRef.current?.clientHeight || 0;

                    // If we can read container size, use it
                    if (currentWidth > 0) {
                        return { width: currentWidth, height: currentHeight };
                    }

                    // Context-aware fallback
                    // Immersive: Use full window width
                    // Dashboard: Use safe panel width (400px)
                    const fallbackWidth = mode === 'immersive' && typeof window !== 'undefined'
                        ? window.innerWidth
                        : 400;

                    const fallbackHeight = typeof window !== 'undefined' ? window.innerHeight : 600;

                    return {
                        width: fallbackWidth,
                        height: fallbackHeight
                    };
                }
                return prev;
            });
        }, 800);

        // ResizeObserver for ongoing updates
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    setDimensions({ width, height });
                }
            }
        });

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        // Window resize backup
        window.addEventListener('resize', updateDimensions);

        // Keyboard shortcut for toggling Level 2
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'h' && !e.repeat && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
                setShowLevel2(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
            clearTimeout(timer3);
            clearTimeout(safetyTimer);
            observer.disconnect();
            window.removeEventListener('resize', updateDimensions);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    // Auto-fit graph to viewport when data or dimensions change
    useEffect(() => {
        if (fgRef.current && data.nodes.length > 0 && dimensions.width > 0) {
            // Debounce the zoom to fit to avoid jitter during resize
            // Debounce the zoom to fit to avoid jitter during resize
            // Auto-fit with conditional logic to avoid "bounce"
            const timer = setTimeout(() => {
                if (fgRef.current) {
                    if (data.nodes.length < 5) {
                        // Small graph: Directly set comfortable zoom and center
                        fgRef.current.centerAt(0, 0, 500);
                        fgRef.current.zoom(1.2, 500);
                    } else {
                        // Large graph: Use auto-fit
                        fgRef.current.zoomToFit(500, 60);
                    }
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [data, dimensions]);

    // Update forces when settings change
    useEffect(() => {
        if (fgRef.current) {
            fgRef.current.d3Force('charge')?.strength(settings.chargeStrength);
            fgRef.current.d3Force('center')?.strength(0.05);

            // Dynamic link distance based on target node level
            fgRef.current.d3Force('link')?.distance((link: any) => {
                // Check target level. If target is level 1, use level1LinkDistance
                // If target is level 2, use level2LinkDistance
                if (link.target.level === 1) return settings.level1LinkDistance;
                return settings.level2LinkDistance;
            });

            // Add collision force to strictly prevent overlap
            // Radius calculation: nodeVal * scale + padding
            // We use a slightly larger radius to ensure labels also have some space
            fgRef.current.d3Force('collide', forceCollide((node: any) => {
                const scale = node.level === 0 ? 1.5 : (node.level === 1 ? settings.level1Size : settings.level2Size);
                const baseRadius = node.val * scale;
                // Dynamic collision radius from settings
                const textWidth = (node.name?.length || 0) * 8;
                return Math.max(baseRadius + settings.collisionRadius, textWidth / 2 + settings.collisionRadius * 0.7);
            }).strength(1.0).iterations(8)); // More iterations for better collision resolution

            // Note: react-force-graph-2d doesn't expose d3 directly in this scope easily for creating new forces
            // But we can use the internal engine. 
            // Actually, we can just set the force if we had the d3 reference.
            // Since we don't have d3 imported, we rely on the graph's internal d3 instance if exposed, 
            // or we just tune the existing forces better.

            // However, we can try to inject a collision force if the library supports it via a prop or if we import d3-force.
            // For now, let's rely on the massive charge strength increase (-1000) which should be sufficient.
            // If we really need collision, we'd need to import d3-force. 
            // Let's stick to the charge strength first as it's the primary factor for "clustering".

            // Gentle reheat - don't restart from scratch
            fgRef.current.d3ReheatSimulation();

            // Auto-center after a short delay to let simulation settle
            setTimeout(() => {
                if (fgRef.current && data.nodes.length > 0) {
                    fgRef.current.zoomToFit(400, 80);
                }
            }, 300);
        }
    }, [settings.chargeStrength, settings.level1LinkDistance, settings.level2LinkDistance, settings.collisionRadius]);

    // Initialize particle system - expanded coverage
    useEffect(() => {
        if (dimensions.width === 0) return;

        const particleCount = 200;
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
    }, [dimensions]);

    const handleRefresh = () => {
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

            {/* Controls */}
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

            {/* Settings Panel */}
            {showSettings && (
                <div className="absolute top-4 right-16 z-20 w-64 bg-neutral-900/95 backdrop-blur-md border border-neutral-800 rounded-xl p-4 shadow-2xl">
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

            {/* Floating Legend */}
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

            {/* Loading state while measuring container */}
            {dimensions.width === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-neutral-500 animate-pulse">{t('graph.initializing')}</div>
                </div>
            )}

            {/* Graph renders only after we have actual dimensions */}
            {dimensions.width > 0 && (
                <ForceGraph2D
                    key={`${mode}-${word}-${refreshKey}`} // Unique key per view mode and refreshKey
                    ref={fgRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    graphData={data}
                    nodeLabel={() => ''}
                    nodeColor="color"
                    nodeVal={(node: any) => node.level === 0 ? 12 : 4} // Reduced from 24/8 to 12/4

                    // Make hidden L2 nodes non-interactive by returning empty pointer area
                    nodePointerAreaPaint={(node: any, color, ctx) => {
                        if (!showLevel2 && node.level === 2) return; // No interaction area for hidden L2 nodes
                        const size = node.level === 0 ? 12 : 4;
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
                        ctx.fill();
                    }}

                    linkColor="color"
                    linkWidth={1.5}
                    backgroundColor="#000000"

                    // Advanced physics for organic movement
                    d3VelocityDecay={0.15}
                    d3AlphaDecay={0.015}
                    cooldownTicks={100}
                    warmupTicks={100} // Pre-warm enabled for stability

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
                        // Prevent dragging hidden L2 nodes
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

                        const label = node.name;
                        const x = node.x ?? 0;
                        const y = node.y ?? 0;
                        const time = Date.now() / 1000;

                        // Fix central node position
                        if (node.level === 0) {
                            node.fx = 0;
                            node.fy = 0;
                        }

                        const isHovered = hoveredNode && hoveredNode.id === node.id;
                        const isNeighbor = hoveredNode && data.links.some((link: any) =>
                            (link.source === hoveredNode.id && link.target === node.id) ||
                            (link.target === hoveredNode.id && link.source === node.id)
                        );

                        const scale = isHovered ? 1.3 : isNeighbor ? 1.15 : 1;
                        const pulse = node.level === 0 ? Math.sin(time + (node.val || 0)) * 0.15 + 1 : 1;

                        // Central Node - Dominant & Fixed
                        if (node.level === 0) {
                            // Reduced outer glow (pulsing)
                            const gradient = ctx.createRadialGradient(x, y, 0, x, y, node.val * 3 * pulse);
                            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
                            gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.2)');
                            gradient.addColorStop(1, 'rgba(0,0,0,0)');
                            ctx.fillStyle = gradient;
                            ctx.beginPath();
                            ctx.arc(x, y, node.val * 3 * pulse, 0, 2 * Math.PI);
                            ctx.fill();

                            // Core with shadow for depth - Smaller
                            ctx.fillStyle = '#ffffff';
                            ctx.shadowColor = '#ffffff';
                            ctx.shadowBlur = 15 * pulse;
                            ctx.beginPath();
                            ctx.arc(x, y, node.val * 0.8 * scale, 0, 2 * Math.PI);
                            ctx.fill();
                            ctx.shadowBlur = 0;

                            // Colored ring - Smaller
                            ctx.strokeStyle = node.color || '#3b82f6';
                            ctx.lineWidth = 3 / globalScale;
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
                            ctx.globalAlpha = brightness * (isHovered || isNeighbor ? 1.2 : 1);
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
                            ctx.globalAlpha = 1;
                        }
                    }}

                    linkCanvasObject={(link, ctx, globalScale) => {
                        const start = link.source as any;
                        const end = link.target as any;

                        if (typeof start !== 'object' || typeof end !== 'object') return;

                        // Visibility check - hide links to Level 2 nodes if toggled off
                        if (!showLevel2 && (start.level === 2 || end.level === 2)) return;

                        const isHighlighted = hoveredNode && (
                            start.id === hoveredNode.id || end.id === hoveredNode.id
                        );

                        // Use the link's assigned color (based on meaning)
                        // If no color, fallback to a default
                        const linkColor = link.color || '#555';

                        ctx.strokeStyle = linkColor;
                        ctx.lineWidth = (isHighlighted ? 2.5 : 1.5) / globalScale;
                        ctx.globalAlpha = isHighlighted ? 0.9 : 0.6;
                        ctx.beginPath();
                        ctx.moveTo(start.x, start.y);
                        ctx.lineTo(end.x, end.y);
                        ctx.stroke();
                        ctx.globalAlpha = 1;
                    }}



                    // Particle rendering
                    onRenderFramePost={(ctx: any, globalScale: number) => {
                        // 1. Draw labels (on top of nodes)
                        data.nodes.forEach((node: any) => {
                            // Visibility check
                            if (!showLevel2 && node.level === 2) return;

                            const x = node.x ?? 0;
                            const y = node.y ?? 0;

                            // Interaction state
                            const isHovered = hoveredNode && hoveredNode.id === node.id;

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
                            } else if (node.level < 2 || globalScale > 1.2 || isHovered) {
                                // Standard Label Drawing (Fallback)
                                // Dynamic font size based on hierarchy and settings
                                // Dynamic label offset based on node size
                                let labelOffsetMultiplier = 1.2;
                                if (node.level === 0) labelOffsetMultiplier = 1.5;
                                else if (node.level === 1) labelOffsetMultiplier = 1.4;
                                else labelOffsetMultiplier = 1.2;

                                let fontSize = 12 / globalScale;
                                if (node.level === 0) fontSize = 16 / globalScale;
                                else if (node.level === 1) fontSize = settings.level1FontSize / globalScale;
                                else fontSize = settings.level2FontSize / globalScale;
                                const labelPadding = 4 / globalScale;

                                // Radial Positioning Logic
                                let labelX = x;
                                let labelY = y;

                                if (node.level === 0) {
                                    // Central node: Keep label below
                                    labelY = y + node.val * labelOffsetMultiplier + fontSize;
                                } else {
                                    // Satellite nodes: Position radially outward from center (0,0)
                                    const angle = Math.atan2(y, x);
                                    const distance = node.val * labelOffsetMultiplier + fontSize;

                                    labelX = x + Math.cos(angle) * distance;
                                    labelY = y + Math.sin(angle) * distance;
                                }

                                ctx.font = `${node.level === 0 ? 'bold ' : ''}${fontSize}px "Inter", -apple-system, sans-serif`;
                                const label = node.name;
                                const textMetrics = ctx.measureText(label);
                                const textWidth = textMetrics.width;
                                const textHeight = fontSize * 1.2;

                                // Semi-transparent background box
                                ctx.fillStyle = 'rgba(0, 0, 0, 1)'; // Fully opaque for maximum legibility
                                ctx.fillRect(
                                    labelX - textWidth / 2 - labelPadding,
                                    labelY - textHeight / 2 - labelPadding,
                                    textWidth + labelPadding * 2,
                                    textHeight + labelPadding * 2
                                );

                                // Border for definition
                                ctx.strokeStyle = node.level === 0 ? '#3b82f6' : 'rgba(255, 255, 255, 0.3)';
                                ctx.lineWidth = 1 / globalScale;
                                ctx.strokeRect(
                                    labelX - textWidth / 2 - labelPadding,
                                    labelY - textHeight / 2 - labelPadding,
                                    textWidth + labelPadding * 2,
                                    textHeight + labelPadding * 2
                                );

                                // Text
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';
                                ctx.fillStyle = '#ffffff';
                                ctx.fillText(label, labelX, labelY);
                            }
                        });

                        // 2. Draw particles
                        particles.forEach(p => {
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
                        });
                        ctx.globalAlpha = 1;
                    }}
                />
            )}
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
