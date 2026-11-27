'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import type { ForceGraphMethods, ForceGraphProps, LinkObject, NodeObject } from 'react-force-graph-2d';
import { forceCollide, forceManyBody, forceRadial, forceSimulation, forceX, forceY } from 'd3-force';
import { ArrowLeft, Magnet, Maximize, Minus, Plus, RotateCcw } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { useTheme, type Theme } from '@/context/ThemeContext';
import WordTooltip from './WordTooltip';
import {
    GROUP_COLORS, RELATION_GROUPS, groupOf,
    type Familiarity, type GraphData, type GraphNode, type RelationGroup,
} from '@/lib/graph-shared';

function GraphLoadingFallback() {
    const t = useTranslations('graph');
    return <div className="flex h-full items-center justify-center text-sm text-neutral-500">{t('loadingGraph')}</div>;
}

// next/dynamic drops the component's generics; re-attach them so callbacks get typed nodes.
type AtlasGraphProps = ForceGraphProps<NodeObject<AtlasNode>, LinkObject<AtlasNode, AtlasLink>> & {
    ref?: React.MutableRefObject<ForceGraphMethods<NodeObject<AtlasNode>, LinkObject<AtlasNode, AtlasLink>> | undefined>;
};
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
    ssr: false,
    loading: () => <GraphLoadingFallback />,
}) as unknown as React.ComponentType<AtlasGraphProps>;

/** A window floating over the graph, in client px (a DOMRect will do). */
interface Obstacle { x: number; y: number; width: number; height: number }

