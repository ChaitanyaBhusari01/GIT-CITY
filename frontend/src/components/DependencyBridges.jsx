import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import useStore from '../store';

const DependencyBridges = ({ blocks }) => {
    const { selectedFile, selectedFileDependencies } = useStore();
    const materialRef = useRef();

    // Limit to max 20 lines to avoid performance issues
    const displayDependencies = selectedFileDependencies.slice(0, 20);

    const curves = useMemo(() => {
        if (!selectedFile || displayDependencies.length === 0 || !blocks) return [];

        // Helper to find a building's center-top coordinate across all blocks
        const findBuildingWorldCoords = (filePath) => {
            for (const block of blocks) {
                // block.buildings is array of { data, localX, localZ, height, ... }
                const b = block.buildings.find(bld => bld.data.path === filePath);
                if (b) {
                    return new THREE.Vector3(
                        block.worldX + b.localX,
                        b.height,
                        block.worldZ + b.localZ
                    );
                }
            }
            return null;
        };

        const startPos = findBuildingWorldCoords(selectedFile.path);
        if (!startPos) return [];

        const newCurves = [];
        displayDependencies.forEach(depPath => {
            const endPos = findBuildingWorldCoords(depPath);
            if (!endPos) return; // dependency file not found in tree layout

            // Create a Quadratic Bezier curve that arcs upwards
            const distance = startPos.distanceTo(endPos);
            // Height offset is somewhat proportional to distance but has a minimum height
            const heightOffset = Math.max(3, distance * 0.4);

            const midPoint = new THREE.Vector3().lerpVectors(startPos, endPos, 0.5);
            midPoint.y += heightOffset;

            // Offset the start and end by half building width so they don't clip as much directly in the center
            const curve = new THREE.QuadraticBezierCurve3(startPos, midPoint, endPos);

            // Generate tube geometry from the curve
            const geometry = new THREE.TubeGeometry(curve, 30, 0.08, 6, false);
            newCurves.push(geometry);
        });

        return newCurves;
    }, [selectedFile, displayDependencies, blocks]);

    // Animate glowing effect on the material slightly
    useFrame((state) => {
        if (materialRef.current) {
            // Pulsate emissive intensity between 1.0 and 2.5
            materialRef.current.emissiveIntensity = 1.0 + Math.sin(state.clock.elapsedTime * 3) * 1.5;
        }
    });

    if (curves.length === 0) return null;

    return (
        <group>
            <meshStandardMaterial
                ref={materialRef}
                color="#06b6d4"          // cyan base
                emissive="#06b6d4"       // neon cyan glow
                emissiveIntensity={2.0}
                transparent
                opacity={0.8}
                roughness={0.2}
                depthTest={true}
            />
            {curves.map((geo, idx) => (
                <mesh key={`bridge-${idx}`} geometry={geo} material={materialRef.current} />
            ))}
        </group>
    );
};

export default DependencyBridges;
