"use client";

/**
 * The landing hero's 3D rock.
 *
 * Visuals are main's: an oval, tilted stone that cycles through a few restless "resting" forms
 * and settles into a calmer, more upright pose on hover/tap, an NFC disc and liquid-resin group
 * inside it, and annotation labels that fade in on hover. Everything else is the branch's
 * performance budget, re-applied exactly (spec 17 §4.8, L-10): `dpr={[1, 1.5]}`, a render loop
 * that only runs while the canvas is actually visible (`IntersectionObserver` + `visibilitychange`
 * — not just CSS-hidden), no mount at all under `prefers-reduced-motion` (a static photo takes its
 * place), `touch-action: pan-y` on the hit area so the hero never captures vertical scroll, a
 * lighter `ContactShadows` map on phones, and no HDRI `Environment` below `md` (the ambient +
 * directional light rig already present carries it).
 */

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  Float,
  MeshDistortMaterial,
  Environment,
  ContactShadows,
  Sparkles,
  SpotLight,
  Html,
} from "@react-three/drei";
import * as THREE from "three";
import { useAudio } from "@/context/audio-context";

// A pair of short, synthesized tones for the hover-in / hover-out transition — decorative only,
// and silenced by the site's own mute toggle rather than a second, independent volume control.
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {
      // Autoplay policies can refuse this outside a user gesture; the hover just stays silent.
    });
  }
  return audioCtx;
}

function playTone(shape: OscillatorType, from: number, to: number, duration: number, gainPeak: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = shape;
    osc.frequency.setValueAtTime(from, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + duration);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(gainPeak, ctx.currentTime + duration * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Best-effort decoration; a blocked or unsupported AudioContext changes nothing else.
  }
}

const playFuturisticSweep = () => playTone("sine", 600, 150, 0.4, 0.05);
const playClick = () => playTone("triangle", 1200, 600, 0.1, 0.05);

interface RockFormParams {
  rockDistort: number;
  rockScale: [number, number, number];
  liquidDistort: number;
  liquidScale: [number, number, number];
  liquidPosition: [number, number, number];
  liquidColor: THREE.Color;
}

const RESTING_FORMS: RockFormParams[] = [
  {
    rockDistort: 0.35,
    rockScale: [1.8, 1.0, 1.3],
    liquidDistort: 0.25,
    liquidScale: [0.65, 0.65, 0.25],
    liquidPosition: [0.6, 0.8, 0.8],
    liquidColor: new THREE.Color("#0022ff"),
  },
  {
    rockDistort: 0.45,
    rockScale: [1.2, 1.5, 1.5],
    liquidDistort: 0.35,
    liquidScale: [0.7, 0.7, 0.3],
    liquidPosition: [-0.7, 0.9, 1.2],
    liquidColor: new THREE.Color("#0066ff"),
  },
  {
    rockDistort: 0.4,
    rockScale: [1.5, 1.2, 1.7],
    liquidDistort: 0.3,
    liquidScale: [0.6, 0.6, 0.2],
    liquidPosition: [0.3, 1.1, 1.0],
    liquidColor: new THREE.Color("#0000ff"),
  },
];

/** The calmer, more upright pose the rock settles into on hover or tap. */
const STANDING_FORM: RockFormParams = {
  rockDistort: 0.18,
  rockScale: [1.05, 1.75, 1.2],
  liquidDistort: 0.15,
  liquidScale: [0.6, 0.6, 0.15],
  liquidPosition: [-0.7, 1.4, 1.05],
  liquidColor: new THREE.Color("#0055ff"),
};

interface RockMeshProps {
  isHovered: boolean;
  isCompact: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei's distort material ref has no exported class type
type DistortMaterialRef = any;

function RockMesh({ isHovered, isCompact }: RockMeshProps) {
  const groupRef = useRef<THREE.Group>(null);
  const rockRef = useRef<THREE.Mesh>(null);
  const liquidGroupRef = useRef<THREE.Group>(null);
  const liquidRef = useRef<THREE.Mesh>(null);

  const rockMaterialRef = useRef<DistortMaterialRef>(null);
  const liquidMaterialRef = useRef<DistortMaterialRef>(null);

  const [formIndex, setFormIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFormIndex((prev) => (prev + 1) % RESTING_FORMS.length);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  useFrame((state, delta) => {
    const target = isHovered ? STANDING_FORM : RESTING_FORMS[formIndex];

    if (groupRef.current) {
      if (isHovered) {
        const targetY = Math.sin(state.clock.elapsedTime * 0.8) * 0.08;
        const targetX = Math.cos(state.clock.elapsedTime * 0.6) * 0.08;
        groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetY, delta * 4);
        groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetX, delta * 4);
      } else {
        groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.6;
        groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.2;
      }
    }

    if (rockRef.current) {
      rockRef.current.scale.lerp(new THREE.Vector3(...target.rockScale), delta * 4);
      const targetZ = isHovered ? 0.5 : 0;
      rockRef.current.rotation.z = THREE.MathUtils.lerp(rockRef.current.rotation.z, targetZ, delta * 4);
    }

    if (rockMaterialRef.current) {
      rockMaterialRef.current.distort = THREE.MathUtils.lerp(
        rockMaterialRef.current.distort,
        target.rockDistort,
        delta * 4,
      );
    }

    if (liquidGroupRef.current) {
      liquidGroupRef.current.position.lerp(new THREE.Vector3(...target.liquidPosition), delta * 4);
      liquidGroupRef.current.lookAt(0, 0, 0);
    }

    if (liquidRef.current) {
      liquidRef.current.scale.lerp(new THREE.Vector3(...target.liquidScale), delta * 4);
    }

    if (liquidMaterialRef.current) {
      liquidMaterialRef.current.distort = THREE.MathUtils.lerp(
        liquidMaterialRef.current.distort,
        target.liquidDistort,
        delta * 4,
      );
      liquidMaterialRef.current.color.lerp(target.liquidColor, delta * 4);
    }
  });

