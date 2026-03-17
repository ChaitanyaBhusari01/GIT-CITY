import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Sky } from '@react-three/drei';
import Scene from './Scene';
import UI from './UI';
import FileDetails from './components/FileDetails';
import SearchPanel from './components/SearchPanel';
import CommitGraph from './components/CommitGraph';
import AISummary from './components/AISummary';
import LanguageStats from './components/LanguageStats';
import LanguageFilter from './components/LanguageFilter';
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

          {/* Search button - top center */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40">
            <SearchPanel />
          </div>

          {/* Language filter bar - below top bar */}
          <div className="absolute top-[140px] left-4 right-[350px] z-20">
            <LanguageFilter />
          </div>

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
              <ambientLight intensity={0.25} color="#b0c4de" />

              {/* Main sun light — warm directional with shadows */}
              <directionalLight
                position={[80, 100, 60]}
                intensity={1.2}
                color="#fff5e6"
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
              <hemisphereLight
                args={['#1e40af', '#0f172a', 0.15]}
              />

              {/* Stars */}
              <Stars radius={200} depth={80} count={4000} factor={4} saturation={0.2} fade speed={0.5} />

              {/* Sky dome */}
              <Sky
                distance={450000}
                sunPosition={[80, 100, 60]}
                inclination={0.52}
                azimuth={0.25}
                turbidity={3}
                rayleigh={0.5}
                mieCoefficient={0.005}
                mieDirectionalG={0.8}
              />

              {/* Fog for depth/atmosphere */}
              <fog attach="fog" args={['#0c1222', 80, 300]} />

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
