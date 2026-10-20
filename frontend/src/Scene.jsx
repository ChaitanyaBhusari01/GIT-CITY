import React, { useMemo, useState } from 'react';
import useStore from './store';
import * as THREE from 'three';
import { useSpring, animated as Animated } from '@react-spring/three';
import { getFileType } from './utils/getFileType';
import LANGUAGE_COLORS from './utils/languageColors';
import CityTooltip from './components/CityTooltip';
import ContributorTowers from './components/ContributorTowers';
import DependencyBridges from './components/DependencyBridges';
import DistrictLabels from './components/DistrictLabels';

// ─── Color Palettes ──────────────────────────────────────────────────────────
// Each folder gets a unique hue-based palette
const FOLDER_HUES = [
    210, 160, 280, 30, 340, 120, 45, 190, 300, 75,
    350, 150, 240, 20, 90, 180, 270, 60, 320, 100
];

const FILE_COLORS = {
    js: '#fef08a', jsx: '#fef08a',
    ts: '#60a5fa', tsx: '#60a5fa',
    css: '#f472b6', scss: '#f472b6',
    json: '#a78bfa',
    md: '#9ca3af',
    html: '#fb923c',
    py: '#3b82f6',
    go: '#06b6d4',
    rs: '#f97316',
    java: '#ef4444',
    rb: '#dc2626',
    c: '#64748b', h: '#64748b',
    cpp: '#94a3b8', hpp: '#94a3b8',
    default: '#34d399'
};

const getFileColor = (fileName) => {
    const lang = getFileType(fileName);
    return LANGUAGE_COLORS[lang] || LANGUAGE_COLORS.Unknown;
};

