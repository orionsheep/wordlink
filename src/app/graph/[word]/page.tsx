'use client';

import { useParams, useRouter } from 'next/navigation';
import { useRef, useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { GraphData } from '@/lib/data';
import { ArrowLeft, ZoomIn, ZoomOut, Settings, X, Eye, EyeOff, RefreshCw, Maximize } from 'lucide-react';
import { forceCollide } from 'd3-force';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
    ssr: false,
    loading: () => <div className="text-neutral-400 flex items-center justify-center h-full">Loading Graph...</div>
});

function useIsMobile(breakpoint = 768) {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < breakpoint);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, [breakpoint]);
    return isMobile;
}

// Mobile-optimized defaults: larger nodes, bigger fonts, fewer particles
const mobileGraphSettings = {
    level1Size: 2.8,
    level2Size: 1.4,
    level1FontSize: 14,
    level2FontSize: 11,
    chargeStrength: -3000,
    level1LinkDistance: 140,
    level2LinkDistance: 80,
    collisionRadius: 50,
};

// Smaller screen defaults: tighter layout for 375px screens
const smallScreenSettings = {
    ...mobileGraphSettings,
    level1Size: 2.4,
    level2Size: 1.2,
    chargeStrength: -2000,
    level1LinkDistance: 100,
    level2LinkDistance: 60,
    collisionRadius: 35,
};