interface PanelFissionGraphProps {
    word: string | null;
    onNodeClick?: (word: string) => void;
    /** "immersive" fills the screen behind floating windows, with floating controls. */
    variant?: 'panel' | 'immersive';
    /** Windows over the graph: it is framed in the largest space they leave free (see frameDodging). */
    obstacles?: readonly Obstacle[];
    /** A back control (named after `backTo` when known), so a word without neighbours is never a dead end. */
    onBack?: () => void;
    backTo?: string | null;
    /** Extra controls at the end of the toolbar. */
    actions?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Layout model. The API returns an ego network: the centre word, its direct neighbours (L1) and
// their neighbours (L2). Each L1 word belongs to one relation group; groups sit in their own
// sector around the centre, the word family hugs the centre inside a dashed bubble.
// ---------------------------------------------------------------------------

/** Neighbours shown per group before "show all". */
const GROUP_CAP = 10;
/** Second-degree words shown per neighbour. */
const L2_PER_PARENT = 3;
/** When a word is linked to the centre in several ways, the first group in this list wins. */
const GROUP_PRIORITY: RelationGroup[] = ['family', 'antonym', 'synonym', 'near_synonym', 'spelling_similar'];

const RADIUS = { center: 17, l1: 10, l2: 4.5 };
/** Simulation steps used to solve a layout. */
const LAYOUT_TICKS = 120;

// ---------------------------------------------------------------------------
// Motion. One spring drives every transition (words, camera, fades), so everything leaves and lands
// together; the layout is solved before the animation starts, so nothing moves once it has landed.
// ---------------------------------------------------------------------------

/** Critically damped spring, no overshoot (the feel of SwiftUI's default `.smooth`). */
const SPRING_RESPONSE_MS = 550;
const OMEGA = (2 * Math.PI) / SPRING_RESPONSE_MS;
/** By then the spring is within 0.05% of its target; snap to the exact end state. */
const SETTLE_MS = 900;
/** Hover emphasis rides a quicker spring of its own; during a transition it follows the transition's. */
const HOVER_RESPONSE_MS = 280;
/**
 * Fades run on the transition spring, only slightly sped up, so colour and opacity change over the same
 * stretch of time as the movement: what leaves clears out a little sooner than what arrives settles in.
 */
const EXIT_SPEED = 1.25;
const ENTER_SPEED = 1.1;
/** Screen space kept around the layout for labels and group pills. */
const FRAME_PADDING = 60;

/**
 * Offset from the target and velocity (per ms) of a critically damped spring with angular frequency
 * `omega`, `ms` after it left `offset` moving at `velocity`. Starting from the current velocity is what
 * lets a motion that interrupts another carry on without a jolt.
 */
function springStep(offset: number, velocity: number, ms: number, omega: number): [number, number] {
    const c = velocity + omega * offset;
    const e = Math.exp(-omega * ms);
    return [(offset + c * ms) * e, (velocity - omega * c * ms) * e];
}

/** The transition spring; it snaps to its end state once settled. */
function springState(offset: number, velocity: number, ms: number): [number, number] {
    return ms >= SETTLE_MS ? [0, 0] : springStep(offset, velocity, Math.max(0, ms), OMEGA);
}

/** 0 → 1 along the same spring from rest; drives fades and morphs. */
const spring = (ms: number) => 1 - springState(1, 0, ms)[0];
/** 0 → 1 from rest on a spring of another response (settled after three responses, which also covers "long ago"). */
const springTo = (ms: number, responseMs: number) =>
    (ms >= 3 * responseMs ? 1 : 1 - springStep(1, 0, Math.max(0, ms), (2 * Math.PI) / responseMs)[0]);

// With the OS "reduce motion" setting on, transitions jump straight to their end state.
const reducedMotionQuery = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined;
const reducedMotion = () => reducedMotionQuery?.matches ?? false;

interface Point { x: number; y: number }
interface Camera { x: number; y: number; k: number }

/** A word's role in the graph, which decides its size, colour and label. */
interface Look { level: 0 | 1 | 2; group: RelationGroup | null; placeholder?: boolean }

interface AtlasNode extends GraphNode {
    group: RelationGroup | null;
    parentId?: string;
    /** Order inside its group (L1) or under its parent (L2). */
    rank: number;
    ax: number;
    ay: number;
    /** Distance from the centre the layout keeps this word at. */
    ring?: number;
    /** When the word started growing in (ms); 0 = it was already on screen before. */
    born?: number;
    /** Its role in the previous graph, while it changes into the new one (clicked word → centre). */
    morph?: { from: Look; at: number };
    x?: number;
    y?: number;
    fx?: number;
    fy?: number;
}

/** How a link is drawn. */
interface LinkStyle { group: RelationGroup; level: 1 | 2; pending: boolean }

interface AtlasLink extends LinkStyle {
    source: string | AtlasNode;
    target: string | AtlasNode;
    /** When the link started fading in (ms); 0 = it was already drawn before. */
    born?: number;
    /** Its style in the previous graph, while it changes colour or weight. */
    morph?: { from: LinkStyle; at: number };
}

interface Atlas {
    centerId: string;
    nodes: AtlasNode[];
    links: AtlasLink[];
    totals: Record<RelationGroup, number>;
    /** Where the centre word sits. Graphs are built around the clicked word's current position so the view never jumps. */
    origin: Point;
}

/** A group label ("Synonyms 10/13 +") as it was on screen: centre in graph coordinates, size in screen pixels. */
interface PillShot extends Point { w: number; h: number; alpha: number; text: string; group: RelationGroup }

/** The outgoing graph when the next one arrives: where its words are, so the new graph grows out of them. */
interface Snapshot {
    positions: Map<string, Point>;
    origin: Point;
    pills: PillShot[];
}

const endpointId = (end: string | { id: string }) => (typeof end === 'object' ? end.id : end);
/** Links are matched across graphs by the pair of words they join, whichever way round. */
const pairKey = (l: { source: string | { id: string }; target: string | { id: string } }) => {
    const a = endpointId(l.source), b = endpointId(l.target);
    return a < b ? `${a}|${b}` : `${b}|${a}`;
};

function buildAtlas(data: GraphData, from: Snapshot | null): Atlas | null {
    const center = data.nodes.find((n) => n.level === 0);
    if (!center) return null;
    const origin = from?.positions.get(center.id) ?? from?.origin ?? { x: 0, y: 0 };
    // Words that are already on screen start where they are.
    const carried = (id: string): Partial<AtlasNode> => {
        const p = from?.positions.get(id);
        return p ? { x: p.x, y: p.y } : {};
    };

    const l1Group = new Map<string, RelationGroup>();
    const l2Parent = new Map<string, string>();
    for (const link of data.links) {
        const s = endpointId(link.source as string | { id: string });
        const t = endpointId(link.target as string | { id: string });
        if (s === center.id && t !== center.id) {
            const g = groupOf(link.type);
            const prev = l1Group.get(t);
            if (!prev || GROUP_PRIORITY.indexOf(g) < GROUP_PRIORITY.indexOf(prev)) l1Group.set(t, g);
        } else if (t !== center.id && !l2Parent.has(t)) {
            l2Parent.set(t, s);
        }
    }

    const byId = new Map(data.nodes.map((n) => [n.id, n]));
    const totals = Object.fromEntries(RELATION_GROUPS.map((g) => [g, 0])) as Record<RelationGroup, number>;
    const nodes: AtlasNode[] = [{
        ...center, group: null, rank: 0, ax: origin.x, ay: origin.y, ...carried(center.id),
        x: origin.x, y: origin.y, fx: origin.x, fy: origin.y,
    }];

    // Entries that exist in the dictionary first, then alphabetical.
    const l1 = [...l1Group.entries()]
        .filter(([id]) => byId.has(id))
        .sort(([a], [b]) => Number(!!byId.get(a)!.placeholder) - Number(!!byId.get(b)!.placeholder) || a.localeCompare(b));
    for (const [id, group] of l1) {
        nodes.push({ ...byId.get(id)!, level: 1, group, rank: totals[group]++, ax: 0, ay: 0, ...carried(id) });
    }

    const perParent = new Map<string, number>();
    for (const [id, parentId] of l2Parent) {
        const node = byId.get(id);
        if (!node || l1Group.has(id) || !l1Group.has(parentId)) continue;
        const rank = perParent.get(parentId) ?? 0;
        perParent.set(parentId, rank + 1);
        nodes.push({ ...node, level: 2, group: l1Group.get(parentId)!, parentId, rank, ax: 0, ay: 0, ...carried(id) });
    }

    const known = new Map(nodes.map((n) => [n.id, n]));
    const links: AtlasLink[] = [];
    const seen = new Set<string>();
    for (const link of data.links) {
        const s = endpointId(link.source as string | { id: string });
        const t = endpointId(link.target as string | { id: string });
        if (!known.has(s) || !known.has(t)) continue;
        const level = s === center.id ? 1 : 2;
        const key = `${s}|${t}`;
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({
            // Endpoints as objects, so the first frame of a new graph can draw its links before
            // the layout engine has indexed them.
            source: known.get(s)!,
            target: known.get(t)!,
            group: level === 1 ? l1Group.get(t)! : groupOf(link.type),
            level,
            pending: link.status === 'pending',
        });
    }
    return { centerId: center.id, nodes, links, totals, origin };
}

interface Visibility {
    hidden: Set<RelationGroup>;
    expanded: Set<RelationGroup>;
    secondDegree: boolean;
}

/** Nodes and links on screen, with layout anchors assigned for the visible sectors. */
function visibleGraph(atlas: Atlas, vis: Visibility) {
    const showL1 = (n: AtlasNode) => !vis.hidden.has(n.group!) && (vis.expanded.has(n.group!) || n.rank < GROUP_CAP);
    const l1 = atlas.nodes.filter((n) => n.level === 1 && showL1(n));
    const l1Ids = new Set(l1.map((n) => n.id));
    const l2 = vis.secondDegree
        ? atlas.nodes.filter((n) => n.level === 2 && n.parentId && l1Ids.has(n.parentId) && n.rank < L2_PER_PARENT)
        : [];

    const { x: ox, y: oy } = atlas.origin;
    const family = l1.filter((n) => n.group === 'family');
    const familyRadius = family.length ? Math.max(72, 8 * family.length + 44) : 0;
    family.forEach((n, i) => {
        const a = (i / family.length) * Math.PI * 2 - Math.PI / 2;
        n.ax = ox + Math.cos(a) * familyRadius;
        n.ay = oy + Math.sin(a) * familyRadius;
    });

    // Each relation group owns a sector; its words fan out on an arc (two staggered rows) so a
    // big group spreads sideways instead of piling up toward the centre.
    const sectors = RELATION_GROUPS.filter((g) => g !== 'family' && l1.some((n) => n.group === g));
    const largest = Math.max(1, ...sectors.map((g) => l1.filter((n) => n.group === g).length));
    const sectorRadius = familyRadius + 150 + 4 * largest;
    const span = sectors.length ? (Math.PI * 2) / sectors.length : 0;
    const anchors = new Map<RelationGroup, { x: number; y: number }>();
    sectors.forEach((g, i) => {
        const center = i * span - Math.PI / 3;
        anchors.set(g, { x: ox + Math.cos(center) * sectorRadius, y: oy + Math.sin(center) * sectorRadius });
        const members = l1.filter((n) => n.group === g);
        const step = Math.min(span * 0.8 / Math.max(1, members.length), 0.3);
        members.forEach((n, k) => {
            const a = center + (k - (members.length - 1) / 2) * step;
            const r = sectorRadius + (k % 2) * 44;
            n.ax = ox + Math.cos(a) * r;
            n.ay = oy + Math.sin(a) * r;
        });
    });
    const l1ById = new Map(l1.map((n) => [n.id, n]));
    for (const n of l2) {
        const parent = l1ById.get(n.parentId!)!;
        const a = Math.atan2(parent.ay - oy, parent.ax - ox) + (n.rank - (L2_PER_PARENT - 1) / 2) * 0.12;
        const r = Math.hypot(parent.ax - ox, parent.ay - oy) + 70;
        n.ax = ox + Math.cos(a) * r;
        n.ay = oy + Math.sin(a) * r;
    }

    for (const n of [...l1, ...l2]) {
        n.ring = Math.hypot(n.ax - ox, n.ay - oy);
        // Words appearing for the first time start close to the centre and fan out to their slot.
        if (n.x === undefined) {
            n.x = ox + (n.ax - ox) * 0.18;
            n.y = oy + (n.ay - oy) * 0.18;
        }
    }

    const nodes = [atlas.nodes[0], ...l1, ...l2];
    const ids = new Set(nodes.map((n) => n.id));
    const links = atlas.links.filter((l) => {
        const s = endpointId(l.source), t = endpointId(l.target);
        if (!ids.has(s) || !ids.has(t)) return false;
        // Family membership is shown by the bubble, not by edges.
        return !(l.level === 1 && l.group === 'family');
    });
    return { nodes, links, family, sectors, familyRadius, sectorRadius, anchors, origin: atlas.origin };
}
type View = ReturnType<typeof visibleGraph>;

/** Radius of the word-family bubble around the centre word, from where its members are drawn now. */
function bubbleRadius(view: View): number {
    const { x: ox, y: oy } = view.origin;
    return Math.max(...view.family.map((n) => Math.hypot((n.x ?? n.ax) - ox, (n.y ?? n.ay) - oy))) + RADIUS.l1 + 14;
}

/** The group labels on screen, so they can fade out on the canvas once their elements are gone. */
function pillsOf(toGraph: ((x: number, y: number) => Point) | null, area: HTMLElement | null): PillShot[] {
    const pills: PillShot[] = [];
    if (!toGraph || !area) return pills;
    const box = area.getBoundingClientRect();
    for (const el of area.querySelectorAll<HTMLElement>('[data-pill]')) {
        const alpha = Number(el.style.opacity || 1);
        if (el.style.visibility !== 'visible' || alpha < 0.05) continue;
        const r = el.getBoundingClientRect();
        const c = toGraph(r.left - box.left + r.width / 2, r.top - box.top + r.height / 2);
        pills.push({ ...c, w: r.width, h: r.height, alpha, text: el.textContent ?? '', group: el.dataset.pill as RelationGroup });
    }
    return pills;
}

/** Where the outgoing graph's words are, taken when the next graph arrives. */
function snapshotOf(view: View | null, toGraph: ((x: number, y: number) => Point) | null, area: HTMLElement | null): Snapshot | null {
    if (!view) return null;
    const positions = new Map<string, Point>();
    for (const n of view.nodes) if (n.x !== undefined && n.y !== undefined) positions.set(n.id, { x: n.x, y: n.y });
    return { positions, origin: view.origin, pills: pillsOf(toGraph, area) };
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const radiusOf = (n: Pick<AtlasNode, 'level'>) => (n.level === 0 ? RADIUS.center : n.level === 1 ? RADIUS.l1 : RADIUS.l2);

/** Room each word needs, label included. */
const collisionRadius = (n: Pick<AtlasNode, 'level' | 'name'>) => {
    if (n.level === 0) return RADIUS.center + 14;
    if (n.level === 2) return RADIUS.l2 + 10;
    return RADIUS.l1 + Math.min(34, n.name.length * 3.2) + 6;
};

/** Runs the layout to rest off-screen, so the animation can land every word exactly where it stays. */
function solveLayout(view: View): Map<string, Point> {
    const { x: ox, y: oy } = view.origin;
    const bodies = view.nodes.map((n) => ({
        id: n.id, level: n.level, name: n.name, ax: n.ax, ay: n.ay, ring: n.ring ?? 0,
        x: n.ax, y: n.ay,
        fx: n.level === 0 ? ox : undefined,
        fy: n.level === 0 ? oy : undefined,
    }));
    type Body = (typeof bodies)[number];
    // Words start on their anchors, which is already close to rest: 120 ticks land where 300 would
    // (within a unit for typical graphs) at a third of the cost of the frame that starts the transition.
    forceSimulation(bodies)
        .alphaDecay(1 - 0.001 ** (1 / LAYOUT_TICKS))
        .force('x', forceX<Body>((b) => b.ax).strength((b) => (b.level === 0 ? 0 : 0.2)))
        .force('y', forceY<Body>((b) => b.ay).strength((b) => (b.level === 0 ? 0 : 0.2)))
        .force('ring', forceRadial<Body>((b) => b.ring, ox, oy).strength((b) => (b.level === 0 ? 0 : 0.18)))
        .force('charge', forceManyBody<Body>().strength(-40).distanceMax(160))
        .force('collide', forceCollide<Body>(collisionRadius).strength(0.9).iterations(2))
        .stop()
        .tick(LAYOUT_TICKS);
    return new Map(bodies.map((b) => [b.id, { x: b.x, y: b.y }]));
}

/** The camera that frames these positions inside `box` (graph-area px; the whole area by default), leaving room for labels and pills. */
function cameraFor(nodes: AtlasNode[], positions: Map<string, Point>, width: number, height: number, box: Box = { x: 0, y: 0, w: width, h: height }): Camera {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
        const p = positions.get(n.id);
        if (!p) continue;
        const r = radiusOf(n);
        minX = Math.min(minX, p.x - r);
        maxX = Math.max(maxX, p.x + r);
        minY = Math.min(minY, p.y - r);
        maxY = Math.max(maxY, p.y + r + 14);
    }
    if (minX === Infinity) return { x: 0, y: 0, k: 1 };
    const k = Math.min(1.8, Math.max(0.35, Math.min(
        (box.w - FRAME_PADDING * 2) / Math.max(1, maxX - minX),
        (box.h - FRAME_PADDING * 2) / Math.max(1, maxY - minY),
    )));
    // The camera looks at the middle of the whole area; shift it so the graph sits in the middle of the box.
    return {
        x: (minX + maxX) / 2 - (box.x + box.w / 2 - width / 2) / k,
        y: (minY + maxY) / 2 - (box.y + box.h / 2 - height / 2) / k,
        k,
    };
}

/** Dodging floating windows is worth it while the graph keeps at least this share of its size. */
const DODGE_KEEPS = 0.7;

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The largest rectangles of `area` that no cover touches, found by trying every combination of the covers' edges. */
function freeBoxes(area: Box, covers: Box[]): Box[] {
    const right = area.x + area.w, bottom = area.y + area.h;
    const within = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const lefts = [area.x, ...covers.map((c) => within(c.x + c.w, area.x, right))];
    const rights = [right, ...covers.map((c) => within(c.x, area.x, right))];
    const tops = [area.y, ...covers.map((c) => within(c.y + c.h, area.y, bottom))];
    const bottoms = [bottom, ...covers.map((c) => within(c.y, area.y, bottom))];
    const boxes: Box[] = [];
    for (const l of lefts) for (const r of rights) {
        if (r - l < FRAME_PADDING * 2) continue;
        for (const t of tops) for (const b of bottoms) {
            if (b - t < FRAME_PADDING * 2) continue;
            const box = { x: l, y: t, w: r - l, h: b - t };
            if (!covers.some((c) => overlaps(box, c))) boxes.push(box);
        }
    }
    return boxes;
}

/**
 * The camera when windows float over the graph: framed in the free part of the area that shows it largest,
 * or, when every free part would show it much smaller, on the whole area, under the windows.
 */
function frameDodging(
    nodes: AtlasNode[], positions: Map<string, Point>, width: number, height: number, area: Box, covers: Box[],
): { camera: Camera; dodged: boolean } {
    const whole = cameraFor(nodes, positions, width, height, area);
    let best: Camera | null = null;
    for (const box of freeBoxes(area, covers)) {
        const camera = cameraFor(nodes, positions, width, height, box);
        if (!best || camera.k > best.k) best = camera;
    }
    return best && best.k >= whole.k * DODGE_KEEPS ? { camera: best, dodged: covers.length > 0 } : { camera: whole, dodged: false };
}

/** Moves a box out of the covers it overlaps, each time the shortest way, leaving a small gap. */
function clearOf(box: Box, covers: Box[]): Box {
    let b = box;
    for (const c of covers) {
        if (!overlaps(b, c)) continue;
        const moves = [
            { x: c.x - (b.x + b.w) - 6, y: 0 }, { x: c.x + c.w + 6 - b.x, y: 0 },
            { x: 0, y: c.y - (b.y + b.h) - 6 }, { x: 0, y: c.y + c.h + 6 - b.y },
        ];
        const m = moves.reduce((a, n) => (Math.hypot(n.x, n.y) < Math.hypot(a.x, a.y) ? n : a));
        b = { ...b, x: b.x + m.x, y: b.y + m.y };
    }
    return b;
}

/** Where the words come to rest: their targets mid-transition, otherwise where they are now. */
function restingPositions(nodes: AtlasNode[], motion: NodeMotion | null): Map<string, Point> {
    if (motion) return new Map(motion.moves.map((m) => [m.n.id, m.to]));
    return new Map(nodes.filter((n) => n.x !== undefined && n.y !== undefined).map((n) => [n.id, { x: n.x!, y: n.y! }]));
}

/** A word's position and velocity (graph units per ms). */
interface WordState { x: number; y: number; vx: number; vy: number }
interface Move { n: AtlasNode; to: Point; offset: Point; velocity: Point }
interface NodeMotion { start: number; moves: Move[] }
/** The camera rides the same spring; zoom runs on log k, so zooming in and out feel equally fast. */
interface CameraMotion { start: number; to: Camera; offset: Camera; velocity: Camera }

function moveAt(m: Move, ms: number): WordState {
    const [dx, vx] = springState(m.offset.x, m.velocity.x, ms);
    const [dy, vy] = springState(m.offset.y, m.velocity.y, ms);
    return { x: m.to.x + dx, y: m.to.y + dy, vx, vy };
}

/** Puts every word where the spring has it now. True once all have landed, each pinned exactly on its target. */
function stepMotion(motion: NodeMotion, now: number): boolean {
    const ms = now - motion.start;
    for (const m of motion.moves) {
        const s = moveAt(m, ms);
        m.n.fx = m.n.x = s.x;
        m.n.fy = m.n.y = s.y;
    }
    return ms >= SETTLE_MS;
}

/** Where each word of a view is drawn now and how fast it is moving. */
function statesOf(view: View | null, motion: NodeMotion | null, now: number): Map<string, WordState> {
    const states = new Map<string, WordState>();
    for (const n of view?.nodes ?? []) {
        if (n.x !== undefined && n.y !== undefined) states.set(n.id, { x: n.x, y: n.y, vx: 0, vy: 0 });
    }
    if (motion) for (const m of motion.moves) states.set(m.n.id, moveAt(m, now - motion.start));
    return states;
}

/** Sends every word from where it is drawn now, at the speed it already has, toward its solved position. */
function planMoves(nodes: AtlasNode[], targets: Map<string, Point>, from: Map<string, WordState>): Move[] {
    const moves: Move[] = [];
    for (const n of nodes) {
        const to = targets.get(n.id);
        if (!to) continue;
        const s = from.get(n.id) ?? { x: n.x ?? to.x, y: n.y ?? to.y, vx: 0, vy: 0 };
        n.fx = n.x = s.x;
        n.fy = n.y = s.y;
        moves.push({ n, to, offset: { x: s.x - to.x, y: s.y - to.y }, velocity: { x: s.vx, y: s.vy } });
    }
    return moves;
}

function cameraMotion(from: Camera, to: Camera, velocity: Camera, now: number): CameraMotion {
    return { start: now, to, offset: { x: from.x - to.x, y: from.y - to.y, k: Math.log(from.k / to.k) }, velocity };
}

/** The camera at `now`, its velocity, and whether it has landed. */
function cameraAt(c: CameraMotion, now: number): { camera: Camera; velocity: Camera; done: boolean } {
    const ms = now - c.start;
    const [dx, vx] = springState(c.offset.x, c.velocity.x, ms);
    const [dy, vy] = springState(c.offset.y, c.velocity.y, ms);
    const [dk, vk] = springState(c.offset.k, c.velocity.k, ms);
    return { camera: { x: c.to.x + dx, y: c.to.y + dy, k: c.to.k * Math.exp(dk) }, velocity: { x: vx, y: vy, k: vk }, done: ms >= SETTLE_MS };
}

const lookOf = (n: Look): Look => ({ level: n.level, group: n.group, placeholder: !!n.placeholder });
const sameLook = (a: Look, b: Look) => a.level === b.level && a.group === b.group && !!a.placeholder === !!b.placeholder;
const styleOf = (l: LinkStyle): LinkStyle => ({ group: l.group, level: l.level, pending: l.pending });
const sameStyle = (a: LinkStyle, b: LinkStyle) => a.group === b.group && a.level === b.level && a.pending === b.pending;

/**
 * Hands what is on screen over to the next view. Words and links that stay keep their state and, where
 * their role changed, morph into the new one (the clicked word grows into the centre); the rest fade in.
 */
function carryOver(target: View, outgoing: View | null, now: number) {
    const words = new Map(outgoing?.nodes.map((n) => [n.id, n]));
    for (const n of target.nodes) {
        const was = words.get(n.id);
        if (was === n) continue;
        n.born = was ? was.born ?? 0 : now;
        n.morph = was && !sameLook(was, n) ? { from: lookOf(was), at: now } : undefined;
    }
    const links = new Map(outgoing?.links.map((l) => [pairKey(l), l]));
    for (const l of target.links) {
        const was = links.get(pairKey(l));
        if (was === l) continue;
        l.born = was ? was.born ?? 0 : now;
        l.morph = was && !sameStyle(was, l) ? { from: styleOf(was), at: now } : undefined;
    }
}

/** Skips every fade and morph, for reduced motion. */
function markShown(view: View) {
    for (const n of view.nodes) { n.born = 0; n.morph = undefined; }
    for (const l of view.links) { l.born = 0; l.morph = undefined; }
}

/** What the outgoing view shows and the next one does not. It fades out, still gliding where it was heading. */
interface Ghosts {
    at: number;
    nodes: AtlasNode[];
    links: AtlasLink[];
    motion: NodeMotion | null;
    bubble: (Point & { r: number }) | null;
    pills: PillShot[];
}

function ghostsOf(target: View, outgoing: View, motion: NodeMotion | null, pills: PillShot[], now: number): Ghosts {
    const words = new Set(target.nodes.map((n) => n.id));
    const links = new Set(target.links.map(pairKey));
    const keepsBubble = target.family.length > 0 && target.origin === outgoing.origin;
    return {
        at: now,
        nodes: outgoing.nodes.filter((n) => !words.has(n.id) && n.x !== undefined),
        links: outgoing.links.filter((l) => !links.has(pairKey(l))),
        // Only the departing words: the ones that stay may be the very same objects, now moving on a new spring.
        motion: motion && { start: motion.start, moves: motion.moves.filter((m) => !words.has(m.n.id)) },
        bubble: outgoing.family.length && !keepsBubble ? { ...outgoing.origin, r: bubbleRadius(outgoing) } : null,
        pills,
    };
}

/** 0 → 1 as something new fades in. */
const fadeIn = (born: number | undefined, now: number) => (!born ? 1 : clamp01(spring(now - born) * ENTER_SPEED));
/** 1 → 0 as something that has left fades out. */
const fadeOut = (at: number, now: number) => (reducedMotion() ? 0 : 1 - clamp01(spring(now - at) * EXIT_SPEED));
/** 0 → 1 as a word or link changes into its new role, in step with its movement. */
const morphOf = (morph: { at: number } | undefined, now: number) => (morph ? spring(now - morph.at) : 1);

interface Animated { v: number; vel: number; t: number }

/**
 * Moves a stored value toward `target` on a critically damped spring, carrying its velocity across
 * target changes, so emphasis never snaps, not even when the target flips half-way.
 */
function animated(store: Map<string, Animated>, key: string, target: number, now: number, responseMs: number): number {
    const a = store.get(key);
    if (!a || reducedMotion()) {
        store.set(key, { v: target, vel: 0, t: now });
        return target;
    }
    if (now > a.t) {
        const [offset, vel] = springStep(a.v - target, a.vel, now - a.t, (2 * Math.PI) / responseMs);
        const resting = Math.abs(offset) < 1e-4 && Math.abs(vel) < 1e-6;
        a.v = resting ? target : target + offset;
        a.vel = resting ? 0 : vel;
        a.t = now;
    }
    return a.v;
}

/** A stored value as it stands, left where it is (for what is fading out). */
const held = (store: Map<string, Animated>, key: string) => store.get(key)?.v ?? 0;

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

const PALETTE: Record<Theme, {
    bg: string; ink: string; muted: string; halo: string; edgeAlpha: number; bubbleFill: string;
    /** Progress ring around a node (familiarity); weak words get their own warning colour. */
    ring: string; weakRing: string;
    /** Centre word: highlight, body and rim of its gradient. */
    center: [string, string, string];
    /** Dark theme lets nodes glow; light theme gives them a soft drop shadow instead. */
    glow: boolean;
    /** The pointer's colour, as "r, g, b". */
    pointer: string;
}> = {
    dark: {
        bg: '#05070d', ink: '#eaf2ff', muted: '#8ca3c4', halo: 'rgba(5,7,13,0.92)', edgeAlpha: 0.45,
        bubbleFill: 'rgba(167,139,250,0.06)', ring: 'rgba(234,242,255,0.9)', weakRing: '#fb7185',
        center: ['#e0f2fe', '#38bdf8', '#075985'], glow: true, pointer: '234, 242, 255',
    },
    light: {
        bg: '#f1ede4', ink: '#20302c', muted: '#61706b', halo: 'rgba(241,237,228,0.95)', edgeAlpha: 0.5,
        bubbleFill: 'rgba(139,92,246,0.05)', ring: 'rgba(32,48,44,0.85)', weakRing: '#e11d48',
        center: ['#a7f3d0', '#1b6c53', '#0f3d2e'], glow: false, pointer: '32, 48, 44',
    },
};
type Palette = (typeof PALETTE)[Theme];

const FAMILIARITY_ORDER: Array<Familiarity | 'new'> = ['new', 'seen', 'weak', 'learning', 'mastered'];
/** Share of the progress ring drawn for each familiarity level. */
const RING_FRACTION: Record<Familiarity, number> = { seen: 0.25, weak: 1, learning: 0.66, mastered: 1 };

/** Blend two #rrggbb colours; t = 0 gives `hex`, t = 1 gives `other`. */
function mix(hex: string, other: string, t: number): string {
    const a = parseInt(hex.slice(1), 16), b = parseInt(other.slice(1), 16);
    const channel = (shift: number) => {
        const from = (a >> shift) & 255, to = (b >> shift) & 255;
        return Math.round(from + (to - from) * t);
    };
    return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

type Oklch = [number, number, number];
const oklchCache = new Map<string, Oklch>();

/** '#rrggbb' or 'rgb(r, g, b)' as OKLCH: lightness, chroma, hue (radians). */
function oklchOf(css: string): Oklch {
    let c = oklchCache.get(css);
    if (!c) {
        const srgb = css.startsWith('#') ? [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16)) : css.match(/[\d.]+/g)!.slice(0, 3).map(Number);
        const [r, g, b] = srgb.map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
        const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
        const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
        const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
        const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
        c = [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, Math.hypot(A, B), Math.atan2(B, A)];
        oklchCache.set(css, c);
    }
    return c;
}

/** Linear-light sRGB of an OKLCH colour, or null when the screen cannot show it. */
function linearRgb(L: number, C: number, h: number): [number, number, number] | null {
    const A = C * Math.cos(h), B = C * Math.sin(h);
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
    const rgb: [number, number, number] = [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
    return rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4) ? rgb : null;
}

/**
 * Blends two colours in OKLCH, the short way round the hue circle. The colours in between keep the
 * brightness and vividness of the two ends instead of passing through a muddy grey, so a word that changes
 * relation changes colour cleanly. Chroma gives way only as far as the screen's gamut requires.
 */
function blend(a: string, b: string, t: number): string {
    if (t <= 0) return a;
    if (t >= 1) return b;
    const [L1, C1, h1] = oklchOf(a), [L2, C2, h2] = oklchOf(b);
    let dh = h2 - h1;
    if (dh > Math.PI) dh -= 2 * Math.PI; else if (dh < -Math.PI) dh += 2 * Math.PI;
    // A nearly grey end has no hue worth turning from: take the other end's.
    const h = C1 < 0.02 ? h2 : C2 < 0.02 ? h1 : h1 + dh * t;
    const L = lerp(L1, L2, t), C = lerp(C1, C2, t);
    let rgb = linearRgb(L, C, h);
    if (!rgb) {
        let lo = 0, hi = C;
        for (let i = 0; i < 10; i++) {
            const mid = (lo + hi) / 2;
            if (linearRgb(L, mid, h)) lo = mid; else hi = mid;
        }
        rgb = linearRgb(L, lo, h)!;
    }
    const [r, g, bl] = rgb.map((v) => {
        const c = clamp01(v);
        return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
    });
    return `rgb(${r}, ${g}, ${bl})`;
}

// The blurred halo under a jewel (a glow on dark, a drop shadow on paper) is rendered once per colour into a
// bitmap: stamping a bitmap is far cheaper than a blur per word per frame. The body on top is a plain
// gradient drawn directly, so its colours can blend freely while a word changes relation.
const SPRITE_RADIUS = 40;
const SPRITE_PAD = 44;
const halos = new Map<string, HTMLCanvasElement>();

function haloSprite(color: string, glow: boolean): HTMLCanvasElement {
    const key = glow ? color : 'shadow';
    let sprite = halos.get(key);
    if (!sprite) {
        const size = (SPRITE_RADIUS + SPRITE_PAD) * 2;
        const c = size / 2;
        sprite = document.createElement('canvas');
        sprite.width = sprite.height = size;
        const ctx = sprite.getContext('2d')!;
        // Only the shadow lands on the bitmap: the disc casting it sits off to the side.
        const away = size * 2;
        ctx.shadowOffsetX = away;
        if (glow) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 36;
        } else {
            ctx.shadowColor = 'rgba(60, 45, 20, 0.30)';
            ctx.shadowBlur = 12;
            ctx.shadowOffsetY = 4;
        }
        ctx.beginPath();
        ctx.arc(c - away, c, SPRITE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = '#000';
        ctx.fill();
        halos.set(key, sprite);
    }
    return sprite;
}

function paintHalo(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, palette: Palette) {
    const sprite = haloSprite(color, palette.glow);
    const size = sprite.width * (r / SPRITE_RADIUS);
    ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
}

/** The body of a jewel: a radial gradient, lit from the upper left. */
function paintDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, [highlight, body, rim]: readonly string[]) {
    const gradient = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    gradient.addColorStop(0, highlight);
    gradient.addColorStop(0.55, body);
    gradient.addColorStop(1, rim);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
}

