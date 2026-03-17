import React from 'react';
import { Text } from '@react-three/drei';
import useStore from '../store';

const TOWER_METRICS = [
    { label: '1st', color: '#fbbf24', height: 18, radius: 2, emissive: '#f59e0b' }, // Gold
    { label: '2nd', color: '#cbd5e1', height: 14, radius: 1.6, emissive: '#94a3b8' }, // Silver
    { label: '3rd', color: '#b45309', height: 10, radius: 1.4, emissive: '#78350f' }  // Bronze
];

const ContributorTowers = ({ position = [0, 0, 0] }) => {
    const { contributors } = useStore();

    // Get top 3
    const top3 = contributors.slice(0, 3);
    if (top3.length === 0) return null;

    return (
        <group position={position}>
            {/* Monument Base */}
            <mesh position={[0, -0.1, 0]} receiveShadow>
                <cylinderGeometry args={[8, 9, 0.4, 32]} />
                <meshStandardMaterial color="#0f172a" roughness={0.8} />
            </mesh>

            {top3.map((c, i) => {
                const metric = TOWER_METRICS[i];
                if (!metric) return null;

                // Arrange in a triangle or line. Let's do a line for simplicity: Center, Left, Right
                const xOffset = i === 0 ? 0 : i === 1 ? -4.5 : 4.5;
                const zOffset = i === 0 ? -2 : 2;

                return (
                    <group key={c.name} position={[xOffset, 0, zOffset]}>
                        {/* Tower Base */}
                        <mesh position={[0, metric.height / 2, 0]} castShadow receiveShadow>
                            <boxGeometry args={[metric.radius * 2, metric.height, metric.radius * 2]} />
                            <meshStandardMaterial
                                color={metric.color}
                                roughness={0.2}
                                metalness={0.8}
                                emissive={metric.emissive}
                                emissiveIntensity={0.2}
                            />
                        </mesh>

                        {/* Glow Cap */}
                        <mesh position={[0, metric.height + 0.5, 0]}>
                            <octahedronGeometry args={[metric.radius * 1.2]} />
                            <meshStandardMaterial
                                color={metric.emissive}
                                emissive={metric.emissive}
                                emissiveIntensity={2}
                            />
                            <pointLight color={metric.emissive} intensity={1} distance={15} />
                        </mesh>

                        {/* Contributor Name Label */}
                        <Text
                            position={[0, metric.height + 2.5, 0]}
                            fontSize={1.2}
                            color="white"
                            anchorX="center"
                            anchorY="middle"
                            outlineWidth={0.05}
                            outlineColor="#000000"
                        >
                            {c.name}
                        </Text>
                        <Text
                            position={[0, metric.height + 1.2, 0]}
                            fontSize={0.8}
                            color={metric.color}
                            anchorX="center"
                            anchorY="middle"
                            outlineWidth={0.05}
                            outlineColor="#000000"
                        >
                            {c.commits} edits
                        </Text>
                    </group>
                );
            })}
        </group>
    );
};

export default ContributorTowers;