export default function MobileGraphPage() {
    const params = useParams();
    const router = useRouter();
    const word = params.word as string;
    const decodedWord = decodeURIComponent(word);
    const isMobile = useIsMobile();
    const isSmallScreen = useIsMobile(400);

    const [data, setData] = useState<GraphData>({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);
    const [showLevel2, setShowLevel2] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [settings, setSettings] = useState({ ...mobileGraphSettings });
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    const containerRef = useRef<HTMLDivElement>(null);
    const fgRef = useRef<any>(null);

    // Adjust defaults for small screens
    useEffect(() => {
        if (isSmallScreen) {
            setSettings(prev => ({ ...prev, ...smallScreenSettings }));
        }
    }, [isSmallScreen]);

    // Fetch graph data
    useEffect(() => {
        if (!decodedWord) return;
        setLoading(true);
        fetch(`/api/fission?word=${encodeURIComponent(decodedWord)}`)
            .then(res => res.json())
            .then(graphData => setData(graphData))
            .catch(err => console.error('Failed to fetch graph data', err))
            .finally(() => setTimeout(() => setLoading(false), 100));
    }, [decodedWord, refreshKey]);

    // Measure container
    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const { width, height } = containerRef.current.getBoundingClientRect();
                setDimensions({ width, height });
            }
        };
        updateDimensions();
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                setDimensions({ width, height });
            }
        });
        if (containerRef.current) observer.observe(containerRef.current);
        window.addEventListener('resize', updateDimensions);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateDimensions);
        };
    }, []);

    // Auto-fit graph when data changes
    useEffect(() => {
        if (fgRef.current && data.nodes.length > 0) {
            fgRef.current.d3ReheatSimulation();
            setTimeout(() => {
                if (data.nodes.length < 5) {
                    fgRef.current?.centerAt(0, 0, 500);
                    fgRef.current?.zoom(1.0, 500);
                } else {
                    fgRef.current?.zoomToFit(500, 80);
                }
            }, 300);
        }
    }, [data]);

    // Update forces when settings change
    useEffect(() => {
        if (!fgRef.current) return;
        fgRef.current.d3Force('charge')?.strength(settings.chargeStrength);
        fgRef.current.d3Force('center')?.strength(0.05);
        fgRef.current.d3Force('link')?.distance((link: any) => {
            if (link.target.level === 1) return settings.level1LinkDistance;
            return settings.level2LinkDistance;
        });
        fgRef.current.d3Force('collide', forceCollide((node: any) => {
            const scale = node.level === 0 ? 1.5 : (node.level === 1 ? settings.level1Size : settings.level2Size);
            const baseRadius = node.val * scale;
            const textWidth = (node.name?.length || 0) * 8;
            return Math.max(baseRadius + settings.collisionRadius, textWidth / 2 + settings.collisionRadius * 0.7);
        }).strength(1.0).iterations(8));
        fgRef.current.d3ReheatSimulation();
    }, [settings]);

    const handleZoomIn = useCallback(() => fgRef.current?.zoom(fgRef.current.zoom() * 1.5, 400), []);
    const handleZoomOut = useCallback(() => fgRef.current?.zoom(fgRef.current.zoom() / 1.5, 400), []);
    const handleFitToScreen = useCallback(() => {
        if (fgRef.current) {
            if (data.nodes.length < 5) {
                fgRef.current.centerAt(0, 0, 500);
                fgRef.current.zoom(1.0, 500);
            } else {
                fgRef.current.zoomToFit(500, isSmallScreen ? 40 : 80);
            }
        }
    }, [data.nodes.length, isSmallScreen]);

    const handleNodeClick = (node: any) => {
        if (!showLevel2 && node?.level === 2) return;
        router.push(`/word/${encodeURIComponent(node.id)}`);
    };

    return (
        <div className="h-screen w-screen bg-black flex flex-col overflow-hidden">
            {/* Sticky Header */}
            <header className="sticky top-0 z-30 bg-black/95 backdrop-blur-md border-b border-neutral-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
                <button
                    onClick={() => router.back()}
                    className="p-2 -ml-2 rounded-lg active:bg-neutral-800 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="Go back"
                >
                    <ArrowLeft size={22} className="text-neutral-300" />
                </button>
                <h1 className="text-lg font-bold text-white truncate mx-3 flex-1 text-center">{decodedWord}</h1>
                <button
                    onClick={() => setShowSettings(!showSettings)}
                    className={`p-2 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${
                        showSettings ? 'bg-blue-600 text-white' : 'active:bg-neutral-800'
                    }`}
                    aria-label="Settings"
                >
                    <Settings size={22} className={showSettings ? 'text-white' : 'text-neutral-300'} />
                </button>
            </header>

            {/* Graph Container */}
            <div ref={containerRef} className="flex-1 relative overflow-hidden" style={{ touchAction: 'none' }}>
                {loading ? (
                    <div className="flex items-center justify-center h-full text-neutral-400">Loading graph...</div>
                ) : (
                    <>
                        <ForceGraph2D
                            key={`mobile-${decodedWord}-${refreshKey}`}
                            ref={fgRef}
                            width={dimensions.width}
                            height={dimensions.height}
                            graphData={data}
                            nodeLabel={() => ''}
                            nodeColor="color"
                            nodeVal={(node: any) => node.level === 0 ? 24 : 8}
                            nodePointerAreaPaint={(node: any, color, ctx) => {
                                if (!showLevel2 && node.level === 2) return;
                                // Enlarged touch targets for mobile tapping
                                const size = node.level === 0 ? 36 : 20;
                                ctx.fillStyle = color;
                                ctx.beginPath();
                                ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
                                ctx.fill();
                            }}
                            linkColor="color"
                            linkWidth={2}
                            backgroundColor="#000000"
                            d3VelocityDecay={0.3}
                            d3AlphaDecay={0.03}
                            cooldownTicks={50}
                            warmupTicks={50}
                            onNodeClick={handleNodeClick}
                            onNodeHover={(node: any) => {
                                if (!showLevel2 && node?.level === 2) return;
                                if (containerRef.current) {
                                    containerRef.current.style.cursor = node ? 'pointer' : 'default';
                                }
                            }}
                            nodeCanvasObject={(node, ctx, globalScale) => {
                                if (!showLevel2 && node.level === 2) return;
                                const x = node.x ?? 0;
                                const y = node.y ?? 0;
                                const time = Date.now() / 1000;

                                if (node.level === 0) {
                                    node.fx = 0;
                                    node.fy = 0;
                                    const pulse = Math.sin(time) * 0.15 + 1;
                                    const gradient = ctx.createRadialGradient(x, y, 0, x, y, node.val * 3 * pulse);
                                    gradient.addColorStop(0, 'rgba(255,255,255,0.4)');
                                    gradient.addColorStop(0.3, 'rgba(255,255,255,0.2)');
                                    gradient.addColorStop(1, 'rgba(0,0,0,0)');
                                    ctx.fillStyle = gradient;
                                    ctx.beginPath();
                                    ctx.arc(x, y, node.val * 3 * pulse, 0, 2 * Math.PI);
                                    ctx.fill();

                                    ctx.fillStyle = '#ffffff';
                                    ctx.beginPath();
                                    ctx.arc(x, y, node.val * 0.8, 0, 2 * Math.PI);
                                    ctx.fill();

                                    ctx.strokeStyle = node.color || '#3b82f6';
                                    ctx.lineWidth = 3 / globalScale;
                                    ctx.beginPath();
                                    ctx.arc(x, y, node.val * 1.1, 0, 2 * Math.PI);
                                    ctx.stroke();
                                } else {
                                    const isLevel1 = node.level === 1;
                                    const sizeMultiplier = isLevel1 ? settings.level1Size : settings.level2Size;
                                    const brightness = isLevel1 ? 0.8 : 0.4;
                                    const glowSize = isLevel1 ? 4.0 : 2.5;
                                    const nodeColor = node.color || '#fff';

                                    const gradient = ctx.createRadialGradient(x, y, 0, x, y, node.val * glowSize * sizeMultiplier);
                                    gradient.addColorStop(0, nodeColor);
                                    gradient.addColorStop(1, 'rgba(0,0,0,0)');
                                    ctx.globalAlpha = brightness;
                                    ctx.fillStyle = gradient;
                                    ctx.beginPath();
                                    ctx.arc(x, y, node.val * glowSize * sizeMultiplier, 0, 2 * Math.PI);
                                    ctx.fill();

                                    ctx.fillStyle = nodeColor;
                                    ctx.beginPath();
                                    ctx.arc(x, y, node.val * 0.9 * sizeMultiplier, 0, 2 * Math.PI);
                                    ctx.fill();

                                    ctx.fillStyle = '#fff';
                                    ctx.beginPath();
                                    ctx.arc(x, y, node.val * 0.35 * sizeMultiplier, 0, 2 * Math.PI);
                                    ctx.fill();
                                    ctx.globalAlpha = 1;
                                }
                            }}
                            linkCanvasObject={(link, ctx, globalScale) => {
                                const start = link.source as any;
                                const end = link.target as any;
                                if (typeof start !== 'object' || typeof end !== 'object') return;
                                if (!showLevel2 && (start.level === 2 || end.level === 2)) return;
                                ctx.strokeStyle = link.color || '#555';
                                ctx.lineWidth = 2 / globalScale;
                                ctx.globalAlpha = 0.6;
                                ctx.beginPath();
                                ctx.moveTo(start.x, start.y);
                                ctx.lineTo(end.x, end.y);
                                ctx.stroke();
                                ctx.globalAlpha = 1;
                            }}
                            onRenderFramePost={(ctx: any, globalScale: number) => {
                                data.nodes.forEach((node: any) => {
                                    if (!showLevel2 && node.level === 2) return;
                                    const x = node.x ?? 0;
                                    const y = node.y ?? 0;

                                    let fontSize: number;
                                    if (node.level === 0) fontSize = 18 / globalScale;
                                    else if (node.level === 1) fontSize = settings.level1FontSize / globalScale;
                                    else fontSize = settings.level2FontSize / globalScale;

                                    const labelPadding = 4 / globalScale;
                                    let labelX = x;
                                    let labelY = y;

                                    if (node.level === 0) {
                                        labelY = y + node.val * 1.5 + fontSize;
                                    } else {
                                        const angle = Math.atan2(y, x);
                                        const distance = node.val * 1.3 + fontSize;
                                        labelX = x + Math.cos(angle) * distance;
                                        labelY = y + Math.sin(angle) * distance;
                                    }

                                    ctx.font = `${node.level === 0 ? 'bold ' : ''}${fontSize}px "Inter", -apple-system, sans-serif`;
                                    const label = node.name;
                                    const textMetrics = ctx.measureText(label);
                                    const textWidth = textMetrics.width;
                                    const textHeight = fontSize * 1.2;

                                    ctx.fillStyle = 'rgba(0,0,0,1)';
                                    ctx.fillRect(labelX - textWidth / 2 - labelPadding, labelY - textHeight / 2 - labelPadding, textWidth + labelPadding * 2, textHeight + labelPadding * 2);
                                    ctx.strokeStyle = node.level === 0 ? '#3b82f6' : 'rgba(255,255,255,0.3)';
                                    ctx.lineWidth = 1 / globalScale;
                                    ctx.strokeRect(labelX - textWidth / 2 - labelPadding, labelY - textHeight / 2 - labelPadding, textWidth + labelPadding * 2, textHeight + labelPadding * 2);
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'middle';
                                    ctx.fillStyle = '#ffffff';
                                    ctx.fillText(label, labelX, labelY);
                                });
                            }}
                        />

                        {/* Legend - compact on small screens */}
                        <div className={`absolute bottom-20 left-3 z-20 bg-neutral-900/90 backdrop-blur-md rounded-lg p-2 border border-neutral-800 shadow-2xl ${isSmallScreen ? 'max-w-[150px]' : 'max-w-[200px]'}`}>
                            <div className="text-[10px] font-semibold text-neutral-400 mb-1.5 uppercase tracking-wider">Connections</div>
                            <div className="flex flex-col gap-1.5">
                                {['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'].map((color, index) => {
                                    const meaningNum = (index + 1).toString();
                                    const definition = data.definitions?.[meaningNum];
                                    if (!definition && index > 2) return null;
                                    return (
                                        <div key={index} className="flex items-center gap-1.5">
                                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }}></div>
                                            <span className="text-[10px] text-neutral-400 leading-tight line-clamp-1">
                                                {definition ? definition.replace(/^SKM:.*?\|/, '') : `Type ${meaningNum}`}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}

                {/* Settings Bottom Sheet */}
                {showSettings && (
                    <div className="absolute inset-x-0 bottom-0 z-40 bg-neutral-900/98 backdrop-blur-xl border-t border-neutral-700 rounded-t-2xl p-4 pb-8 shadow-2xl animate-slide-up safe-area-bottom">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-white font-medium text-sm">Graph Settings</h3>
                            <button onClick={() => setShowSettings(false)} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
                                <X size={20} className="text-neutral-400" />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <div className="flex justify-between text-xs text-neutral-400 mb-1">
                                    <span>L1 Size</span><span>{settings.level1Size.toFixed(1)}x</span>
                                </div>
                                <input type="range" min="1.0" max="4.0" step="0.2" value={settings.level1Size}
                                    onChange={(e) => setSettings({ ...settings, level1Size: parseFloat(e.target.value) })}
                                    className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-neutral-400 mb-1">
                                    <span>L2 Size</span><span>{settings.level2Size.toFixed(1)}x</span>
                                </div>
                                <input type="range" min="0.5" max="3.0" step="0.2" value={settings.level2Size}
                                    onChange={(e) => setSettings({ ...settings, level2Size: parseFloat(e.target.value) })}
                                    className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-neutral-400 mb-1">
                                    <span>L1 Font</span><span>{settings.level1FontSize}px</span>
                                </div>
                                <input type="range" min="10" max="24" step="1" value={settings.level1FontSize}
                                    onChange={(e) => setSettings({ ...settings, level1FontSize: parseInt(e.target.value) })}
                                    className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                            </div>
                            <div>
                                <div className="flex justify-between text-xs text-neutral-400 mb-1">
                                    <span>L2 Font</span><span>{settings.level2FontSize}px</span>
                                </div>
                                <input type="range" min="8" max="18" step="1" value={settings.level2FontSize}
                                    onChange={(e) => setSettings({ ...settings, level2FontSize: parseInt(e.target.value) })}
                                    className="w-full h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                            </div>
                        </div>
                        <button
                            onClick={() => setSettings({ ...(isSmallScreen ? smallScreenSettings : mobileGraphSettings) })}
                            className="w-full mt-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg transition-colors border border-neutral-700"
                        >
                            Reset to Defaults
                        </button>
                    </div>
                )}
            </div>

            {/* Bottom Control Bar */}
            <div className="flex-shrink-0 bg-black/95 backdrop-blur-md border-t border-neutral-800 px-2 py-2 flex items-center justify-around safe-area-bottom">
                <button onClick={() => setRefreshKey(k => k + 1)}
                    className="p-3 rounded-xl active:bg-neutral-800 transition-colors min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-0.5">
                    <RefreshCw size={20} className="text-neutral-400" />
                    <span className="text-[10px] text-neutral-500">Refresh</span>
                </button>
                <button onClick={handleZoomIn}
                    className="p-3 rounded-xl active:bg-neutral-800 transition-colors min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-0.5">
                    <ZoomIn size={20} className="text-neutral-400" />
                    <span className="text-[10px] text-neutral-500">Zoom+</span>
                </button>
                <button onClick={handleZoomOut}
                    className="p-3 rounded-xl active:bg-neutral-800 transition-colors min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-0.5">
                    <ZoomOut size={20} className="text-neutral-400" />
                    <span className="text-[10px] text-neutral-500">Zoom-</span>
                </button>
                <button onClick={handleFitToScreen}
                    className="p-3 rounded-xl active:bg-neutral-800 transition-colors min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-0.5">
                    <Maximize size={20} className="text-neutral-400" />
                    <span className="text-[10px] text-neutral-500">Fit</span>
                </button>
                <button onClick={() => setShowLevel2(!showLevel2)}
                    className={`p-3 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 ${!showLevel2 ? 'bg-blue-600/20' : 'active:bg-neutral-800'}`}>
                    {showLevel2 ? <Eye size={20} className="text-neutral-400" /> : <EyeOff size={20} className="text-blue-400" />}
                    <span className={`text-[10px] ${!showLevel2 ? 'text-blue-400' : 'text-neutral-500'}`}>L2</span>
                </button>
            </div>
        </div>
    );
}
