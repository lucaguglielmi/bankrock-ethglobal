"use client";

/**
 * The hover-driven 3D background behind "How it works" (spec 17 §4.8, L-10).
 * Lives in its own module, separate from `how-it-works.tsx`, purely so its
 * `next/dynamic` import boundary is real: `how-it-works.tsx` only evaluates
 * `import()` on this file from `md` up, so phones never fetch Three.js for
 * a background they will never render.
 */
import { Canvas } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Environment, Sparkles, Html } from "@react-three/drei";
import * as THREE from "three";

export interface HowItWorksBackgroundProps {
  topic: string | null;
}

export function HowItWorksBackground({ topic }: HowItWorksBackgroundProps) {
  if (!topic) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-3xl opacity-60 motion-safe:transition-opacity motion-safe:duration-1000">
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[2, 5, 2]} intensity={1} />
        <Environment preset="city" />

        {topic === "aqua" && (
          <Float speed={2} rotationIntensity={1} floatIntensity={2}>
            <mesh scale={2.5}>
              <sphereGeometry args={[1, 64, 64]} />
              <MeshDistortMaterial
                color="#0066ff"
                roughness={0.1}
                metalness={0.8}
                transparent={true}
                opacity={0.5}
                distort={0.8}
                speed={3}
              />
            </mesh>
            <Sparkles count={50} scale={5} size={2} color="#00aaff" />
          </Float>
        )}

                {topic === "control" && (
          <group>
            {/* Holographic HUD Elements (Minority Report style) */}
            <Html position={[-2, 1, 0]} transform className="pointer-events-none opacity-30 mix-blend-screen" distanceFactor={5}>
              <div className="font-mono text-label text-cyan-300 w-48 flex flex-col gap-1 border-l border-cyan-500/50 pl-2">
                <div className="flex justify-between"><span>SYS.MEM</span><span>0x4F8A</span></div>
                <div className="flex justify-between"><span>NET.VOL</span><span className="text-emerald-400">▲ 14.2%</span></div>
                <div className="h-4 w-full bg-cyan-900/20 mt-1 relative overflow-hidden">
                  <div className="absolute inset-0 bg-cyan-500/20 w-3/4 animate-pulse" />
                  <svg className="w-full h-full text-cyan-400 opacity-50" viewBox="0 0 100 20" preserveAspectRatio="none">
                    <polyline fill="none" stroke="currentColor" strokeWidth="1" points="0,15 20,10 40,18 60,5 80,12 100,2" />
                  </svg>
                </div>
              </div>
            </Html>
            
            <Html position={[2, -1, -1]} transform className="pointer-events-none opacity-20 mix-blend-screen" distanceFactor={5}>
              <div className="font-mono text-label text-cyan-300 w-32 flex flex-col gap-1 text-right border-r border-cyan-500/50 pr-2">
                <div>HASH: a9f3...b4c2</div>
                <div className="text-rose-400">▼ SLIPPAGE 0.1%</div>
                <div className="flex gap-1 justify-end mt-1">
                  <div className="w-1 h-3 bg-cyan-500/40 animate-pulse" style={{animationDelay: '0ms'}}/>
                  <div className="w-1 h-5 bg-cyan-500/60 animate-pulse" style={{animationDelay: '100ms'}}/>
                  <div className="w-1 h-2 bg-cyan-500/30 animate-pulse" style={{animationDelay: '200ms'}}/>
                  <div className="w-1 h-6 bg-cyan-500/80 animate-pulse" style={{animationDelay: '300ms'}}/>
                  <div className="w-1 h-4 bg-cyan-500/50 animate-pulse" style={{animationDelay: '400ms'}}/>
                </div>
              </div>
            </Html>

            <Float speed={2} rotationIntensity={1.5} floatIntensity={1.5}>
              {/* The Rock */}
              <mesh scale={1.4}>
                <icosahedronGeometry args={[1, 16]} />
                <MeshDistortMaterial
                  color="#1a1a2e"
                  roughness={0.7}
                  metalness={0.3}
                  distort={0.15}
                  speed={0.5}
                />
                
                {/* The Embedded Chip */}
                <group position={[0, 0, 0.95]} rotation={[0.1, 0, 0]}>
                  {/* Chip Base */}
                  <mesh>
                    <boxGeometry args={[0.4, 0.6, 0.05]} />
                    <meshStandardMaterial color="#0a0a0a" metalness={0.9} roughness={0.2} />
                  </mesh>
                  {/* Gold Pins/Contacts */}
                  <mesh position={[0, 0, 0.026]}>
                    <planeGeometry args={[0.3, 0.5]} />
                    <meshStandardMaterial
                      color="#ffd700"
                      metalness={1}
                      roughness={0.3}
                      wireframe
                    />
                  </mesh>
                  {/* Glowing core of the chip */}
                  <mesh position={[0, 0, 0.03]}>
                    <planeGeometry args={[0.1, 0.1]} />
                    <meshBasicMaterial color="#00ffff" />
                  </mesh>
                </group>
              </mesh>
              <Sparkles count={40} scale={5} size={2} color="#00ffff" opacity={0.4} />
            </Float>
          </group>
        )}
      </Canvas>
    </div>
  );
}