/** The dashed word-family bubble. */
function paintBubble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, palette: Palette, scale: number) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = palette.bubbleFill;
    ctx.fill();
    ctx.setLineDash([6 / scale, 5 / scale]);
    ctx.lineWidth = 1.2 / scale;
    ctx.strokeStyle = GROUP_COLORS.family;
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * 0.65;
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.setLineDash([]);
}

/** A group label of the outgoing graph, redrawn on the canvas while it fades out. */
function paintPill(ctx: CanvasRenderingContext2D, pill: PillShot, palette: Palette, scale: number) {
    const w = pill.w / scale, h = pill.h / scale;
    const x = pill.x - w / 2, y = pill.y - h / 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = palette.bg;
    ctx.fill();
    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = GROUP_COLORS[pill.group];
    ctx.stroke();
    ctx.fillStyle = GROUP_COLORS[pill.group];
    ctx.font = `600 ${11 / scale}px Geist, "Noto Sans SC", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pill.text, pill.x, pill.y);
}

/** Gradient stops for a relation colour. */
function jewelStops(color: string): [string, string, string] {
    return [mix(color, '#ffffff', 0.55), color, mix(color, '#000000', 0.3)];
}

/** Familiarity as a progress ring: a quarter once seen, two thirds while learning, closed when mastered. */
function paintProgressRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, level: Familiarity | undefined, palette: Palette, scale: number) {
    if (!level) return;
    const radius = r + 3.5;
    const color = level === 'weak' ? palette.weakRing : palette.ring;
    const fraction = RING_FRACTION[level];
    ctx.save();
    ctx.lineWidth = (level === 'mastered' ? 2.4 : 2) / scale;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    if (fraction < 1) {
        ctx.globalAlpha *= 0.22;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha /= 0.22;
    }
    ctx.beginPath();
    ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

/**
 * Cross-fades two drawings of the same thing. Each layer stays opaque for part of the way (`overlap` > 1),
 * so the thing never thins out in the middle.
 */
const morphLayers = <T,>(from: T | undefined, to: T, m: number, same: boolean, overlap = 2): Array<[T, number]> =>
    !from || same || m >= 1 ? [[to, 1]] : [[from, clamp01(overlap * (1 - m))], [to, clamp01(overlap * m)]];

/** Radius of a word in this role; `emphasis` (0–1) is how much it is hovered. */
function radiusFor(look: Look, emphasis: number): number {
    if (look.level === 0) return RADIUS.center;
    if (look.level === 1) return RADIUS.l1 * (1 + 0.2 * emphasis);
    return RADIUS.l2 * (1 + 0.4 * emphasis);
}

const hasRing = (look: Look) => look.level === 0 || (look.level === 1 && !look.placeholder);

/** How a word's body is drawn in a role: gradient stops, opacity, and how much halo it casts. */
interface BodyStyle { stops: readonly [string, string, string]; alpha: number; halo: number }

/** Null for a neighbour without a dictionary entry, drawn as a dashed hollow circle instead. */
function bodyStyle(look: Look, palette: Palette): BodyStyle | null {
    if (look.level === 2) {
        const c = GROUP_COLORS[look.group!];
        return { stops: [c, c, c], alpha: look.placeholder ? 0.35 : 0.7, halo: 0 };
    }
    if (look.placeholder && look.level === 1) return null;
    return { stops: look.level === 0 ? palette.center : jewelStops(GROUP_COLORS[look.group!]), alpha: 1, halo: 1 };
}

/** A word's body in one role: a jewel, a small dot (second degree) or a dashed hollow circle. */
function paintBody(ctx: CanvasRenderingContext2D, look: Look, x: number, y: number, r: number, emphasis: number, palette: Palette, scale: number) {
    const style = bodyStyle(look, palette);
    if (style) {
        const jewel = r * (1 + 0.12 * style.halo * emphasis);
        if (style.halo) paintHalo(ctx, x, y, jewel, style.stops[1], palette);
        ctx.globalAlpha *= style.alpha;
        paintDisc(ctx, x, y, jewel, style.stops);
        return;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = palette.bg;
    ctx.fill();
    ctx.setLineDash([3 / scale, 3 / scale]);
    ctx.strokeStyle = palette.muted;
    ctx.lineWidth = 1.5 / scale;
    ctx.stroke();
    ctx.setLineDash([]);
}

/** Everything that decides how one word is drawn in a frame. */
interface WordPaint {
    x: number;
    y: number;
    look: Look;
    /** Its previous role while `m` runs 0 → 1. */
    from?: Look;
    m: number;
    alpha: number;
    /** 0.6 → 1 while it grows in. */
    grow: number;
    emphasis: number;
    familiarity?: Familiarity;
    ringAlpha: number;
}

function paintWord(ctx: CanvasRenderingContext2D, w: WordPaint, palette: Palette, scale: number) {
    const from = w.from ?? w.look;
    const r = lerp(radiusFor(from, w.emphasis), radiusFor(w.look, w.emphasis), w.m) * w.grow;
    const a = bodyStyle(from, palette), b = bodyStyle(w.look, palette);
    ctx.save();
    if (w.from && w.m < 1 && a && b) {
        // A word changing relation stays one body whose colours blend along its movement; only the soft
        // halos under it cross-fade (the paper theme's shadow is the same for every colour).
        const jewel = r * (1 + 0.12 * lerp(a.halo, b.halo, w.m) * w.emphasis);
        const halos: Array<[BodyStyle, number]> = palette.glow ? [[a, a.halo * (1 - w.m)], [b, b.halo * w.m]] : [[b, lerp(a.halo, b.halo, w.m)]];
        for (const [style, weight] of halos) {
            if (weight <= 0) continue;
            ctx.globalAlpha = w.alpha * weight;
            paintHalo(ctx, w.x, w.y, jewel, style.stops[1], palette);
        }
        ctx.globalAlpha = w.alpha * lerp(a.alpha, b.alpha, w.m);
        paintDisc(ctx, w.x, w.y, jewel, a.stops.map((c, i) => blend(c, b.stops[i], w.m)));
    } else {
        // Hollow placeholders have no colour to blend toward: cross-fade the two drawings instead.
        for (const [look, layer] of morphLayers(w.from, w.look, w.m, false)) {
            if (layer <= 0) continue;
            ctx.globalAlpha = w.alpha * layer;
            paintBody(ctx, look, w.x, w.y, r, w.emphasis, palette, scale);
        }
    }
    ctx.restore();
    const ring = lerp(Number(hasRing(from)), Number(hasRing(w.look)), w.m) * w.ringAlpha;
    if (ring > 0 && w.familiarity) {
        ctx.save();
        ctx.globalAlpha = w.alpha * ring;
        paintProgressRing(ctx, w.x, w.y, r + lerp(from.level === 0 ? 1.5 : 0, w.look.level === 0 ? 1.5 : 0, w.m), w.familiarity, palette, scale);
        ctx.restore();
    }
}

const LABEL_PX = [14, 12, 10] as const;
const labelGap = (look: Look) => (look.level === 0 ? RADIUS.center + 7 : look.level === 1 ? RADIUS.l1 : RADIUS.l2);
const labelFont = (look: Look, px: number, scale: number) =>
    `${look.level === 0 ? '600 ' : ''}${px / scale}px Geist, "Noto Sans SC", system-ui, sans-serif`;

/** Everything that decides how one word's label is drawn in a frame. */
interface LabelPaint {
    x: number;
    y: number;
    name: string;
    translation?: string;
    look: Look;
    from?: Look;
    m: number;
    alpha: number;
    /** How close it is to the hovered word (0–1); second-degree labels show when it is. */
    near: number;
    /** Zoom-driven visibility of neighbour glosses and second-degree labels. */
    glossAlpha: number;
    outerAlpha: number;
}

function paintLabel(ctx: CanvasRenderingContext2D, l: LabelPaint, palette: Palette, scale: number) {
    const from = l.from ?? l.look;
    const shown = (look: Look) => (look.level === 2 ? Math.max(l.outerAlpha, l.near) : 1);
    const alpha = l.alpha * lerp(shown(from), shown(l.look), l.m);
    if (alpha <= 0.004) return;
    const px = lerp(LABEL_PX[from.level], LABEL_PX[l.look.level], l.m);
    const y = l.y + lerp(labelGap(from), labelGap(l.look), l.m) + 3 / scale;
    const sameText = (from.level === 0) === (l.look.level === 0) && !!from.placeholder === !!l.look.placeholder;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5 / scale;
    ctx.strokeStyle = palette.halo;
    for (const [look, a] of morphLayers(l.from, l.look, l.m, sameText, 1.5)) {
        if (a <= 0) continue;
        ctx.globalAlpha = alpha * a;
        ctx.font = labelFont(look, px, scale);
        ctx.strokeText(l.name, l.x, y);
        ctx.fillStyle = look.placeholder ? palette.muted : palette.ink;
        ctx.fillText(l.name, l.x, y);
    }
    const glossOf = (look: Look) => (look.level === 0 ? 1 : look.level === 1 ? l.glossAlpha : 0);
    const gloss = lerp(glossOf(from), glossOf(l.look), l.m);
    const text = gloss > 0 ? shortGloss(l.translation) : '';
    if (text) {
        ctx.globalAlpha = alpha * gloss;
        ctx.font = `${10 / scale}px "Noto Sans SC", system-ui, sans-serif`;
        const gy = y + (px + 2) / scale;
        ctx.strokeText(text, l.x, gy);
        ctx.fillStyle = palette.muted;
        ctx.fillText(text, l.x, gy);
    }
    ctx.restore();
}

/** One link; `lit` and `dim` (0–1) are how much it is highlighted or faded by hovering. */
function paintEdge(
    ctx: CanvasRenderingContext2D, a: Point, b: Point, style: LinkStyle, from: LinkStyle | undefined, m: number,
    alpha: number, lit: number, dim: number, palette: Palette, scale: number,
) {
    const base = (s: LinkStyle) => palette.edgeAlpha * (s.level === 2 ? 0.55 : 1);
    const width = (s: LinkStyle) => (s.level === 2 ? 0.8 : 1.3);
    const prev = from ?? style;
    const rest = lerp(base(prev), base(style), m);
    const shown = (rest + (0.95 - rest) * lit + (0.12 - rest) * dim) * alpha;
    if (shown <= 0.004) return;
    ctx.save();
    // Lines are translucent, so a changing colour is blended rather than layered.
    ctx.globalAlpha = shown;
    ctx.strokeStyle = prev.group === style.group ? GROUP_COLORS[style.group] : blend(GROUP_COLORS[prev.group], GROUP_COLORS[style.group], m);
    ctx.lineWidth = lerp(lerp(width(prev), width(style), m), 2, lit) / scale;
    if ((m < 0.5 ? prev : style).pending) ctx.setLineDash([5 / scale, 4 / scale]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
}

// ---------------------------------------------------------------------------
// Pointer. Like the iPad's: a soft dot that snaps to a word it comes close to and turns into a highlight
// behind it, while the word leans slightly toward it. The snapped word takes the click, so small words
// and their labels are easy to hit.
// ---------------------------------------------------------------------------

/** The pointer snaps to a word within this distance (screen px) of the word or its label… */
const MAGNET_PX = 14;
/** …and, once snapped, lets go only this much further out, so it does not flicker at the edge. */
const STICKY_PX = 10;
/** How far a snapped word leans toward the pointer, at most (screen px). */
const LIFT_PX = 4;
/** Dot and highlight morph into each other on a quick spring. */
const POINTER_RESPONSE_MS = 240;

/** A box on screen (px, in graph-area coordinates). */
interface Box { x: number; y: number; w: number; h: number }
/** The pointer's outline: a rounded box that is a dot (`dot` = 1) or a highlight behind a word (0). */
interface PointerShape extends Box { r: number; dot: number }

let measure: CanvasRenderingContext2D | null = null;
const labelWidths = new Map<string, number>();

/** On-screen width of a word's label (px). */
function labelWidth(n: Look & { name: string }): number {
    const key = `${n.level}|${n.name}`;
    let w = labelWidths.get(key);
    if (w === undefined) {
        measure ??= document.createElement('canvas').getContext('2d');
        if (!measure) return n.name.length * 7;
        measure.font = labelFont(n, LABEL_PX[n.level], 1);
        w = measure.measureText(n.name).width;
        labelWidths.set(key, w);
    }
    return w;
}

/** The part of the screen a word takes up: its body and, where it is shown, its label. */
function wordBox(n: AtlasNode, at: Point, k: number): Box {
    const r = radiusFor(n, 0) * k;
    // Second-degree labels only show once zoomed in (see paintLabels).
    if (n.level === 2 && k < 1.4) return { x: at.x - r, y: at.y - r, w: 2 * r, h: 2 * r };
    const w = Math.max(2 * r, labelWidth(n));
    const bottom = at.y + labelGap(n) * k + 3 + LABEL_PX[n.level] * 1.25;
    return { x: at.x - w / 2, y: at.y - r, w, h: bottom - at.y + r };
}

/** How far outside a box a point is (0 inside it). */
const gapTo = (b: Box, x: number, y: number) =>
    Math.hypot(Math.max(b.x - x, 0, x - b.x - b.w), Math.max(b.y - y, 0, y - b.y - b.h));

const dotAt = (p: Point): PointerShape => ({ x: p.x - 8, y: p.y - 8, w: 16, h: 16, r: 8, dot: 1 });
const highlightOf = (b: Box): PointerShape => ({ x: b.x - 7, y: b.y - 5, w: b.w + 14, h: b.h + 10, r: 10, dot: 0 });
const lerpShape = (a: PointerShape, b: PointerShape, t: number): PointerShape => ({
    x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t), r: lerp(a.r, b.r, t), dot: lerp(a.dot, b.dot, t),
});

/** Paints the pointer in screen space, whatever transform the canvas has. */
function paintPointer(ctx: CanvasRenderingContext2D, s: PointerShape, alpha: number, palette: Palette) {
    ctx.save();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, s.w, s.h, Math.min(s.r, s.w / 2, s.h / 2));
    ctx.fillStyle = `rgba(${palette.pointer}, ${lerp(0.08, 0.5, s.dot)})`;
    ctx.fill();
    if (s.dot < 1) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(${palette.pointer}, ${0.14 * (1 - s.dot)})`;
        ctx.stroke();
    }
    ctx.restore();
}

