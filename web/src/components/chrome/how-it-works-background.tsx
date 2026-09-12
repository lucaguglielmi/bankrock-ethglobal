"use client";

/**
 * The hover-driven 3D background behind "How it works" (spec 17 §4.8, L-10).
 * Lives in its own module, separate from `how-it-works.tsx`, purely so its
 * `next/dynamic` import boundary is real: `how-it-works.tsx` only evaluates
 * `import()` on this file from `md` up, so phones never fetch Three.js for
 * a background they will never render.
 */
import { Canvas } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Environment, Sparkles } from "@react-three/drei";

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
          <Float speed={3} rotationIntensity={2} floatIntensity={1.5}>
            <mesh scale={1.5}>
              <boxGeometry args={[1.5, 2.5, 0.2]} />
              <MeshDistortMaterial
                color="#ffffff"
                roughness={0.2}
                metalness={0.9}
                distort={0.1}
                speed={1}
              />
            </mesh>
            <Sparkles count={30} scale={4} size={3} color="#ffffff" />
          </Float>
        )}
      </Canvas>
    </div>
  );
}