  const labelClass =
    "flex items-center whitespace-nowrap font-mono text-caption font-bold uppercase tracking-[0.25em] text-[#001144] motion-safe:transition-all motion-safe:duration-1000";

  return (
    <Float speed={isHovered ? 0.5 : 1.5} rotationIntensity={isHovered ? 0.1 : 0.3} floatIntensity={isHovered ? 0.2 : 1.0}>
      <group ref={groupRef} scale={isCompact ? 0.65 : 1} position={isCompact ? [0, 0.4, 0] : [0, 0, 0]}>
        {/* Main Stone */}
        <mesh ref={rockRef} castShadow receiveShadow>
          <icosahedronGeometry args={[1, 16]} />
          <MeshDistortMaterial ref={rockMaterialRef} color="#f2f2f2" roughness={0.9} metalness={0.05} distort={0.3} speed={0.5} />
          <Html position={[-0.8, -0.2, 0.5]}>
            <div
              className={`${labelClass} flex-row-reverse -translate-x-full ${isHovered ? "translate-y-0 opacity-100 delay-300" : "translate-y-2 opacity-0"}`}
            >
              <div className="size-1.5 rounded-full bg-[#001144]" />
              <div className="ml-2 h-px w-20 bg-[#001144]/80 md:ml-4 md:w-48" />
              a normal rock
            </div>
          </Html>
        </mesh>

        {/* Aqua Liquid & NFC Tag Group */}
        <group ref={liquidGroupRef}>
          {/* NFC Tag Disc */}
          <group position={[0, 0, 0.05]} rotation={[0, Math.PI, 0]}>
            <mesh>
              <circleGeometry args={[0.26, 32]} />
              <meshStandardMaterial color="#eeeeee" metalness={0.8} roughness={0.3} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, 0, 0.005]}>
              <ringGeometry args={[0.19, 0.21, 32]} />
              <meshBasicMaterial color="#333333" />
            </mesh>
            <mesh position={[0, 0, 0.005]}>
              <ringGeometry args={[0.14, 0.16, 32]} />
              <meshBasicMaterial color="#333333" />
            </mesh>
            <mesh position={[0, 0, 0.005]}>
              <ringGeometry args={[0.09, 0.11, 32]} />
              <meshBasicMaterial color="#333333" />
            </mesh>
            <mesh position={[0, 0, 0.005]}>
              <planeGeometry args={[0.08, 0.08]} />
              <meshStandardMaterial color="#222222" metalness={0.6} roughness={0.4} />
            </mesh>
            <Html position={[0.1, -0.1, 0]}>
              <div className={`${labelClass} ${isHovered ? "translate-y-0 opacity-100 delay-500" : "translate-y-2 opacity-0"}`}>
                <div className="size-1.5 rounded-full bg-[#001144]" />
                <div className="mr-2 h-px w-24 bg-[#001144]/80 md:mr-4 md:w-48" />
                a tiny NFC sensor
              </div>
            </Html>
          </group>

          {/* Aqua Liquid Resin */}
          <mesh ref={liquidRef} castShadow receiveShadow position={[0, 0, 0]}>
            <icosahedronGeometry args={[1, 16]} />
            <MeshDistortMaterial
              ref={liquidMaterialRef}
              color="#0044ff"
              roughness={0.1}
              metalness={0.6}
              transparent
              opacity={0.9}
              distort={0.3}
              speed={2.5}
              clearcoat={1}
              clearcoatRoughness={0.1}
            />
            <Sparkles count={40} scale={0.9} size={2.5} speed={0.4} opacity={1} color="#ffffff" />
            <Sparkles count={20} scale={1.2} size={3.5} speed={0.8} opacity={0.8} color="#aaddff" />
            <Html position={[0.5, 0.5, 0.1]}>
              <div className={`${labelClass} ${isHovered ? "translate-y-0 opacity-100 delay-700" : "translate-y-2 opacity-0"}`}>
                <div className="size-1.5 rounded-full bg-[#001144]" />
                <div className="mr-2 h-px w-24 bg-[#001144]/80 md:mr-4 md:w-48" />
                a sparkly silicon
              </div>
            </Html>
          </mesh>
        </group>
      </group>
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
        <MeshDistortMaterial color={color} roughness={0.5} metalness={0.15} distort={0.5} speed={2} />
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
    () => false,
  );
}

