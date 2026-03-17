import React, { useMemo, useRef, useEffect } from 'react';
import useStore from '../store';
import { GitBranch, X } from 'lucide-react';

const NODE_RADIUS = 8;
const NODE_SPACING = 50;
const LANE_HEIGHT = 30;
const PADDING_Y = 20;
const PADDING_X = 30;

// Assign lanes to commits for branch visualization
const assignLanes = (commits) => {
    if (!commits.length) return { nodes: [], maxLane: 0 };

    const hashToIdx = {};
    commits.forEach((c, i) => { hashToIdx[c.hash] = i; });

    const nodes = commits.map((c, i) => ({
        ...c,
        index: i,
        lane: 0,
        x: 0,
        y: 0
    }));

    // Simple lane assignment: track active lanes
    const activeLanes = []; // each entry is the hash of the commit occupying that lane
    let maxLane = 0;

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        // Find if this commit continues an existing lane
        let assignedLane = -1;
        for (let l = 0; l < activeLanes.length; l++) {
            if (activeLanes[l] === node.hash) {
                assignedLane = l;
                break;
            }
        }

        if (assignedLane === -1) {
            // New lane
            assignedLane = activeLanes.indexOf(null);
            if (assignedLane === -1) {
                assignedLane = activeLanes.length;
                activeLanes.push(null);
            }
        }

        node.lane = assignedLane;
        maxLane = Math.max(maxLane, assignedLane);

        // First parent continues in the same lane
        if (node.parents.length > 0) {
            activeLanes[assignedLane] = node.parents[0];
        } else {
            activeLanes[assignedLane] = null;
        }

        // Additional parents (merges) get their own lanes
        for (let p = 1; p < node.parents.length; p++) {
            const parentHash = node.parents[p];
            // Check if parent already has a lane
            let found = false;
            for (let l = 0; l < activeLanes.length; l++) {
                if (activeLanes[l] === parentHash) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                let freeLane = activeLanes.indexOf(null);
                if (freeLane === -1) {
                    freeLane = activeLanes.length;
                    activeLanes.push(null);
                }
                activeLanes[freeLane] = parentHash;
                maxLane = Math.max(maxLane, freeLane);
            }
        }

        // Set position
        node.x = PADDING_X + i * NODE_SPACING;
        node.y = PADDING_Y + node.lane * LANE_HEIGHT;
    }

    return { nodes, maxLane };
};

// Lane colors
const LANE_COLORS = [
    '#60a5fa', // blue
    '#34d399', // green
    '#f472b6', // pink
    '#a78bfa', // purple
    '#fbbf24', // amber
    '#fb923c', // orange
    '#06b6d4', // cyan
    '#ef4444', // red
    '#84cc16', // lime
    '#e879f9', // fuchsia
];

const getLaneColor = (lane) => LANE_COLORS[lane % LANE_COLORS.length];

