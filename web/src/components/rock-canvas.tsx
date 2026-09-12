"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Environment, ContactShadows, Sparkles } from "@react-three/drei";
import * as THREE from "three";

function RockMesh() {
  const meshRef = useRef<THREE.Mesh>(null);
  const resinRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.1;
    }
    if (resinRef.current) {
      resinRef.current.rotation.y -= delta * 0.1;
      resinRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.4) * 0.2;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.6} floatIntensity={1.2}>
      {/* Main Stone */}
      <mesh ref={meshRef} position={[0, 0, 0]} castShadow receiveShadow>
        <icosahedronGeometry args={[1.5, 4]} />
        <MeshDistortMaterial
          color="#ffffff"
          roughness={0.4}
          metalness={0.25}
          distort={0.4}
          speed={1.5}
        />
      </mesh>
      {/* Aqua Liquid Resin */}
      <mesh ref={resinRef} position={[0, 0, 0]} receiveShadow>
        <icosahedronGeometry args={[1.65, 5]} />
        <MeshDistortMaterial
          color="#0066ff"
          roughness={0.1}
          metalness={0.8}
          transparent={true}
          opacity={0.6}
          distort={0.6}
          speed={2.5}
          clearcoat={1}
          clearcoatRoughness={0.1}
        />
      </mesh>
    </Float>
  );
}

interface SmallRockProps {
  position: [number, number, number];
  scale: number;
  speed: number;
  rotationIntensity: number;
  color?: string;
  offset?: number;
}

function SmallRock({ position, scale, speed, rotationIntensity, color = "#f8f8f8", offset = 0 }: SmallRockProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.2;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.5 + offset) * 0.2;
      meshRef.current.position.y += Math.sin(state.clock.elapsedTime * 0.8 + offset) * 0.005;
    }
  });

  return (
    <Float speed={speed} rotationIntensity={rotationIntensity} floatIntensity={1}>
      <mesh ref={meshRef} position={position} scale={scale} castShadow receiveShadow>
        <icosahedronGeometry args={[1, 2]} />
        <MeshDistortMaterial
          color={color}
          roughness={0.5}
          metalness={0.15}
          distort={0.5}
          speed={2}
        />
      </mesh>
    </Float>
  );
}

/** SSR-safe `matchMedia` subscription. Reports `false` on the server. */
function useMatchMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

/**
 * True only while the canvas is both scrolled into view and the tab is
 * foregrounded (spec 17 §4.8, L-10). Drives `frameloop` so the render loop
 * actually stops — not just visually hidden — when neither is true.
 */
function useCanvasVisible(ref: RefObject<HTMLElement | null>): boolean {
  const [intersecting, setIntersecting] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setIntersecting(entry.isIntersecting), {
      threshold: 0.01,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  useEffect(() => {
    const onVisibilityChange = () => setPageVisible(document.visibilityState === "visible");
    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return intersecting && pageVisible;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * The landing hero's 3D rock (spec 17 §4.8, L-10). Capped `dpr`, a render
 * loop that only runs while the canvas is actually visible, no HDRI
 * environment below `md` (the three-light rig already present carries it),
 * a lighter contact-shadow map on phones, and no mount at all under
 * `prefers-reduced-motion` — a static photo takes its place so there is
 * still something to look at.
 */
export function RockCanvas() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useMatchMedia(REDUCED_MOTION_QUERY);
  const isDesktop = useMatchMedia(DESKTOP_QUERY);
  const isVisible = useCanvasVisible(wrapperRef);

  if (prefersReducedMotion) {
    return (
      <div ref={wrapperRef} className="absolute inset-0 z-0 touch-pan-y pointer-events-none">
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative background, not an LCP-critical <Image> */}
        <img src="/rocks/rock1.jpg" alt="" className="size-full object-cover" />
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="absolute inset-0 z-0 touch-pan-y pointer-events-none">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        frameloop={isVisible ? "always" : "demand"}
        camera={{ position: [0, 0, 6], fov: 45 }}
      >
        {/* Lights (also the three-light rig relied on below `md`, replacing the HDRI) */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 4]} intensity={1.5} castShadow shadow-bias={-0.0001} />
        <directionalLight position={[-5, 5, -2]} intensity={0.5} color="#e6f0ff" />

        {isDesktop ? <Environment preset="city" /> : null}

        {/* Main Rock */}
        <RockMesh />

        {/* Small floating rocks around */}
        <SmallRock position={[-2.5, 1.2, -1]} scale={0.3} speed={2.5} rotationIntensity={1.5} offset={1.2} />
        <SmallRock position={[2.2, -0.8, -0.5]} scale={0.2} speed={3} rotationIntensity={2} offset={3.4} />
        <SmallRock position={[-1.5, -1.5, -2]} scale={0.4} speed={2} rotationIntensity={1} color="#f0f0f0" offset={5.1} />
        <SmallRock position={[2.8, 1.5, -2]} scale={0.25} speed={2.8} rotationIntensity={1.8} offset={7.8} />

        {/* Dust/Sparkles particles around for atmosphere while keeping it minimal */}
        <Sparkles count={40} scale={8} size={2} speed={0.4} opacity={0.15} color="#c0c0c0" />

        {/* Dramatic floor shadow */}
        <ContactShadows
          position={[0, -2.5, 0]}
          opacity={0.8}
          scale={15}
          blur={1.5}
          far={6}
          resolution={isDesktop ? 512 : 256}
          color="#000000"
        />
      </Canvas>
    </div>
  );
}