/**
 * True only while the canvas is both scrolled into view and the tab is foregrounded (spec 17
 * §4.8, L-10). Drives `frameloop` so the render loop actually stops — not just visually hidden —
 * when neither is true.
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
const HOVER_LEAVE_TOLERANCE_MS = 200;

export function RockCanvas() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useMatchMedia(REDUCED_MOTION_QUERY);
  const isDesktop = useMatchMedia(DESKTOP_QUERY);
  const isVisible = useCanvasVisible(wrapperRef);
  const { isMuted } = useAudio();

  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
  }, []);

  const handleHoverEnter = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    if (!isHovered) {
      setIsHovered(true);
      if (!isMuted) playFuturisticSweep();
    }
  };

  // A short tolerance window before actually leaving the hovered state: without it, the pointer
  // crossing the gap between the DOM hit area and re-entering it (or a jittery trackpad) flickers
  // the rock between its two poses several times a second.
  const handleHoverLeave = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => {
      setIsHovered(false);
      if (!isMuted) playClick();
    }, HOVER_LEAVE_TOLERANCE_MS);
  };

  const handleToggle = () => {
    if (isHovered) handleHoverLeave();
    else handleHoverEnter();
  };

  if (prefersReducedMotion) {
    return (
      <div ref={wrapperRef} className="pointer-events-none absolute inset-0 z-0 touch-pan-y">
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative background, not an LCP-critical <Image> */}
        <img src="/rocks/rock1.jpg" alt="" className="size-full object-cover" />
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
      {/* Invisible DOM hit area for the rock — sized independently of the 3D camera framing so it
          tracks the visible stone at every viewport width, and carries the touch-action the
          Canvas itself does not need since it never receives pointer events. */}
      <div
        className="pointer-events-auto absolute z-10 aspect-square w-[80vw] max-w-[600px] -translate-y-[5vh] touch-pan-y rounded-full md:translate-y-0"
        onMouseEnter={handleHoverEnter}
        onMouseLeave={handleHoverLeave}
        onClick={handleToggle}
      />
      <Canvas
        shadows
        dpr={[1, 1.5]}
        frameloop={isVisible ? "always" : "demand"}
        camera={{ position: [0, 0, 6], fov: 45 }}
        className="!pointer-events-none"
      >
        {/* Lights (also the three-light rig relied on below `md`, replacing the HDRI) */}
        <ambientLight intensity={isHovered ? 0.8 : 0.6} />
        <directionalLight position={[5, 8, 4]} intensity={isHovered ? 1.4 : 1.8} castShadow shadow-bias={-0.0001} />
        <directionalLight position={[-5, 5, -2]} intensity={isHovered ? 0.8 : 0.6} color="#e6f0ff" />

        {isDesktop ? (
          <>
            <SpotLight position={[0, 5, 5]} angle={0.3} penumbra={0.5} intensity={isHovered ? 6 : 4} castShadow color="#ffffff" />
            <Environment preset="studio" />
          </>
        ) : null}

        {/* Main Rock */}
        <RockMesh isHovered={isHovered} isCompact={!isDesktop} />

        {/* Small floating rocks around */}
        <SmallRock position={[-2.5, 1.2, -1]} scale={0.3} speed={2.5} rotationIntensity={isHovered ? 0.5 : 1.5} offset={1.2} />
        <SmallRock position={[2.2, -0.8, -0.5]} scale={0.2} speed={3} rotationIntensity={isHovered ? 0.5 : 2} offset={3.4} />
        <SmallRock position={[-1.5, -1.5, -2]} scale={0.4} speed={2} rotationIntensity={isHovered ? 0.2 : 1} color="#f0f0f0" offset={5.1} />
        <SmallRock position={[2.8, 1.5, -2]} scale={0.25} speed={2.8} rotationIntensity={isHovered ? 0.5 : 1.8} offset={7.8} />

        {/* Dust/Sparkles particles around for atmosphere while keeping it minimal */}
        <Sparkles count={40} scale={8} size={2} speed={0.4} opacity={0.15} color="#c0c0c0" />

        {/* Dramatic floor shadow — lighter resolution on phones (spec 17 §4.8, L-10) */}
        <ContactShadows
          position={[0, -2.5, 0]}
          opacity={isHovered ? 0.7 : 0.8}
          scale={15}
          blur={isHovered ? 2.5 : 1.5}
          far={6}
          resolution={isDesktop ? 512 : 256}
          color="#000000"
        />
      </Canvas>
    </div>
  );
}