const CommitGraph = () => {
    const {
        commitGraph,
        currentCommitIndex,
        commits,
        setCommitIndex,
        showCommitGraph,
        toggleCommitGraph
    } = useStore();

    const scrollRef = useRef(null);
    const activeNodeRef = useRef(null);

    const { nodes, maxLane } = useMemo(() => assignLanes(commitGraph), [commitGraph]);

    // Map commitGraph hashes to main commits index for navigation
    const hashToCommitIdx = useMemo(() => {
        const map = {};
        commits.forEach((c, i) => { map[c.hash] = i; });
        return map;
    }, [commits]);

    // Auto-scroll to active node
    useEffect(() => {
        if (activeNodeRef.current && scrollRef.current) {
            const container = scrollRef.current;
            const node = activeNodeRef.current;
            const nodeLeft = node.getBoundingClientRect().left - container.getBoundingClientRect().left + container.scrollLeft;
            container.scrollTo({
                left: nodeLeft - container.clientWidth / 2,
                behavior: 'smooth'
            });
        }
    }, [currentCommitIndex, showCommitGraph]);

    if (!showCommitGraph || nodes.length === 0) return null;

    const svgWidth = PADDING_X * 2 + nodes.length * NODE_SPACING;
    const svgHeight = PADDING_Y * 2 + (maxLane + 1) * LANE_HEIGHT;
    const activeHash = commits[currentCommitIndex]?.hash;

    // Build connections
    const connections = [];
    const hashToNode = {};
    nodes.forEach(n => { hashToNode[n.hash] = n; });

    nodes.forEach(node => {
        node.parents.forEach(parentHash => {
            const parentNode = hashToNode[parentHash];
            if (parentNode) {
                connections.push({
                    from: node,
                    to: parentNode,
                    isMerge: node.parents.length > 1 && parentHash !== node.parents[0]
                });
            }
        });
    });

    return (
        <div className="pointer-events-auto w-full max-w-4xl mx-auto mb-2">
            <div className="bg-slate-900/90 backdrop-blur border border-slate-700 rounded-xl custom-shadow overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/50">
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                        <GitBranch size={14} className="text-blue-400" />
                        <span className="font-medium">Commit Graph</span>
                        <span className="text-xs text-slate-500">({nodes.length} commits)</span>
                    </div>
                    <button onClick={toggleCommitGraph} className="text-slate-400 hover:text-white transition">
                        <X size={16} />
                    </button>
                </div>

                {/* Scrollable SVG */}
                <div
                    ref={scrollRef}
                    className="overflow-x-auto overflow-y-hidden"
                    style={{ maxHeight: Math.min(svgHeight + 10, 160) }}
                >
                    <svg
                        width={svgWidth}
                        height={svgHeight}
                        className="block"
                    >
                        <defs>
                            <filter id="glow">
                                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                                <feMerge>
                                    <feMergeNode in="coloredBlur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                        </defs>

                        {/* Connections */}
                        {connections.map((conn, i) => {
                            const { from, to, isMerge } = conn;
                            if (from.lane === to.lane) {
                                // Straight line
                                return (
                                    <line
                                        key={`conn-${i}`}
                                        x1={from.x} y1={from.y}
                                        x2={to.x} y2={to.y}
                                        stroke={getLaneColor(from.lane)}
                                        strokeWidth={2}
                                        strokeOpacity={0.5}
                                    />
                                );
                            } else {
                                // Curved path for merges / branch connections
                                const midX = (from.x + to.x) / 2;
                                return (
                                    <path
                                        key={`conn-${i}`}
                                        d={`M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`}
                                        stroke={isMerge ? getLaneColor(to.lane) : getLaneColor(from.lane)}
                                        strokeWidth={2}
                                        strokeOpacity={0.4}
                                        fill="none"
                                        strokeDasharray={isMerge ? "4 3" : "none"}
                                    />
                                );
                            }
                        })}

                        {/* Nodes */}
                        {nodes.map((node) => {
                            const isActive = node.hash === activeHash;
                            const color = getLaneColor(node.lane);
                            const commitIdx = hashToCommitIdx[node.hash];

                            return (
                                <g
                                    key={node.hash}
                                    ref={isActive ? activeNodeRef : null}
                                    onClick={() => {
                                        if (commitIdx !== undefined) setCommitIndex(commitIdx);
                                    }}
                                    style={{ cursor: commitIdx !== undefined ? 'pointer' : 'default' }}
                                >
                                    {/* Glow for active */}
                                    {isActive && (
                                        <circle
                                            cx={node.x} cy={node.y}
                                            r={NODE_RADIUS + 5}
                                            fill="none"
                                            stroke={color}
                                            strokeWidth={2}
                                            opacity={0.6}
                                            filter="url(#glow)"
                                        >
                                            <animate
                                                attributeName="r"
                                                values={`${NODE_RADIUS + 4};${NODE_RADIUS + 7};${NODE_RADIUS + 4}`}
                                                dur="2s"
                                                repeatCount="indefinite"
                                            />
                                            <animate
                                                attributeName="opacity"
                                                values="0.6;0.3;0.6"
                                                dur="2s"
                                                repeatCount="indefinite"
                                            />
                                        </circle>
                                    )}

                                    {/* Node circle */}
                                    <circle
                                        cx={node.x} cy={node.y}
                                        r={isActive ? NODE_RADIUS + 2 : NODE_RADIUS}
                                        fill={isActive ? color : '#1e293b'}
                                        stroke={color}
                                        strokeWidth={isActive ? 3 : 2}
                                    />

                                    {/* Merge indicator (diamond inside) */}
                                    {node.parents.length > 1 && (
                                        <rect
                                            x={node.x - 3} y={node.y - 3}
                                            width={6} height={6}
                                            fill={color}
                                            transform={`rotate(45, ${node.x}, ${node.y})`}
                                        />
                                    )}

                                    {/* Tooltip */}
                                    <title>{`${node.message.split('\n')[0]}\n${node.author_name}\n${node.hash.substring(0, 8)}`}</title>
                                </g>
                            );
                        })}
                    </svg>
                </div>
            </div>
        </div>
    );
};

export default CommitGraph;