/** Legend swatch: a neutral dot with the same progress ring the graph draws. */
function RingIcon({ level, palette }: { level: Familiarity | 'new'; palette: Palette }) {
    const circumference = 2 * Math.PI * 6;
    const fraction = level === 'new' ? 0 : RING_FRACTION[level];
    const color = level === 'weak' ? palette.weakRing : palette.ring;
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="3.2" fill={palette.muted} />
            {fraction > 0 && fraction < 1 && <circle cx="8" cy="8" r="6" fill="none" stroke={color} strokeOpacity="0.22" strokeWidth="1.6" />}
            {fraction > 0 && (
                <circle
                    cx="8" cy="8" r="6" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round"
                    strokeDasharray={`${fraction * circumference} ${circumference}`} transform="rotate(-90 8 8)"
                />
            )}
        </svg>
    );
}

/** Graph responses by word, shared by every panel. Hovering a word warms its entry, so a click can animate at once. */
const graphCache = new Map<string, Promise<GraphData>>();
const GRAPH_CACHE_SIZE = 40;

function loadGraph(word: string): Promise<GraphData> {
    const key = word.toLowerCase();
    let pending = graphCache.get(key);
    if (!pending) {
        pending = fetch(`/api/fission?word=${encodeURIComponent(word)}`).then((res) => {
            if (!res.ok) throw new Error(`fission ${res.status}`);
            return res.json() as Promise<GraphData>;
        });
        pending.catch(() => graphCache.delete(key));
        graphCache.set(key, pending);
        if (graphCache.size > GRAPH_CACHE_SIZE) {
            const oldest = graphCache.keys().next().value;
            if (oldest !== undefined) graphCache.delete(oldest);
        }
    }
    return pending;
}

