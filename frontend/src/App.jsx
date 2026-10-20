import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky } from '@react-three/drei';
import Scene from './Scene';
import UI from './UI';
import FileDetails from './components/FileDetails';
import CommitGraph from './components/CommitGraph';
import AISummary from './components/AISummary';
import LanguageStats from './components/LanguageStats';
import CodeViewerPanel from './components/CodeViewerPanel';
import AIChatPanel from './components/AIChatPanel';
import useStore from './store';

function App() {
  const { commits } = useStore();
  const [colorMode, setColorMode] = useState('filetype');

  return (
    <div className="w-screen h-screen relative bg-slate-950 overflow-hidden">
      <UI colorMode={colorMode} setColorMode={setColorMode} />

      {/* Only render 3D city and overlays when a repo is loaded */}
      {commits.length > 0 && (
        <>
          <FileDetails />
          <AISummary />
          <LanguageStats />

          <CodeViewerPanel />
          <AIChatPanel />

          <div className="absolute inset-0 z-0">
            <Canvas
              camera={{ position: [40, 35, 40], fov: 55 }}
              shadows
              gl={{
                antialias: true,
                toneMapping: 2, // THREE.ACESFilmicToneMapping
                toneMappingExposure: 1.2
              }}
            >
              {/* Ambient fill light — soft blue tint */}
              <ambientLight intensity={0.32} color="#b0c4de" />

              {/* Main sun light — warm directional with shadows */}
              <directionalLight
                position={[-80, 100, -60]}
                intensity={1.35}
                color="#fff1d6"
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
                shadow-camera-left={-100}
                shadow-camera-right={100}
                shadow-camera-top={100}
                shadow-camera-bottom={-100}
                shadow-camera-near={1}
                shadow-camera-far={300}
                shadow-bias={-0.001}
              />

              {/* Fill light from opposite side — cooler, dimmer */}
              <directionalLight
                position={[-60, 40, -50]}
                intensity={0.3}
                color="#93c5fd"
              />

              {/* Hemisphere light for natural sky-ground color blending */}
              <hemisphereLight args={['#5b8ec4', '#17202b', 0.3]} />

              {/* A clear sunlit sky with a visible sun disk */}
              <mesh position={[-80, 100, -60]}>
                <sphereGeometry args={[2.2, 24, 24]} />
                <meshBasicMaterial color="#fff1c2" toneMapped={false} />
              </mesh>

              {/* Sky dome */}
              <Sky
                distance={450000}
                sunPosition={[-80, 100, -60]}
                inclination={0.62}
                azimuth={0.25}
                turbidity={1.6}
                rayleigh={1.5}
                mieCoefficient={0.002}
                mieDirectionalG={0.7}
              />

              {/* Fog for depth/atmosphere */}
              <fog attach="fog" args={['#91a8bf', 130, 420]} />

              <Scene colorMode={colorMode} />

              <OrbitControls
                makeDefault
                enableDamping
                dampingFactor={0.08}
                minDistance={8}
                maxDistance={250}
                maxPolarAngle={Math.PI / 2.15}
                minPolarAngle={Math.PI / 12}
                rotateSpeed={0.5}
                zoomSpeed={1.2}
                panSpeed={0.8}
              />
            </Canvas>
          </div>

          {/* Commit Graph - positioned above timeline at bottom */}
          <div className="absolute bottom-[200px] left-0 right-0 z-10 flex justify-center px-4 pointer-events-none">
            <CommitGraph />
          </div>
        </>
      )}
    </div>
  );
}

export default App;