// Heatmap: interpolate from cool blue → hot red based on commit activity
const getHeatColor = (commits, maxCommits) => {
    // Files with no tracked commits show as neutral dark gray
    if (commits === 0) return '#3a3a4a';
    // Log-scale ratio for better visual spread
    const ratio = Math.min(1, Math.log1p(commits) / Math.log1p(Math.max(1, maxCommits)));
    // Hue from 240 (blue) through 60 (yellow) to 0 (red)
    const hue = (1 - ratio) * 240;
    const saturation = 80 + ratio * 20; // more saturated when hot
    const lightness = 40 + ratio * 15;  // brighter when hot
    const color = new THREE.Color(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    return '#' + color.getHexString();
};

// Generate a folder-based color with slight per-file variation
const getFolderColor = (folderIndex, fileIndex) => {
    const hue = FOLDER_HUES[folderIndex % FOLDER_HUES.length];
    // Slight hue + lightness variation per file
    const hueShift = (fileIndex * 7) % 20 - 10;
    const lightShift = (fileIndex * 3) % 10;
    const c = new THREE.Color();
    c.setHSL(
        ((hue + hueShift) % 360) / 360,
        0.55 + (fileIndex % 3) * 0.1,
        0.45 + lightShift * 0.015
    );
    return '#' + c.getHexString();
};

// ─── City Layout Algorithm ───────────────────────────────────────────────────
// Groups files by directory, arranges them as city blocks with streets

const BUILDING_WIDTH = 1.8;
const BUILDING_DEPTH = 1.8;
const BUILDING_GAP = 0.6;        // gap between buildings in a block
const STREET_WIDTH = 4.0;         // space between blocks (streets)
const BLOCK_PADDING = 1.5;        // padding inside each block
const MAX_BLOCK_COLS = 6;         // max buildings per row in a block
const CITY_MAX_COLS = 5;          // max blocks per row in the city grid

function computeCityLayout(tree) {
    const files = tree.filter(item => item.type === 'blob');
    if (files.length === 0) return { blocks: [], maxSize: 0, cityWidth: 0, cityDepth: 0 };

    const maxSize = files.reduce((max, f) => Math.max(max, f.size), 0);

    // Group files by directory
    const dirs = {};
    files.forEach(f => {
        const parts = f.path.split('/');
        parts.pop();
        const dir = parts.join('/') || 'root';
        if (!dirs[dir]) dirs[dir] = [];
        dirs[dir].push(f);
    });

    const dirKeys = Object.keys(dirs).sort();
    const blocks = [];

    // For each directory, compute internal layout
    dirKeys.forEach((dir, dirIndex) => {
        const dirFiles = dirs[dir];
        const cols = Math.min(MAX_BLOCK_COLS, Math.ceil(Math.sqrt(dirFiles.length)));
        const rows = Math.ceil(dirFiles.length / cols);

        const blockWidth = cols * (BUILDING_WIDTH + BUILDING_GAP) - BUILDING_GAP + BLOCK_PADDING * 2;
        const blockDepth = rows * (BUILDING_DEPTH + BUILDING_GAP) - BUILDING_GAP + BLOCK_PADDING * 2;

        const buildings = dirFiles.map((f, fileIndex) => {
            const col = fileIndex % cols;
            const row = Math.floor(fileIndex / cols);
            // Height: log-based with minimum, scaled for visual impact
            const height = Math.max(1.2, Math.log1p(f.size) * 0.8);

            return {
                data: f,
                fileIndex,
                localX: BLOCK_PADDING + col * (BUILDING_WIDTH + BUILDING_GAP),
                localZ: BLOCK_PADDING + row * (BUILDING_DEPTH + BUILDING_GAP),
                height,
                width: BUILDING_WIDTH,
                depth: BUILDING_DEPTH
            };
        });

        blocks.push({
            dir,
            dirIndex,
            buildings,
            blockWidth,
            blockDepth,
            cols,
            rows
        });
    });

    // Arrange blocks in a grid with streets
    let gridX = 0;
    let gridZ = 0;
    let rowMaxDepth = 0;
    let colInRow = 0;
    let cityWidth = 0;
    let cityDepth = 0;

    blocks.forEach((block, index) => {
        block.rowIndex = Math.floor(index / CITY_MAX_COLS);
        block.worldX = gridX;
        block.worldZ = gridZ;

        cityWidth = Math.max(cityWidth, gridX + block.blockWidth);

        rowMaxDepth = Math.max(rowMaxDepth, block.blockDepth);
        colInRow++;

        if (colInRow >= CITY_MAX_COLS) {
            colInRow = 0;
            gridX = 0;
            gridZ += rowMaxDepth + STREET_WIDTH;
            cityDepth = gridZ;
            rowMaxDepth = 0;
        } else {
            gridX += block.blockWidth + STREET_WIDTH;
        }
    });

    cityDepth = Math.max(cityDepth, gridZ + rowMaxDepth);

    // Center the city around origin
    const offsetX = -cityWidth / 2;
    const offsetZ = -cityDepth / 2;
    blocks.forEach(block => {
        block.worldX += offsetX;
        block.worldZ += offsetZ;
    });

    const roads = [];
    const rows = Array.from({ length: Math.ceil(blocks.length / CITY_MAX_COLS) }, (_, rowIndex) =>
        blocks.filter(block => block.rowIndex === rowIndex)
    );

    rows.forEach((row, rowIndex) => {
        const rowDepth = Math.max(...row.map(block => block.blockDepth));
        row.slice(0, -1).forEach((block, index) => {
            const next = row[index + 1];
            const startX = block.worldX + block.blockWidth;
            const width = next.worldX - startX;
            if (width > 0) {
                roads.push({
                    x: startX + width / 2,
                    z: block.worldZ + rowDepth / 2,
                    width,
                    depth: rowDepth
                });
            }
        });

        const nextRow = rows[rowIndex + 1];
        if (nextRow) {
            const nextRowZ = nextRow[0].worldZ;
            const roadStartZ = row[0].worldZ + rowDepth;
            const depth = nextRowZ - roadStartZ;
            const sharedLeft = Math.max(
                Math.min(...row.map(block => block.worldX)),
                Math.min(...nextRow.map(block => block.worldX))
            );
            const sharedRight = Math.min(
                Math.max(...row.map(block => block.worldX + block.blockWidth)),
                Math.max(...nextRow.map(block => block.worldX + block.blockWidth))
            );
            if (depth > 0 && sharedRight > sharedLeft) {
                roads.push({
                    x: sharedLeft + (sharedRight - sharedLeft) / 2,
                    z: roadStartZ + depth / 2,
                    width: sharedRight - sharedLeft,
                    depth
                });
            }
        }
    });

    return { blocks, roads, maxSize, cityWidth, cityDepth };
}

// ─── Individual Building Component ───────────────────────────────────────────

const Building = ({ data, position, height, width, depth, color, isSelected, onClick, colorMode, maxCommits, folderIndex, fileIndex, commitCount, isMostEdited, onHover, onUnhover }) => {

    const buildingColor = colorMode === 'heatmap'
        ? getHeatColor(commitCount, maxCommits)
        : colorMode === 'folder'
            ? getFolderColor(folderIndex, fileIndex)
            : color;

    // Floors: stack multiple segments for a voxel "floor" look
    const floors = Math.max(1, Math.round(height / 1.2));
    const floorHeight = height / floors;
    const baseColor = new THREE.Color(buildingColor);

    // Is most edited file globally glowing?
    const glowingBase = isMostEdited ? '#fbbf24' : (isSelected ? buildingColor : '#000000');
    const emissiveInt = isMostEdited ? 1.5 : (isSelected ? 0.5 : 0);

    // Setup spring animation for timeline changes
    const { scaleY, yPos } = useSpring({
        scaleY: 1,
        yPos: position[1], // from 0.05
        from: { scaleY: 0.1, yPos: -2 },
        config: { mass: 1, tension: 120, friction: 14 }
    });

    return (
        <Animated.group
            position-x={position[0]}
            position-y={yPos}
            position-z={position[2]}
            scale-y={scaleY}
        >
            {/* Building floors */}
            {Array.from({ length: floors }, (_, i) => {
                // Slight inset for upper floors for a stepped look
                const inset = i > 0 ? Math.min(0.08 * i, 0.2) : 0;
                const floorColor = baseColor.clone();
                // Darken lower floors slightly for depth
                floorColor.offsetHSL(0, 0, -i * 0.02);

                return (
                    <mesh
                        key={i}
                        position={[0, i * floorHeight + floorHeight / 2, 0]}
                        castShadow
                        receiveShadow
                        onClick={(e) => { e.stopPropagation(); onClick(data); }}
                        onPointerOver={(e) => { e.stopPropagation(); onHover(data, e.point); }}
                        onPointerOut={(e) => { e.stopPropagation(); onUnhover(); }}
                    >
                        <boxGeometry args={[
                            width - inset * 2,
                            floorHeight - 0.05,
                            depth - inset * 2
                        ]} />
                        <meshStandardMaterial
                            color={'#' + floorColor.getHexString()}
                            roughness={0.65}
                            metalness={0.15}
                            emissive={glowingBase}
                            emissiveIntensity={emissiveInt}
                        />
                    </mesh>
                );
            })}

            {/* Roof cap — slightly darker */}
            <mesh
                position={[0, height + 0.08, 0]}
                castShadow
            >
                <boxGeometry args={[width - 0.3, 0.15, depth - 0.3]} />
                <meshStandardMaterial
                    color={baseColor.clone().offsetHSL(0, 0, -0.1).getHexString()}
                    roughness={0.8}
                    metalness={0.1}
                />
            </mesh>

            {/* Windows (small cubes on sides) — count tied to commits */}
            {height > 1.5 && floors > 1 && commitCount > 0 && (
                <WindowDetails
                    width={width}
                    depth={depth}
                    height={height}
                    floors={floors}
                    floorHeight={floorHeight}
                    commitCount={commitCount}
                />
            )}
        </Animated.group>
    );
};

// ─── Window Details ──────────────────────────────────────────────────────────

const WindowDetails = ({ width, depth, floors, floorHeight, commitCount }) => {
    const windows = [];
    const windowSize = 0.2;
    const windowDepth = 0.05;

    // Cap brightness to visualize very active files vs moderately active files
    const brightIntensity = Math.min(2.5, 0.3 + (commitCount * 0.15));
    // Number of floor bands gets higher with commitCount (max up to actual floors limit)
    const windowFloors = Math.min(floors, Math.max(1, Math.ceil(commitCount / 2)));

    for (let floor = 0; floor < Math.min(windowFloors, 8); floor++) {
        const y = floor * floorHeight + floorHeight * 0.55;
        const windowsPerSide = Math.max(1, Math.floor(width / 0.6));

        for (let w = 0; w < windowsPerSide; w++) {
            const wx = -width / 2 + 0.3 + w * (width - 0.6) / Math.max(1, windowsPerSide - 1);

            // Front windows
            windows.push(
                <mesh key={`f-${floor}-${w}`} position={[wx, y, depth / 2 + windowDepth / 2]}>
                    <boxGeometry args={[windowSize, windowSize, windowDepth]} />
                    <meshStandardMaterial color="#fef9c3" emissive="#fef9c3" emissiveIntensity={brightIntensity} transparent opacity={0.8} />
                </mesh>
            );
            // Back windows
            windows.push(
                <mesh key={`b-${floor}-${w}`} position={[wx, y, -depth / 2 - windowDepth / 2]}>
                    <boxGeometry args={[windowSize, windowSize, windowDepth]} />
                    <meshStandardMaterial color="#fef9c3" emissive="#fef9c3" emissiveIntensity={brightIntensity} transparent opacity={0.8} />
                </mesh>
            );
        }
    }

    return <group>{windows}</group>;
};

// ─── Folder Block Platform ───────────────────────────────────────────────────

const BlockPlatform = ({ position, width, depth, dirIndex }) => {
    const hue = FOLDER_HUES[dirIndex % FOLDER_HUES.length];
    const platformColor = new THREE.Color();
    platformColor.setHSL(hue / 360, 0.3, 0.15);
    const borderColor = new THREE.Color();
    borderColor.setHSL(hue / 360, 0.5, 0.25);

    return (
        <group position={position}>
            {/* Platform base */}
            <mesh position={[width / 2, 0.1, depth / 2]} receiveShadow>
                <boxGeometry args={[width, 0.2, depth]} />
                <meshStandardMaterial
                    color={'#' + platformColor.getHexString()}
                    roughness={0.9}
                    metalness={0.05}
                />
            </mesh>

            {/* Platform border (thin raised edge) */}
            {/* Front */}
            <mesh position={[width / 2, 0.3, 0]} receiveShadow>
                <boxGeometry args={[width + 0.2, 0.2, 0.15]} />
                <meshStandardMaterial color={'#' + borderColor.getHexString()} roughness={0.7} metalness={0.2} />
            </mesh>
            {/* Back */}
            <mesh position={[width / 2, 0.3, depth]} receiveShadow>
                <boxGeometry args={[width + 0.2, 0.2, 0.15]} />
                <meshStandardMaterial color={'#' + borderColor.getHexString()} roughness={0.7} metalness={0.2} />
            </mesh>
            {/* Left */}
            <mesh position={[0, 0.3, depth / 2]} receiveShadow>
                <boxGeometry args={[0.15, 0.2, depth]} />
                <meshStandardMaterial color={'#' + borderColor.getHexString()} roughness={0.7} metalness={0.2} />
            </mesh>
            {/* Right */}
            <mesh position={[width, 0.3, depth / 2]} receiveShadow>
                <boxGeometry args={[0.15, 0.2, depth]} />
                <meshStandardMaterial color={'#' + borderColor.getHexString()} roughness={0.7} metalness={0.2} />
            </mesh>
        </group>
    );
};

const BlockAlleys = ({ block }) => {
    const laneWidth = 0.38;
    const verticalAlleys = Array.from({ length: block.cols - 1 }, (_, col) =>
        BLOCK_PADDING + col * (BUILDING_WIDTH + BUILDING_GAP) + (BUILDING_WIDTH + BUILDING_GAP) / 2
    );
    const horizontalAlleys = Array.from({ length: block.rows - 1 }, (_, row) =>
        BLOCK_PADDING + row * (BUILDING_DEPTH + BUILDING_GAP) + (BUILDING_DEPTH + BUILDING_GAP) / 2
    );

    return (
        <group>
            {verticalAlleys.map((x, index) => (
                <mesh key={`vertical-${index}`} position={[x, 0.21, block.blockDepth / 2]}>
                    <boxGeometry args={[laneWidth, 0.02, block.blockDepth - BLOCK_PADDING * 2]} />
                    <meshStandardMaterial color="#202a38" roughness={0.96} metalness={0.02} />
                </mesh>
            ))}
            {horizontalAlleys.map((z, index) => (
                <mesh key={`horizontal-${index}`} position={[block.blockWidth / 2, 0.21, z]}>
                    <boxGeometry args={[block.blockWidth - BLOCK_PADDING * 2, 0.02, laneWidth]} />
                    <meshStandardMaterial color="#202a38" roughness={0.96} metalness={0.02} />
                </mesh>
            ))}
        </group>
    );
};

const CityRoad = ({ road }) => {
    const horizontal = road.width >= road.depth;
    const roadLength = horizontal ? road.width : road.depth;
    const crossSpan = horizontal ? road.depth : road.width;
    const asphaltSpan = Math.max(0.5, crossSpan - 1.2);
    const sidewalkWidth = Math.max(0, (crossSpan - asphaltSpan) / 2);
    const dashCount = Math.max(1, Math.floor(roadLength / 5));
    const dashLength = Math.min(1.8, roadLength / (dashCount * 2));
    const sidewalkOffset = asphaltSpan / 2 + sidewalkWidth / 2;

    return (
        <group position={[road.x, 0, road.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]} receiveShadow>
                <planeGeometry args={horizontal ? [road.width, asphaltSpan] : [asphaltSpan, road.depth]} />
                <meshStandardMaterial color="#202a38" roughness={0.96} metalness={0.02} />
            </mesh>
            {sidewalkWidth > 0 && [-1, 1].map(side => (
                <mesh
                    key={`sidewalk-${side}`}
                    rotation={[-Math.PI / 2, 0, 0]}
                    position={horizontal ? [0, 0.026, side * sidewalkOffset] : [side * sidewalkOffset, 0.026, 0]}
                >
                    <planeGeometry args={horizontal ? [road.width, sidewalkWidth] : [sidewalkWidth, road.depth]} />
                    <meshStandardMaterial color="#46515d" roughness={0.92} />
                </mesh>
            ))}
            {Array.from({ length: dashCount }, (_, index) => {
                const along = (index + 0.5) * roadLength / dashCount - roadLength / 2;
                return (
                    <mesh
                        key={index}
                        position={horizontal ? [along, 0.045, 0] : [0, 0.045, along]}
                    >
                        <boxGeometry args={horizontal ? [dashLength, 0.02, 0.12] : [0.12, 0.02, dashLength]} />
                        <meshStandardMaterial color="#d6c99a" roughness={0.8} />
                    </mesh>
                );
            })}
        </group>
    );
};

// ─── Ground Plane ────────────────────────────────────────────────────────────

const CityGround = ({ size }) => {
    const groundSize = Math.max(200, size * 2);

    return (
        <group>
            {/* Main ground */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
                <planeGeometry args={[groundSize, groundSize]} />
                <meshStandardMaterial color="#0c1222" roughness={1} metalness={0} />
            </mesh>

            {/* Grid helper for streets/terrain feel */}
            <gridHelper
                args={[groundSize, Math.floor(groundSize / 4), '#1e293b', '#141c2e']}
                position={[0, 0.01, 0]}
            />

            {/* Secondary subtle grid */}
            <gridHelper
                args={[groundSize, Math.floor(groundSize / 1), '#0f1724', '#0c1222']}
                position={[0, 0.005, 0]}
            />
        </group>
    );
};

// ─── Street Lamps (decorative) ───────────────────────────────────────────────

const StreetLamp = ({ position }) => (
    <group position={position}>
        {/* Pole */}
        <mesh position={[0, 1.5, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.08, 3, 6]} />
            <meshStandardMaterial color="#475569" roughness={0.6} metalness={0.4} />
        </mesh>
        {/* Light bulb */}
        <mesh position={[0, 3.1, 0]}>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshStandardMaterial
                color="#fef9c3"
                emissive="#fef9c3"
                emissiveIntensity={0.8}
                roughness={0.3}
            />
        </mesh>
        {/* Point light */}
        <pointLight
            position={[0, 3, 0]}
            color="#fef9c3"
            intensity={0.6}
            distance={10}
            decay={2}
        />
    </group>
);

const CityTree = ({ position }) => (
    <group position={position}>
        <mesh position={[0, 0.85, 0]} castShadow>
            <cylinderGeometry args={[0.14, 0.22, 1.7, 7]} />
            <meshStandardMaterial color="#76533a" roughness={0.9} />
        </mesh>
        <mesh position={[0, 2.1, 0]} castShadow>
            <coneGeometry args={[1.05, 2.2, 7]} />
            <meshStandardMaterial color="#34734c" roughness={0.86} />
        </mesh>
        <mesh position={[0, 3.05, 0]} castShadow>
            <coneGeometry args={[0.72, 1.7, 7]} />
            <meshStandardMaterial color="#4d925d" roughness={0.86} />
        </mesh>
    </group>
);

// ─── Main Scene ──────────────────────────────────────────────────────────────

const Scene = ({ colorMode = 'filetype' }) => {
    const { tree, selectFile, selectedFile, languageFilter, fileStats } = useStore();
    const [hoveredFile, setHoveredFile] = useState(null);
    const [hoverPos, setHoverPos] = useState([0, 0, 0]);

    // Compute max commits and most edited file
    const { maxCommits, mostEditedPath } = useMemo(() => {
        let maxCommits = 1;
        let mostEditedPath = null;
        if (fileStats && Object.keys(fileStats).length > 0) {
            let maxCount = 0;
            for (const [path, stat] of Object.entries(fileStats)) {
                if (stat.commitCount > maxCount) {
                    maxCount = stat.commitCount;
                    mostEditedPath = path;
                }
            }
            maxCommits = Math.max(1, maxCount);
        }
        return { maxCommits, mostEditedPath };
    }, [fileStats]);

    const { blocks, roads, cityWidth, cityDepth, lamps, trees } = useMemo(() => {
        const result = computeCityLayout(tree);
        const lampPositions = [];
        const treePositions = [];
        result.roads.forEach(road => {
            const horizontal = road.width >= road.depth;
            const length = horizontal ? road.width : road.depth;
            const crossSpan = horizontal ? road.depth : road.width;
            const asphaltSpan = Math.max(0.5, crossSpan - 1.2);
            const sidewalkWidth = Math.max(0, (crossSpan - asphaltSpan) / 2);
            const sidewalkOffset = asphaltSpan / 2 + sidewalkWidth / 2;
            const lampCount = Math.max(1, Math.floor(length / 18));

            for (let i = 0; i < lampCount && lampPositions.length < 36; i++) {
                const along = (i + 0.5) * length / lampCount - length / 2;
                for (const side of [-1, 1]) {
                    if (lampPositions.length >= 36) break;
                    lampPositions.push(horizontal
                        ? [road.x + along, 0, road.z + side * sidewalkOffset]
                        : [road.x + side * sidewalkOffset, 0, road.z + along]);
                }
            }

            const treeCount = Math.max(1, Math.floor(length / 28));
            for (let i = 0; i < treeCount && treePositions.length < 28; i++) {
                const along = (i + 0.5) * length / treeCount - length / 2;
                const side = i % 2 === 0 ? -1 : 1;
                treePositions.push(horizontal
                    ? [road.x + along, 0, road.z + side * sidewalkOffset]
                    : [road.x + side * sidewalkOffset, 0, road.z + along]);
            }
        });

        return { ...result, lamps: lampPositions, trees: treePositions };
    }, [tree]);

    const handleHover = (data, point) => {
        // Find stats for this file
        const stats = fileStats?.[data.path] || { commitCount: 0, topContributor: 'Unknown' };
        setHoveredFile({ ...data, ...stats });
        setHoverPos([point.x, point.y + 2, point.z]);
    };

    const handleUnhover = () => {
        setHoveredFile(null);
    };

    return (
        <group>
            {/* Hover Tooltip Overlay */}
            <CityTooltip fileData={hoveredFile} position={hoverPos} />

            <CityGround size={Math.max(cityWidth, cityDepth)} />

            {/* Asphalt corridors and dashed center markings between city blocks */}
            {roads.map((road, index) => <CityRoad key={`road-${index}`} road={road} />)}

            {/* Dependency Bridges (Glowing cyan tubes) */}
            <DependencyBridges blocks={blocks} />

            {/* Floating text labels over the top directory districts */}
            <DistrictLabels blocks={blocks} />

            {/* Top Contributor Monument Towers slightly behind/edge of city */}
            <ContributorTowers position={[0, 0, -cityDepth / 2 - 10]} />

            {/* Street lamps */}
            {lamps.map((pos, i) => (
                <StreetLamp key={`lamp-${i}`} position={pos} />
            ))}
            {trees.map((pos, i) => (
                <CityTree key={`tree-${i}`} position={pos} />
            ))}

            {/* City blocks */}
            {blocks.map((block) => (
                <group key={block.dir} position={[block.worldX, 0, block.worldZ]}>
                    {/* Block platform / foundation */}
                    <BlockPlatform
                        position={[0, 0, 0]}
                        width={block.blockWidth}
                        depth={block.blockDepth}
                        dirIndex={block.dirIndex}
                    />
                    <BlockAlleys block={block} />

                    {/* Buildings within this block */}
                    {block.buildings.map((b) => {
                        const isSelected = selectedFile?.path === b.data.path;
                        const fileLang = getFileType(b.data.path);

                        // Language filter: hide buildings not matching
                        if (languageFilter && fileLang !== languageFilter) return null;

                        const stat = fileStats?.[b.data.path] || { commitCount: 0, topContributor: 'Unknown' };

                        return (
                            <Building
                                key={b.data.path}
                                data={b.data}
                                position={[b.localX, 0.05, b.localZ]} // Drop Y to visually ground it better over animations
                                height={b.height}
                                width={b.width}
                                depth={b.depth}
                                color={getFileColor(b.data.path)}
                                isSelected={isSelected}
                                isMostEdited={b.data.path === mostEditedPath && colorMode !== 'heatmap'}
                                onClick={(data) => selectFile(data)}
                                onHover={handleHover}
                                onUnhover={handleUnhover}
                                colorMode={colorMode}
                                maxCommits={maxCommits}
                                folderIndex={block.dirIndex}
                                fileIndex={b.fileIndex}
                                commitCount={stat.commitCount}
                                topContributor={stat.topContributor}
                            />
                        );
                    })}
                </group>
            ))}
        </group>
    );
};

export default Scene;