/** Familiarity for a graph's words, kept briefly so a prefetched graph shows its rings straight away. */
let statesCache = new WeakMap<GraphData, { at: number; states: Promise<Record<string, Familiarity>> }>();
let statesGeneration = 0;
const STATES_TTL_MS = 30_000;

function resetStatesCache() {
    statesCache = new WeakMap();
    statesGeneration += 1;
}

function loadStates(graph: GraphData): Promise<Record<string, Familiarity>> {
    const cached = statesCache.get(graph);
    if (cached && performance.now() - cached.at < STATES_TTL_MS) return cached.states;
    const gen = statesGeneration;
    const states = fetch('/api/user/word-states', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ words: graph.nodes.map((n) => n.id) }),
    })
        .then((res) => (res.ok ? res.json() : { states: {} }))
        .then((body: { states?: Record<string, Familiarity> }) => body.states ?? {})
        .catch(() => ({}));
    if (gen === statesGeneration) {
        statesCache.set(graph, { at: performance.now(), states });
    }
    return states;
}

/** Warms everything a word needs before it is clicked. */
function prefetchWord(word: string) {
    loadGraph(word).then(loadStates).catch(() => undefined);
}

/** "vt. 放弃, 抛弃, 遗弃" -> "放弃, 抛弃" */
function shortGloss(translation?: string): string {
    if (!translation) return '';
    const text = translation.replace(/^\s*([a-z]+\.\s*)+/i, '').split(/[;；]/)[0];
    const parts = text.split(/[,，]/).map((s) => s.trim()).filter(Boolean).slice(0, 2).join(', ');
    return parts.length > 14 ? `${parts.slice(0, 13)}…` : parts;
}

export default function PanelFissionGraph({ word, onNodeClick, variant = 'panel', obstacles, onBack, backTo, actions }: PanelFissionGraphProps) {
    const locale = useLocale();
    const t = useTranslations('graph');
    const { showHoverTooltip, showGraphTooltip, graphPointerSnap: snapping, updateSettings } = useSettings();
    const { theme } = useTheme();
    const immersive = variant === 'immersive';
    const palette = PALETTE[theme];

    // The last graph that arrived stays on screen while the next word loads; `from` is the outgoing
    // graph it morphs out of.
    const [fetched, setFetched] = useState<{ word: string; graph: GraphData; from: Snapshot | null } | null>(null);
    const [graphErrorState, setGraphErrorState] = useState<{ word: string; nonce: number; message: string } | null>(null);
    const [retryNonce, setRetryNonce] = useState(0);
    const [authGeneration, setAuthGeneration] = useState(0);
    const graphError =
        word && graphErrorState?.word === word && graphErrorState.nonce === retryNonce
            ? graphErrorState.message
            : null;
    /** Familiarity of every word seen so far, so rings stay put when a word moves into the next graph. */
    const [familiarity, setFamiliarity] = useState<Record<string, Familiarity>>({});
    const [expandedByWord, setExpandedByWord] = useState<Record<string, RelationGroup[]>>({});
    const [hidden, setHidden] = useState<Set<RelationGroup>>(new Set());
    const [secondDegree, setSecondDegree] = useState(false);
    const [hovered, setHovered] = useState<AtlasNode | null>(null);
    const [size, setSize] = useState({ width: 0, height: 0 });
    /** The word just clicked in the graph, pulsing while its neighbourhood loads. */
    const [pending, setPending] = useState<{ word: string; x: number; y: number } | null>(null);
    /** The pulse only shows once a load takes long enough to notice. */
    const [slowWord, setSlowWord] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement | null>(null);
    const resizeObserver = useRef<ResizeObserver | null>(null);
    const fgRef = useRef<ForceGraphMethods<NodeObject<AtlasNode>, LinkObject<AtlasNode, AtlasLink>> | undefined>(undefined);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const zoomLabelRef = useRef<HTMLSpanElement>(null);
    const zoomSliderRef = useRef<HTMLInputElement>(null);
    const viewRef = useRef<View | null>(null);
    const sizeRef = useRef(size);
    const toolbarRef = useRef<HTMLDivElement>(null);
    /** The windows over the graph, in client px. */
    const obstaclesRef = useRef<Box[]>([]);
    /** The camera frames the graph by itself until the person pans or zooms; then it is theirs until "fit" or the next word. */
    const autoFrame = useRef(true);
    /** Whether that framing moved the graph clear of the windows (its group labels then keep clear too). */
    const dodged = useRef(false);
    const motionRef = useRef<NodeMotion | null>(null);
    const cameraRef = useRef<CameraMotion | null>(null);
    /** True while this component moves the camera, to tell its own zoom events from the user's. */
    const cameraDriving = useRef(false);
    /** What the previous view showed that this one does not, fading out. */
    const ghostsRef = useRef<Ghosts | null>(null);
    /** When the family bubble and the group labels of the graph on screen appeared; they fade in from then. */
    const shownAt = useRef({ bubble: -Infinity, pills: -Infinity });
    /** Group labels on screen just before a group was switched off, so they can fade out. */
    const toggledPills = useRef<PillShot[]>([]);
    /** When each word's familiarity first arrived; its ring fades in from then. */
    const ringSince = useRef(new Map<string, number>());
    /** Hover emphasis and pointer state per word and link, animated instead of switched. */
    const easing = useRef(new Map<string, Animated>());
    /** Where the mouse is over the canvas (px, graph-area coordinates); null when it is elsewhere. */
    const pointer = useRef<Point | null>(null);
    const lastPointer = useRef<Point>({ x: 0, y: 0 });
    /** The word the pointer has snapped to (`to`), and the outline it has been morphing from since `at`. */
    const pointerMorph = useRef<{ from: PointerShape; to: AtlasNode | null; at: number }>({ from: dotAt({ x: 0, y: 0 }), to: null, at: -Infinity });
    /** Words that moved under a pointer at rest do not light up until it moves. */
    const pointerStill = useRef(false);
    const pressedAt = useRef<Point | null>(null);
    const dragging = useRef(false);

    const data = fetched?.graph ?? null;
    const shownWord = fetched?.word ?? null;
    const loading = !!word && fetched?.word !== word && !graphError;
    const expanded = useMemo(() => new Set(shownWord ? expandedByWord[shownWord] ?? [] : []), [expandedByWord, shownWord]);

    // 同页登录/退出后清空熟悉度缓存并立刻重新拉取，刷新进度环
    useEffect(() => {
        const handleAuthChange = () => {
            resetStatesCache();
            ringSince.current.clear();
            setFamiliarity({});
            setAuthGeneration((g) => g + 1);
        };
        window.addEventListener('auth-state-changed', handleAuthChange);
        return () => window.removeEventListener('auth-state-changed', handleAuthChange);
    }, []);

    // ---- data -------------------------------------------------------------
    const toGraph = useCallback((x: number, y: number) => fgRef.current!.screen2GraphCoords(x, y), []);
    /** The outgoing graph as it is on screen right now. */
    const takeSnapshot = useCallback(
        () => snapshotOf(viewRef.current, fgRef.current ? toGraph : null, containerRef.current),
        [toGraph],
    );

    useEffect(() => {
        if (!word) return;
        let live = true;
        loadGraph(word)
            .then((graph) => {
                if (!live) return;
                setGraphErrorState(null);
                setFetched({ word, graph, from: takeSnapshot() });
                setHovered(null);
            })
            .catch((err) => {
                if (!live) return;
                setPending(null);
                setSlowWord(null);
                setGraphErrorState({
                    word,
                    nonce: retryNonce,
                    message: err instanceof Error ? err.message : 'failed',
                });
            });
        return () => { live = false; };
    }, [word, retryNonce, takeSnapshot]);

    useEffect(() => {
        if (!data?.nodes.length) return;
        let live = true;
        loadStates(data).then((states) => {
            if (!live) return;
            const now = performance.now();
            for (const id of Object.keys(states)) if (!ringSince.current.has(id)) ringSince.current.set(id, now);
            setFamiliarity((prev) => ({ ...prev, ...states }));
            fgRef.current?.d3ReheatSimulation(); // frames for new rings to fade in
        });
        return () => { live = false; };
    }, [data, authGeneration]);

    useEffect(() => {
        if (!loading || !pending || pending.word !== word) return;
        const timer = window.setTimeout(() => setSlowWord(pending.word), 180);
        return () => window.clearTimeout(timer);
    }, [loading, pending, word]);

    const atlas = useMemo(() => (fetched ? buildAtlas(fetched.graph, fetched.from) : null), [fetched]);
    const view = useMemo(
        () => (atlas ? visibleGraph(atlas, { hidden, expanded, secondDegree }) : null),
        [atlas, hidden, expanded, secondDegree],
    );
    const graphData = useMemo(() => (view ? { nodes: view.nodes, links: view.links } : { nodes: [], links: [] }), [view]);
    // Solved while rendering, so the frame that starts a transition only has to set it in motion.
    const layout = useMemo(() => (view ? solveLayout(view) : null), [view]);
    useEffect(() => { viewRef.current = view; }, [view]);

    const neighbours = useMemo(() => {
        const map = new Map<string, Set<string>>();
        for (const l of view?.links ?? []) {
            const s = endpointId(l.source), tId = endpointId(l.target);
            if (!map.has(s)) map.set(s, new Set());
            if (!map.has(tId)) map.set(tId, new Set());
            map.get(s)!.add(tId);
            map.get(tId)!.add(s);
        }
        return map;
    }, [view]);

    // ---- size / keyboard -----------------------------------------------------
    // Callback ref: the graph area only exists once a word is selected, after the first render.
    const attachGraphArea = useCallback((el: HTMLDivElement | null) => {
        resizeObserver.current?.disconnect();
        containerRef.current = el;
        if (!el) return;
        resizeObserver.current = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            setSize({ width: Math.round(width), height: Math.round(height) });
        });
        resizeObserver.current.observe(el);
    }, []);
    useEffect(() => { sizeRef.current = size; }, [size]);
    const obstacleKey = (obstacles ?? []).map((o) => [o.x, o.y, o.width, o.height].map(Math.round).join(',')).join(';');
    useEffect(() => {
        obstaclesRef.current = obstacleKey
            ? obstacleKey.split(';').map((o) => { const [x, y, w, h] = o.split(',').map(Number); return { x, y, w, h }; })
            : [];
    }, [obstacleKey]);

    /** Where the graph may sit (below the immersive variant's floating toolbar), in graph-area px. */
    const graphSpace = useCallback((): Box => {
        const s = sizeRef.current, bar = toolbarRef.current;
        const top = immersive && bar ? bar.offsetTop + bar.offsetHeight : 0;
        return { x: 0, y: top, w: s.width, h: s.height - top };
    }, [immersive]);

    /** The windows over the graph, in graph-area px. */
    const covers = useCallback((): Box[] => {
        const at = containerRef.current?.getBoundingClientRect();
        return obstaclesRef.current.map((o) => ({ ...o, x: o.x - (at?.left ?? 0), y: o.y - (at?.top ?? 0) }));
    }, []);

    /** The camera that frames these positions, dodging the windows over the graph when that pays. */
    const frame = useCallback((nodes: AtlasNode[], positions: Map<string, Point>) => {
        const framing = frameDodging(nodes, positions, sizeRef.current.width, sizeRef.current.height, graphSpace(), covers());
        dodged.current = framing.dodged;
        return framing.camera;
    }, [graphSpace, covers]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (e.repeat || target?.closest('input, textarea, [contenteditable="true"]')) return;
            if (e.key.toLowerCase() === 'h') setSecondDegree((v) => !v);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // ---- pointer ---------------------------------------------------------------
    /** How far a word is drawn off its place (screen px), leaning toward the pointer that snapped to it. */
    const liftOf = useCallback((n: AtlasNode, now: number): Point => {
        const fg = fgRef.current, p = pointer.current;
        let tx = 0, ty = 0;
        if (snapping && fg && p && n === pointerMorph.current.to && n.x !== undefined && n.y !== undefined) {
            const c = fg.graph2ScreenCoords(n.x, n.y);
            const dx = (p.x - c.x) * 0.15, dy = (p.y - c.y) * 0.15;
            const shrink = Math.min(1, LIFT_PX / (Math.hypot(dx, dy) || 1));
            tx = dx * shrink;
            ty = dy * shrink;
        }
        const e = easing.current;
        return { x: animated(e, `lx:${n.id}`, tx, now, POINTER_RESPONSE_MS), y: animated(e, `ly:${n.id}`, ty, now, POINTER_RESPONSE_MS) };
    }, [snapping]);

    /** The highlight behind a snapped word, or the dot under the pointer. */
    const pointerTarget = useCallback((to: AtlasNode | null, now: number): PointerShape => {
        const fg = fgRef.current;
        if (!to || !fg || to.x === undefined || to.y === undefined) return dotAt(lastPointer.current);
        const c = fg.graph2ScreenCoords(to.x, to.y);
        const lift = liftOf(to, now);
        return highlightOf(wordBox(to, { x: c.x + lift.x, y: c.y + lift.y }, fg.zoom()));
    }, [liftOf]);

    const pointerShape = useCallback((now: number): PointerShape => {
        const m = pointerMorph.current;
        return lerpShape(m.from, pointerTarget(m.to, now), reducedMotion() ? 1 : springTo(now - m.at, POINTER_RESPONSE_MS));
    }, [pointerTarget]);

    /** Snaps the pointer to a word (null lets go), morphing from wherever its outline is now. */
    const snapTo = useCallback((to: AtlasNode | null) => {
        if (to === pointerMorph.current.to) return;
        const now = performance.now();
        pointerMorph.current = { from: pointerShape(now), to, at: now };
    }, [pointerShape]);

    /**
     * The word a pointer at (x, y) points at: with snapping, the closest within reach of the word or its
     * label (the current one keeping ties); without, only a word right under it.
     */
    const snapTarget = useCallback((x: number, y: number): AtlasNode | null => {
        const fg = fgRef.current;
        if (!fg || !view) return null;
        const k = fg.zoom();
        const current = pointerMorph.current.to;
        let best: AtlasNode | null = null, bestScore = Infinity;
        for (const n of view.nodes) {
            if (n.x === undefined || n.y === undefined) continue;
            const c = fg.graph2ScreenCoords(n.x, n.y);
            if (!snapping) {
                const d = Math.hypot(c.x - x, c.y - y);
                if (d <= radiusFor(n, 0) * k + 4 && d < bestScore) { best = n; bestScore = d; }
                continue;
            }
            const gap = gapTo(wordBox(n, c, k), x, y);
            if (gap > MAGNET_PX + (n === current ? STICKY_PX : 0)) continue;
            // Being inside a word's box beats being near one; then the nearest word wins.
            const score = gap * 4 + Math.hypot(c.x - x, c.y - y) - (n === current ? 6 : 0);
            if (score < bestScore) { best = n; bestScore = score; }
        }
        return best;
    }, [view, snapping]);

    /** Follows the pointer: snaps it, lights up the word it points at, and keeps frames coming for the morph. */
    const trackPointer = useCallback((p: Point | null, snap = true) => {
        pointer.current = p;
        if (p) lastPointer.current = p;
        const moving = !!motionRef.current;
        const to = p && snap && !moving ? snapTarget(p.x, p.y) : null;
        if (to !== pointerMorph.current.to) {
            snapTo(to);
            if (to && to.level !== 0) prefetchWord(to.id);
        }
        // Without snapping the system pointer stays, as a hand over words that can be clicked.
        if (containerRef.current) containerRef.current.style.cursor = !snapping && to && to.level !== 0 ? 'pointer' : '';
        if (!moving) setHovered(to);
        fgRef.current?.d3ReheatSimulation();
    }, [snapTarget, snapTo, snapping]);

    /** The word being pointed at, unless words are moving or have just moved under a pointer at rest. */
    const activeHover = useCallback(() => (motionRef.current || pointerStill.current ? null : hovered), [hovered]);

    // ---- motion ----------------------------------------------------------------
    const readCamera = useCallback((): Camera | null => {
        const fg = fgRef.current;
        if (!fg) return null;
        const c = fg.centerAt() as unknown as Point;
        return { x: c.x, y: c.y, k: fg.zoom() };
    }, []);

    const applyCamera = useCallback((c: Camera) => {
        const fg = fgRef.current;
        if (!fg) return;
        cameraDriving.current = true;
        fg.zoom(c.k);
        fg.centerAt(c.x, c.y);
        cameraDriving.current = false;
    }, []);

    /** The camera right now and how fast it is moving. */
    const cameraNow = useCallback((now: number): { camera: Camera; velocity: Camera } | null => {
        const moving = cameraRef.current;
        if (moving) return cameraAt(moving, now);
        const camera = readCamera();
        return camera && { camera, velocity: { x: 0, y: 0, k: 0 } };
    }, [readCamera]);

    /** Animate the camera alone (zoom buttons, fit, resize). */
    const moveCamera = useCallback((to: Camera) => {
        const now = performance.now();
        const current = cameraNow(now);
        if (!current) return;
        if (reducedMotion()) { cameraRef.current = null; applyCamera(to); return; }
        cameraRef.current = cameraMotion(current.camera, to, current.velocity, now);
        fgRef.current?.d3ReheatSimulation(); // keeps frames coming; every word is pinned, so nothing else moves
    }, [cameraNow, applyCamera]);

    /**
     * Moves every word to its solved position and the camera to frame it, on one shared spring. Everything
     * starts where it is drawn in this very frame, at the speed it already has, so a click in the middle
     * of a transition bends it instead of restarting it.
     */
    const beginTransition = useCallback((
        target: View, targets: Map<string, Point>, outgoing: View | null, glide: boolean, arrivingPills: PillShot[],
    ) => {
        const fg = fgRef.current;
        if (!fg) return;
        const now = performance.now();
        autoFrame.current = true;
        const to = frame(target.nodes, targets);
        const moves = planMoves(target.nodes, targets, statesOf(outgoing, motionRef.current, now));
        const newGraph = !outgoing || outgoing.nodes[0] !== target.nodes[0];
        // The words are about to move: the pointer lets go of the one it held (that word kept the focus
        // until now), and nothing lights up again until the pointer moves.
        snapTo(null);
        pointerStill.current = true;
        if (reducedMotion()) {
            stepMotion({ start: -Infinity, moves }, now);
            markShown(target);
            ghostsRef.current = null;
            shownAt.current = { bubble: -Infinity, pills: -Infinity };
            motionRef.current = null;
            cameraRef.current = null;
            applyCamera(to);
            return;
        }
        carryOver(target, outgoing, now);
        if (outgoing && outgoing !== target) {
            const shows = new Set<RelationGroup>(target.sectors);
            if (target.family.length) shows.add('family');
            const pills = newGraph ? arrivingPills : toggledPills.current.filter((p) => !shows.has(p.group));
            ghostsRef.current = ghostsOf(target, outgoing, motionRef.current, pills, now);
        }
        toggledPills.current = [];
        if (newGraph) shownAt.current.pills = now;
        if (target.family.length && !(outgoing?.family.length && outgoing.origin === target.origin)) shownAt.current.bubble = now;
        motionRef.current = { start: now, moves };
        const camera = cameraNow(now);
        if (glide && camera) {
            cameraRef.current = cameraMotion(camera.camera, to, camera.velocity, now);
        } else {
            cameraRef.current = null;
            applyCamera(to);
        }
        fg.d3ReheatSimulation();
    }, [cameraNow, applyCamera, snapTo, frame]);

    // Runs once per view, as soon as the graph instance exists (its chunk loads lazily) and before the
    // first frame that draws it.
    const settledFor = useRef<View | null>(null);
    const settleView = useCallback(() => {
        const fg = fgRef.current;
        if (!fg || !view || !layout || settledFor.current === view) return;
        const outgoing = settledFor.current;
        settledFor.current = view;
        // The live simulation only keeps frames coming; every position comes from solveLayout.
        fg.d3Force('center', null);
        fg.d3Force('charge')?.strength(0);
        fg.d3Force('link')?.strength(0);
        beginTransition(view, layout, outgoing, outgoing !== null, fetched?.from?.pills ?? []);
    }, [view, layout, fetched, beginTransition]);
    useEffect(() => { settleView(); }, [settleView]);

    // Hover emphasis eases over several frames; keep frames coming even when the layout is at rest.
    useEffect(() => { fgRef.current?.d3ReheatSimulation(); }, [hovered]);

    /** Every frame: advance words and camera along the spring. */
    const onTick = useCallback(() => {
        settleView();
        const now = performance.now();
        const motion = motionRef.current;
        if (motion && stepMotion(motion, now)) motionRef.current = null;
        const camera = cameraRef.current;
        if (camera) {
            const at = cameraAt(camera, now);
            applyCamera(at.camera);
            if (at.done) cameraRef.current = null;
        }
    }, [settleView, applyCamera]);

    const fit = useCallback(() => {
        autoFrame.current = true;
        if (view) moveCamera(frame(view.nodes, restingPositions(view.nodes, motionRef.current)));
    }, [view, frame, moveCamera]);

    // Panels are resizable, and windows move, resize and close over the immersive graph: keep the graph
    // framed in whatever space is left, unless the person has taken the camera.
    useEffect(() => {
        const current = viewRef.current;
        if (!current || !size.width) return;
        const timer = window.setTimeout(() => {
            if (autoFrame.current) moveCamera(frame(current.nodes, restingPositions(current.nodes, motionRef.current)));
        }, 150);
        return () => window.clearTimeout(timer);
    }, [size, obstacleKey, frame, moveCamera]);

    // Brings dragged words back into the layout.
    const relayout = useCallback(() => { if (view && layout) beginTransition(view, layout, view, true, []); }, [view, layout, beginTransition]);

    const zoomBy = (factor: number) => {
        autoFrame.current = false;
        const from = readCamera();
        if (from) moveCamera({ ...from, k: Math.min(4, Math.max(0.25, from.k * factor)) });
    };

    const showZoom = (k: number) => {
        const pct = Math.round(k * 100);
        if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${pct}%`;
        if (zoomSliderRef.current) zoomSliderRef.current.value = String(pct);
    };

    // ---- per-frame overlays (group pills, tooltip) ---------------------------------
    const placeOverlays = useCallback(() => {
        const fg = fgRef.current;
        const area = containerRef.current;
        if (!fg || !view || !area) return;
        const now = performance.now();
        const space = graphSpace();
        const windows = autoFrame.current && dodged.current ? covers() : [];
        // A new graph's labels fade in with it, even when their words were already on screen.
        const graphFade = reducedMotion() ? 1 : clamp01(spring(now - shownAt.current.pills) * ENTER_SPEED);
        const { x: ox, y: oy } = view.origin;
        for (const el of area.querySelectorAll<HTMLElement>('[data-pill]')) {
            const group = el.dataset.pill as RelationGroup;
            const members = view.nodes.filter((n) => n.level === 1 && n.group === group && n.x !== undefined);
            if (!members.length) { el.style.visibility = 'hidden'; continue; }
            // Graph point the pill hangs from, and the direction it extends in (away from its words).
            let x: number, y: number, ux: number, uy: number;
            if (group === 'family') {
                x = ox; y = oy - bubbleRadius(view); ux = 0; uy = -1;
            } else {
                const anchor = view.anchors.get(group);
                if (!anchor) { el.style.visibility = 'hidden'; continue; }
                const d = Math.hypot(anchor.x - ox, anchor.y - oy) || 1;
                ux = (anchor.x - ox) / d; uy = (anchor.y - oy) / d;
                const reach = Math.max(...members.map((n) => (n.x! - ox) * ux + (n.y! - oy) * uy));
                x = ox + ux * (reach + 26);
                y = oy + uy * (reach + 26);
            }
            const p = fg.graph2ScreenCoords(x, y);
            const w = el.offsetWidth, h = el.offsetHeight;
            // Top-left corner of the pill so that it sits on the far side of the point.
            let left = p.x - w / 2 + ux * w / 2;
            // Words carry their label underneath, so leave room for it below the cluster.
            let top = p.y - h / 2 + uy * h / 2 + (uy > 0 ? 16 : 0);
            left = Math.min(Math.max(left, 6), size.width - w - 6);
            top = Math.min(Math.max(top, space.y + 6), size.height - h - 52);
            // While the graph dodges floating windows, its labels stay out from under them too.
            if (windows.length) ({ x: left, y: top } = clearOf({ x: left, y: top, w, h }, windows));
            el.style.visibility = 'visible';
            el.style.opacity = String(Math.min(graphFade, Math.max(...members.map((n) => fadeIn(n.born, now)))));
            el.style.transform = `translate(${left}px, ${top}px)`;
        }
        const empty = area.querySelector<HTMLElement>('[data-empty]');
        const center = view.nodes[0];
        if (empty && center.x !== undefined && center.y !== undefined) {
            const c = fg.graph2ScreenCoords(center.x, center.y);
            const box = wordBox(center, c, fg.zoom());
            // Clear of the word, its label and the gloss line under the label.
            empty.style.transform = `translate(${c.x}px, ${box.y + box.h + 30}px) translate(-50%, 0)`;
            empty.style.opacity = String(graphFade);
            empty.style.visibility = 'visible';
        }
        const tip = tooltipRef.current;
        const hov = activeHover();
        if (tip) {
            const at = hov && hov.x !== undefined ? fg.graph2ScreenCoords(hov.x, hov.y ?? 0) : null;
            tip.style.visibility = at ? 'visible' : 'hidden';
            if (at) tip.style.transform = `translate(${at.x}px, ${at.y - 18}px) translate(-50%, -100%)`;
        }
    }, [view, activeHover, graphSpace, covers, size]);

    // ---- canvas painters -------------------------------------------------------
    const ringAlpha = useCallback((id: string, now: number) => {
        const since = ringSince.current.get(id);
        return since === undefined ? 0 : reducedMotion() ? 1 : clamp01(spring(now - since) * ENTER_SPEED);
    }, []);

    /** How one word of the live graph is drawn this frame. Hover emphasis is animated per word (keyed by id, so it carries across graphs). */
    const livePaint = useCallback((node: AtlasNode, now: number) => {
        const hov = activeHover();
        const isHovered = hov?.id === node.id;
        const near = !!hov && (isHovered || !!neighbours.get(hov.id)?.has(node.id));
        // While the words move, hover emphasis lets go in step with them.
        const response = motionRef.current ? SPRING_RESPONSE_MS : HOVER_RESPONSE_MS;
        const e = easing.current;
        return {
            shown: fadeIn(node.born, now),
            emphasis: animated(e, `h:${node.id}`, isHovered ? 1 : 0, now, response),
            dim: animated(e, `d:${node.id}`, hov && !near && node.level !== 0 ? 1 : 0, now, response),
            near: animated(e, `n:${node.id}`, near ? 1 : 0, now, response),
            lift: liftOf(node, now),
        };
    }, [activeHover, neighbours, liftOf]);

    /** The pointer, behind the words while it is (or is turning into) a highlight, on top of them as a dot. */
    const drawPointer = useCallback((ctx: CanvasRenderingContext2D, now: number, layer: 'under' | 'over') => {
        if (!snapping) return;
        const m = pointerMorph.current;
        const dot = !m.to && (reducedMotion() || now - m.at > 600);
        if ((layer === 'over') !== dot) return;
        const alpha = animated(easing.current, 'pointer', pointer.current ? 1 : 0, now, POINTER_RESPONSE_MS);
        if (alpha > 0.01) paintPointer(ctx, pointerShape(now), alpha, palette);
    }, [snapping, pointerShape, palette]);

    /** Under the live graph: the previous view fading out, the word-family bubble, the pointer's highlight. */
    const paintUnderlay = useCallback((ctx: CanvasRenderingContext2D, scale: number) => {
        // A frame can draw the next view before any tick has run; start its transition first.
        settleView();
        const now = performance.now();
        const ghosts = ghostsRef.current;
        const fade = ghosts ? fadeOut(ghosts.at, now) : 0;
        if (ghosts && fade <= 0) ghostsRef.current = null;
        if (ghosts && fade > 0) {
            // Departing words keep gliding where they were heading and keep their emphasis while they fade.
            if (ghosts.motion) stepMotion(ghosts.motion, now);
            const live = new Map(view?.nodes.map((n) => [n.id, n]));
            const pointOf = (end: string | AtlasNode) => {
                const n = live.get(endpointId(end)) ?? (typeof end === 'object' ? end : undefined);
                return n?.x === undefined || n.y === undefined ? null : { x: n.x, y: n.y };
            };
            const e = easing.current;
            for (const l of ghosts.links) {
                const a = pointOf(l.source), b = pointOf(l.target);
                if (!a || !b) continue;
                const key = pairKey(l);
                paintEdge(ctx, a, b, l, l.morph?.from, morphOf(l.morph, now), fade * fadeIn(l.born, now),
                    held(e, `l:${key}`), held(e, `L:${key}`), palette, scale);
            }
            if (ghosts.bubble) {
                ctx.save();
                ctx.globalAlpha = fade;
                paintBubble(ctx, ghosts.bubble.x, ghosts.bubble.y, ghosts.bubble.r, palette, scale);
                ctx.restore();
            }
            for (const n of ghosts.nodes) {
                if (n.x === undefined || n.y === undefined) continue;
                paintWord(ctx, {
                    x: n.x, y: n.y, look: n, from: n.morph?.from, m: morphOf(n.morph, now),
                    alpha: fade * fadeIn(n.born, now) * (1 - 0.65 * held(e, `d:${n.id}`)),
                    grow: 0.6 + 0.4 * fade,
                    emphasis: held(e, `h:${n.id}`),
                    familiarity: familiarity[n.id],
                    ringAlpha: ringAlpha(n.id, now),
                }, palette, scale);
            }
        }

        if (view?.family.length) {
            // The bubble belongs to the graph, not to its members: a new graph fades its bubble in,
            // even when some members were already on screen.
            ctx.save();
            ctx.globalAlpha = reducedMotion() ? 1 : clamp01(spring(now - shownAt.current.bubble) * ENTER_SPEED);
            paintBubble(ctx, view.origin.x, view.origin.y, bubbleRadius(view), palette, scale);
            ctx.restore();
        }
        drawPointer(ctx, now, 'under');
    }, [view, settleView, familiarity, ringAlpha, drawPointer, palette]);

    const paintLink = useCallback((link: AtlasLink, ctx: CanvasRenderingContext2D, scale: number) => {
        const s = link.source as AtlasNode, e = link.target as AtlasNode;
        if (s.x === undefined || s.y === undefined || e.x === undefined || e.y === undefined) return;
        const now = performance.now();
        const hov = activeHover();
        const lit = !!hov && (s.id === hov.id || e.id === hov.id);
        const response = motionRef.current ? SPRING_RESPONSE_MS : HOVER_RESPONSE_MS;
        const key = pairKey(link);
        const ls = liftOf(s, now), le = liftOf(e, now);
        paintEdge(
            ctx, { x: s.x + ls.x / scale, y: s.y + ls.y / scale }, { x: e.x + le.x / scale, y: e.y + le.y / scale },
            link, link.morph?.from, morphOf(link.morph, now),
            Math.min(fadeIn(link.born, now), fadeIn(s.born, now), fadeIn(e.born, now)),
            animated(easing.current, `l:${key}`, lit ? 1 : 0, now, response),
            animated(easing.current, `L:${key}`, hov && !lit ? 1 : 0, now, response),
            palette, scale,
        );
    }, [activeHover, liftOf, palette]);

    const paintNode = useCallback((node: AtlasNode, ctx: CanvasRenderingContext2D, scale: number) => {
        const now = performance.now();
        const live = livePaint(node, now);
        // Newcomers grow from 60% to full size while fading in; a word whose role changed morphs into it.
        paintWord(ctx, {
            x: (node.x ?? 0) + live.lift.x / scale, y: (node.y ?? 0) + live.lift.y / scale,
            look: node, from: node.morph?.from, m: morphOf(node.morph, now),
            alpha: live.shown * (1 - 0.65 * live.dim),
            grow: 0.6 + 0.4 * live.shown,
            emphasis: live.emphasis,
            familiarity: familiarity[node.id],
            ringAlpha: ringAlpha(node.id, now),
        }, palette, scale);
    }, [livePaint, familiarity, ringAlpha, palette]);

    const paintLabels = useCallback((ctx: CanvasRenderingContext2D, scale: number) => {
        if (!view) return;
        const now = performance.now();
        // Detail fades in with zoom instead of popping at a threshold.
        const glossAlpha = clamp01((scale - 1.05) / 0.2);
        const outerAlpha = clamp01((scale - 1.3) / 0.2);
        const ghosts = ghostsRef.current;
        const fade = ghosts ? fadeOut(ghosts.at, now) : 0;
        if (ghosts && fade > 0) {
            const e = easing.current;
            for (const n of ghosts.nodes) {
                if (n.x === undefined || n.y === undefined) continue;
                paintLabel(ctx, {
                    x: n.x, y: n.y, name: n.name, translation: n.translation,
                    look: n, from: n.morph?.from, m: morphOf(n.morph, now),
                    alpha: fade * fadeIn(n.born, now) * (1 - 0.65 * held(e, `d:${n.id}`)),
                    near: held(e, `n:${n.id}`), glossAlpha, outerAlpha,
                }, palette, scale);
            }
        }
        for (const node of view.nodes) {
            if (node.x === undefined || node.y === undefined) continue;
            const live = livePaint(node, now);
            paintLabel(ctx, {
                x: node.x + live.lift.x / scale, y: node.y + live.lift.y / scale, name: node.name, translation: node.translation,
                look: node, from: node.morph?.from, m: morphOf(node.morph, now),
                alpha: live.shown * (1 - 0.65 * live.dim),
                near: live.near, glossAlpha, outerAlpha,
            }, palette, scale);
        }
        // Group labels of the previous graph sat above everything, as their elements did.
        if (ghosts && fade > 0) {
            ctx.save();
            for (const pill of ghosts.pills) {
                ctx.globalAlpha = fade * pill.alpha;
                paintPill(ctx, pill, palette, scale);
            }
            ctx.restore();
        }
        drawPointer(ctx, now, 'over');
    }, [view, livePaint, drawPointer, palette]);

    // ---- clicks ------------------------------------------------------------------
    /** A click goes to the word the pointer has snapped to, or else to the word it is on. */
    const clickAt = (x: number, y: number) => {
        const n = (snapping ? pointerMorph.current.to : null) ?? snapTarget(x, y);
        if (!n || n.level === 0) return;
        const p = fgRef.current?.graph2ScreenCoords(n.x ?? 0, n.y ?? 0);
        if (p) setPending({ word: n.id, x: p.x, y: p.y });
        onNodeClick?.(n.id);
    };

    // ---- render ----------------------------------------------------------------
    if (!word) {
        return <div className="flex h-full items-center justify-center text-sm tracking-wide text-neutral-500">{t('selectWord')}</div>;
    }

    const totals = atlas?.totals;
    const totalWords = atlas ? atlas.nodes.length - 1 : 0;
    const shownWords = view ? view.nodes.length - 1 : 0;
    const groupsPresent = RELATION_GROUPS.filter((g) => (totals?.[g] ?? 0) > 0);
    const groupLabel = (g: RelationGroup) => t(`atlas.groups.${g}`);
    const backLabel = backTo ? t('atlas.back', { word: backTo }) : t('atlas.backPlain');

    return (
        <div className={`absolute inset-0 overflow-hidden ${immersive ? '' : 'flex flex-col'}`} style={{ background: palette.bg }}>
            {/* Toolbar: a bar above the graph in a panel, a floating card over it when immersive */}
            <div
                ref={toolbarRef}
                className={immersive
                    ? 'absolute left-5 top-5 z-20 flex max-w-[min(46rem,calc(100%-2.5rem))] flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-neutral-800 bg-neutral-950/80 px-3 py-2 shadow-2xl backdrop-blur-md'
                    : 'z-20 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 bg-neutral-950/85 px-3 py-2 backdrop-blur-md'}
            >
                <div className="flex min-w-0 items-center gap-2">
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            title={backLabel}
                            aria-label={backLabel}
                            className="-ml-1 rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white pointer-coarse:p-2"
                        >
                            <ArrowLeft size={16} />
                        </button>
                    )}
                    <div className="min-w-0">
                        <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-emerald-400">{t('atlas.eyebrow')}</div>
                        <div className="flex items-baseline gap-2">
                            <span className="truncate text-lg leading-tight text-white" style={{ fontFamily: "'Instrument Serif', serif" }}>{word}</span>
                            {loading
                                ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-label={t('loadingGraph')} />
                                : !graphError && atlas && fetched?.word === word && <span className="whitespace-nowrap text-[11px] text-neutral-500">{t('atlas.stats', { shown: shownWords, total: totalWords })}</span>}
                        </div>
                    </div>
                </div>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                    {groupsPresent.map((g) => {
                        const on = !hidden.has(g);
                        return (
                            <button
                                key={g}
                                type="button"
                                aria-pressed={on}
                                onClick={() => {
                                    // Its group label fades out on the canvas once its element is gone.
                                    toggledPills.current = pillsOf(fgRef.current ? toGraph : null, containerRef.current);
                                    setHidden((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(g)) next.delete(g); else next.add(g);
                                        return next;
                                    });
                                }}
                                className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] leading-none transition-colors hover:bg-neutral-800 ${on ? 'font-semibold text-neutral-100' : 'border-neutral-800 text-neutral-500'}`}
                                style={on ? { borderColor: GROUP_COLORS[g] } : undefined}
                            >
                                <span className="h-2 w-2 rounded-full" style={{ background: GROUP_COLORS[g], opacity: on ? 1 : 0.4 }} />
                                {groupLabel(g)}
                                <span className="font-normal text-neutral-500">{totals![g]}</span>
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        aria-pressed={secondDegree}
                        title={t('atlas.secondDegreeHint')}
                        onClick={() => setSecondDegree((v) => !v)}
                        className={`rounded border px-2 py-1 text-[11px] leading-none transition-colors ${secondDegree ? 'border-neutral-600 bg-neutral-800 text-neutral-100' : 'border-neutral-800 text-neutral-500 hover:bg-neutral-800'}`}
                    >
                        {t('atlas.secondDegree')}
                    </button>
                    {actions}
                </div>
            </div>

            <div
                ref={attachGraphArea}
                // With snapping on, the canvas draws its own pointer (see "Pointer" above), so the system one hides over it.
                // Panning and pinching belong to the graph, not to page scrolling.
                className={`${immersive ? 'absolute inset-0' : 'relative min-h-0 flex-1'} touch-none ${snapping ? '[&_canvas]:cursor-none' : ''}`}
                // Hover and clicks are resolved here, from where words are drawn right now: force-graph
                // hit-tests against a picture of the graph it refreshes only every 800 ms, which misses (or
                // mistakes) words that are moving. Hover follows the pointer, never words sliding under it.
                onPointerMove={(e) => {
                    pointerStill.current = false;
                    const box = e.currentTarget.getBoundingClientRect();
                    const p = { x: e.clientX - box.left, y: e.clientY - box.top };
                    const from = pressedAt.current;
                    if (from && Math.hypot(p.x - from.x, p.y - from.y) >= 5) {
                        // A drag pans the graph (or moves a word): the camera is the person's now.
                        dragging.current = true;
                        autoFrame.current = false;
                    }
                    // Over the pills and controls the system pointer takes over; touch has no pointer to draw.
                    const onCanvas = e.target instanceof HTMLCanvasElement && e.pointerType !== 'touch';
                    trackPointer(onCanvas ? p : null, !dragging.current);
                }}
                onPointerLeave={() => trackPointer(null)}
                onWheel={() => { autoFrame.current = false; }}
                onPointerDown={(e) => {
                    const box = e.currentTarget.getBoundingClientRect();
                    pressedAt.current = e.button === 0 && e.target instanceof HTMLCanvasElement ? { x: e.clientX - box.left, y: e.clientY - box.top } : null;
                    dragging.current = false;
                }}
                onPointerUp={(e) => {
                    const from = pressedAt.current, dragged = dragging.current;
                    pressedAt.current = null;
                    dragging.current = false;
                    // A click, not the end of a pan or a drag.
                    if (!from || dragged) return;
                    const box = e.currentTarget.getBoundingClientRect();
                    clickAt(e.clientX - box.left, e.clientY - box.top);
                }}
            >
                {/* Graph */}
                {size.width > 0 && view && (
                    <ForceGraph2D
                        ref={fgRef}
                        width={size.width}
                        height={size.height}
                        graphData={graphData}
                        backgroundColor={palette.bg}
                        nodeId="id"
                        nodeLabel={() => ''}
                        nodeRelSize={1}
                        nodeVal={(n: AtlasNode) => (n.level === 0 ? RADIUS.center ** 2 : n.level === 1 ? RADIUS.l1 ** 2 : RADIUS.l2 ** 2)}
                        nodeCanvasObject={paintNode}
                        nodePointerAreaPaint={(n: AtlasNode, color: string, ctx: CanvasRenderingContext2D) => {
                            ctx.fillStyle = color;
                            ctx.beginPath();
                            ctx.arc(n.x ?? 0, n.y ?? 0, (n.level === 0 ? RADIUS.center : n.level === 1 ? RADIUS.l1 : RADIUS.l2) + 5, 0, Math.PI * 2);
                            ctx.fill();
                        }}
                        linkCanvasObject={paintLink}
                        onRenderFramePre={paintUnderlay}
                        onRenderFramePost={(ctx: CanvasRenderingContext2D, scale: number) => { paintLabels(ctx, scale); placeOverlays(); }}
                        onEngineTick={onTick}
                        warmupTicks={0}
                        cooldownTicks={90}
                        onZoom={({ k }: { k: number }) => {
                            showZoom(k);
                            if (cameraDriving.current) return;
                            // The user is panning or zooming: let go of the camera, and let the pointer
                            // snap to whatever word comes under it.
                            cameraRef.current = null;
                            if (pointer.current && !dragging.current) trackPointer(pointer.current);
                        }}
                        onNodeDragEnd={(n: AtlasNode) => { if (n.level !== 0) { n.fx = n.x; n.fy = n.y; } }}
                    />
                )}

                {/* Group pills ("Synonyms 10/13 · show all") */}
                {view && groupsPresent.filter((g) => !hidden.has(g)).map((g) => {
                    const total = totals![g];
                    const shown = Math.min(total, expanded.has(g) ? total : GROUP_CAP);
                    const canToggle = total > GROUP_CAP;
                    const label = expanded.has(g) ? t('atlas.showFewer', { group: groupLabel(g) }) : t('atlas.showAll', { total, group: groupLabel(g) });
                    return (
                        <div
                            key={`${shownWord}|${g}`}
                            data-pill={g}
                            className="pointer-events-auto absolute left-0 top-0 z-10"
                            style={{ visibility: 'hidden' }}
                        >
                            <button
                                type="button"
                                disabled={!canToggle}
                                title={canToggle ? label : undefined}
                                aria-label={canToggle ? label : undefined}
                                onClick={() => setExpandedByWord((prev) => {
                                    if (!shownWord) return prev;
                                    const current = prev[shownWord] ?? [];
                                    return { ...prev, [shownWord]: current.includes(g) ? current.filter((x) => x !== g) : [...current, g] };
                                })}
                                className="whitespace-nowrap rounded-full border bg-neutral-950/90 px-2.5 py-0.5 text-[11px] font-semibold shadow-sm disabled:cursor-default enabled:hover:bg-neutral-900"
                                style={{ borderColor: GROUP_COLORS[g], color: GROUP_COLORS[g] }}
                            >
                                {groupLabel(g)} {g === 'family' ? `· ${shown}` : `${shown}/${total}`}
                                {canToggle && <span className="ml-1 font-normal">{expanded.has(g) ? '−' : '+'}</span>}
                            </button>
                        </div>
                    );
                })}

                {/* States */}
                {loading && !view && <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-neutral-500">{t('loadingGraph')}</div>}
                {graphError && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
                        <div
                            role="alert"
                            className="flex max-w-xs flex-col items-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/90 px-5 py-4 text-center shadow-2xl"
                        >
                            <p className="text-xs leading-relaxed text-neutral-300">
                                {locale === 'zh'
                                    ? `无法加载「${word}」的词链星图，请重试。`
                                    : `Failed to load the word graph for "${word}". Please try again.`}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        graphCache.delete(word.toLowerCase());
                                        setRetryNonce((n) => n + 1);
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-1.5 text-xs font-medium text-neutral-950 transition-colors hover:bg-emerald-400"
                                >
                                    <RotateCcw size={12} />
                                    <span>{locale === 'zh' ? '重试' : 'Retry'}</span>
                                </button>
                                {onBack && (
                                    <button
                                        type="button"
                                        onClick={onBack}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-800"
                                    >
                                        <ArrowLeft size={12} />
                                        <span>{backLabel}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {loading && pending?.word === word && slowWord === word && (
                    <span
                        className="pointer-events-none absolute z-10 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-400 motion-safe:animate-ping"
                        style={{ left: pending.x, top: pending.y }}
                    />
                )}
                {/* A word without neighbours: say so under it, with the way back (placed each frame) */}
                {!loading && atlas && atlas.nodes.length <= 1 && (
                    <div data-empty className="absolute left-0 top-0 z-10 flex w-max max-w-72 flex-col items-center gap-3 text-center" style={{ visibility: 'hidden' }}>
                        <p className="text-sm text-neutral-500">{t('atlas.empty')}</p>
                        {onBack && (
                            <button
                                type="button"
                                onClick={onBack}
                                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-950/80 px-3 py-1.5 text-xs text-neutral-200 transition-colors hover:border-neutral-500 hover:bg-neutral-900 pointer-coarse:px-4 pointer-coarse:py-2.5"
                            >
                                <ArrowLeft size={13} />
                                {backLabel}
                            </button>
                        )}
                    </div>
                )}

                {/* Familiarity legend and zoom bar: at the two bottom corners of a panel; together at the
                    bottom left when immersive, clear of the windows docked on the right */}
                <div className={immersive ? 'absolute bottom-5 left-5 z-10 flex items-center gap-2' : 'contents'}>
                    {size.width >= 640 && (
                        <div className={`${immersive ? '' : 'absolute bottom-3 left-3'} z-10 flex items-center gap-2.5 rounded-md border border-neutral-800 bg-neutral-950/85 px-2.5 py-1.5 text-[10px] text-neutral-400 backdrop-blur`}>
                            <span className="font-semibold text-neutral-300">{t('atlas.legend.title')}</span>
                            {FAMILIARITY_ORDER.map((f) => (
                                <span key={f} className="inline-flex items-center gap-1">
                                    <RingIcon level={f} palette={palette} />
                                    {t(`atlas.legend.${f}`)}
                                </span>
                            ))}
                            <span className="inline-flex items-center gap-1">
                                <span className="h-2.5 w-2.5 rounded-full border border-dashed border-neutral-500" />
                                {t('atlas.legend.unbuilt')}
                            </span>
                        </div>
                    )}

                    {/* Zoom bar */}
                    <div className={`${immersive ? '' : 'absolute bottom-3 right-3'} z-10 flex items-center gap-1 rounded-md border border-neutral-800 bg-neutral-950/85 px-1.5 py-1 text-neutral-400 backdrop-blur`}>
                        <button type="button" onClick={() => zoomBy(1 / 1.25)} title={t('zoomOut')} aria-label={t('zoomOut')} className="rounded p-1 hover:bg-neutral-800 hover:text-white pointer-coarse:p-2"><Minus size={14} /></button>
                        <input
                            ref={zoomSliderRef}
                            type="range"
                            min={25}
                            max={400}
                            step={5}
                            defaultValue={100}
                            onChange={(e) => {
                                const from = readCamera();
                                cameraRef.current = null;
                                autoFrame.current = false;
                                if (from) applyCamera({ ...from, k: Number(e.target.value) / 100 });
                            }}
                            aria-label={t('atlas.zoom')}
                            className="hidden h-1 w-20 cursor-pointer accent-emerald-500 md:block"
                        />
                        <button type="button" onClick={() => zoomBy(1.25)} title={t('zoomIn')} aria-label={t('zoomIn')} className="rounded p-1 hover:bg-neutral-800 hover:text-white pointer-coarse:p-2"><Plus size={14} /></button>
                        <span ref={zoomLabelRef} className="w-9 text-center text-[10px] tabular-nums">100%</span>
                        <button
                            type="button"
                            aria-pressed={snapping}
                            onClick={() => updateSettings({ graphPointerSnap: !snapping })}
                            title={t('atlas.snap')}
                            aria-label={t('atlas.snap')}
                            className={`rounded p-1 hover:bg-neutral-800 pointer-coarse:p-2 ${snapping ? 'text-emerald-400 hover:text-emerald-300' : 'hover:text-white'}`}
                        >
                            <Magnet size={14} />
                        </button>
                        <button type="button" onClick={() => fit()} title={t('atlas.fit')} aria-label={t('atlas.fit')} className="rounded p-1 hover:bg-neutral-800 hover:text-white pointer-coarse:p-2"><Maximize size={14} /></button>
                        <button type="button" onClick={relayout} title={t('atlas.relayout')} aria-label={t('atlas.relayout')} className="rounded p-1 hover:bg-neutral-800 hover:text-white pointer-coarse:p-2"><RotateCcw size={14} /></button>
                    </div>
                </div>

                {/* Hover tooltip */}
                {showHoverTooltip && showGraphTooltip && hovered && !loading && (
                    <div ref={tooltipRef} className="pointer-events-none absolute left-0 top-0 z-30" style={{ visibility: 'hidden' }}>
                        <WordTooltip word={hovered.name} phonetic={hovered.phonetic} translation={hovered.translation} />
                    </div>
                )}
            </div>
        </div>
    );
}
