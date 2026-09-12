"use client";

import { useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Environment, ContactShadows, Sparkles, SpotLight, Html } from "@react-three/drei";
import * as THREE from "three";

// Audio Helpers
let audioCtx: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

function playFuturisticSweep() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {}
}

function playClick() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) {}
}

function RockMesh({ isHovered }: { isHovered: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const rockRef = useRef<THREE.Mesh>(null);
  const liquidGroupRef = useRef<THREE.Group>(null);
  const liquidRef = useRef<THREE.Mesh>(null);
  const nfcRef = useRef<THREE.Group>(null);
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rockMaterialRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const liquidMaterialRef = useRef<any>(null);

  const [formIndex, setFormIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFormIndex((prev) => (prev + 1) % 3);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const forms = [
    {
      rockDistort: 0.35,
      rockScale: [1.8, 1.0, 1.3] as [number, number, number],
      liquidDistort: 0.25,
      liquidScale: [0.65, 0.65, 0.25] as [number, number, number],
      liquidPosition: [0.6, 0.8, 0.8] as [number, number, number],
      liquidColor: new THREE.Color("#0022ff"),
    },
    {
      rockDistort: 0.45,
      rockScale: [1.2, 1.5, 1.5] as [number, number, number],
      liquidDistort: 0.35,
      liquidScale: [0.7, 0.7, 0.3] as [number, number, number],
      liquidPosition: [-0.7, 0.9, 1.2] as [number, number, number],
      liquidColor: new THREE.Color("#0066ff"),
    },
    {
      rockDistort: 0.4,
      rockScale: [1.5, 1.2, 1.7] as [number, number, number],
      liquidDistort: 0.3,
      liquidScale: [0.6, 0.6, 0.2] as [number, number, number],
      liquidPosition: [0.3, 1.1, 1.0] as [number, number, number],
      liquidColor: new THREE.Color("#0000ff"),
    }
  ];

  const basicPosition = {
    rockDistort: 0.1,
    rockScale: [1.4, 1.2, 1.3] as [number, number, number],
    liquidDistort: 0.1,
    liquidScale: [0.6, 0.6, 0.15] as [number, number, number],
    liquidPosition: [-0.6, 0.8, 1.1] as [number, number, number], // Top left at an angle!
    liquidColor: new THREE.Color("#0055ff"),
  };

  useFrame((state, delta) => {
    const target = isHovered ? basicPosition : forms[formIndex];
    
    if (groupRef.current) {
      if (isHovered) {
        // Return to dead center smoothly
        groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, 0, delta * 4);
        groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, delta * 4);
      } else {
        // Normal wobble
        groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.6;
        groupRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.2;
      }
    }

    if (rockRef.current) {
      rockRef.current.scale.lerp(new THREE.Vector3(...target.rockScale), delta * 4);
    }
    
    if (rockMaterialRef.current) {
      rockMaterialRef.current.distort = THREE.MathUtils.lerp(rockMaterialRef.current.distort, target.rockDistort, delta * 4);
    }

    if (liquidGroupRef.current) {
      liquidGroupRef.current.position.lerp(new THREE.Vector3(...target.liquidPosition), delta * 4);
      if (isHovered) {
        // When hovered, ensure liquid looks perfectly out, not just at 0,0,0
        // since it's at [0, 0.2, 1.25], looking at [0,0,0] angles it slightly. 
        // We can just keep looking at 0,0,0 since it gives a nice curve to the surface.
      }
      liquidGroupRef.current.lookAt(0, 0, 0);
    }

    if (liquidRef.current) {
      liquidRef.current.scale.lerp(new THREE.Vector3(...target.liquidScale), delta * 4);
    }

    if (liquidMaterialRef.current) {
      liquidMaterialRef.current.distort = THREE.MathUtils.lerp(liquidMaterialRef.current.distort, target.liquidDistort, delta * 4);
      liquidMaterialRef.current.color.lerp(target.liquidColor, delta * 4);
    }
  });

  return (
    <Float speed={isHovered ? 0.5 : 1.5} rotationIntensity={isHovered ? 0.1 : 0.3} floatIntensity={isHovered ? 0.2 : 1.0}>
      <group ref={groupRef}>
        {/* Main Stone */}
        <mesh ref={rockRef} castShadow receiveShadow>
          <icosahedronGeometry args={[1, 16]} />
          <MeshDistortMaterial
            ref={rockMaterialRef}
            color="#f2f2f2" 
            roughness={0.9}
            metalness={0.05}
            distort={0.3}
            speed={0.5}
          />
          <Html position={[-0.8, -0.2, 0.5]}>
            <div className={`transition-all duration-1000 flex flex-row-reverse items-center font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-[#001144] whitespace-nowrap -translate-x-full ${isHovered ? 'opacity-100 translate-y-0 pointer-events-auto delay-300' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
              <div className="w-1.5 h-1.5 rounded-full bg-[#001144]" />
              <div className="w-24 h-[1px] bg-[#001144]/80 ml-4" />
              a normal rock
            </div>
          </Html>
        </mesh>
        
        {/* Aqua Liquid & NFC Tag Group */}
        <group ref={liquidGroupRef}>
          {/* NFC Tag Disc */}
          <group ref={nfcRef} position={[0, 0, 0.05]} rotation={[0, Math.PI, 0]}>
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
              <div className={`transition-all duration-1000 flex items-center font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-[#001144] whitespace-nowrap ${isHovered ? 'opacity-100 translate-y-0 pointer-events-auto delay-500' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
                <div className="w-1.5 h-1.5 rounded-full bg-[#001144]" />
                <div className="w-32 h-[1px] bg-[#001144]/80 mr-4" />
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
              transparent={true}
              opacity={0.9}
              distort={0.3}
              speed={2.5}
              clearcoat={1}
              clearcoatRoughness={0.1}
            />
            <Sparkles count={40} scale={0.9} size={2.5} speed={0.4} opacity={1} color="#ffffff" />
            <Sparkles count={20} scale={1.2} size={3.5} speed={0.8} opacity={0.8} color="#aaddff" />
            
            <Html position={[0.2, 0.2, 0]}>
              <div className={`transition-all duration-1000 flex items-center font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-[#001144] whitespace-nowrap ${isHovered ? 'opacity-100 translate-y-0 pointer-events-auto delay-700' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
                <div className="w-1.5 h-1.5 rounded-full bg-[#001144]" />
                <div className="w-40 h-[1px] bg-[#001144]/80 mr-4" />
                a sparkly silicon protective layer
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

export function RockCanvas() {
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = () => {
    if (!isHovered) {
      setIsHovered(true);
      playFuturisticSweep();
    }
  };
  const handleMouseLeave = () => {
    if (isHovered) {
      setIsHovered(false);
      playClick();
    }
  };
  
  const handleToggle = () => {
    if (isHovered) handleMouseLeave();
    else handleMouseEnter();
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center">
      {/* Invisible DOM hit area for the rock */}
      <div 
        className="w-[300px] h-[300px] md:w-[450px] md:h-[450px] rounded-full pointer-events-auto cursor-pointer absolute z-10"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleToggle}
      />
      <Canvas shadows camera={{ position: [0, 0, 6], fov: 45 }} className="!pointer-events-none">
        {/* Lights */}
        <ambientLight intensity={isHovered ? 0.8 : 0.6} />
        <directionalLight position={[5, 8, 4]} intensity={isHovered ? 1.4 : 1.8} castShadow shadow-bias={-0.0001} />
        <directionalLight position={[-5, 5, -2]} intensity={isHovered ? 0.8 : 0.6} color="#e6f0ff" />
        <SpotLight position={[0, 5, 5]} angle={0.3} penumbra={0.5} intensity={isHovered ? 6 : 4} castShadow color="#ffffff" />

        <Environment preset="studio" />
        
        {/* Main Rock */}
        <RockMesh isHovered={isHovered} />
        
        {/* Small floating rocks around */}
        <SmallRock position={[-2.5, 1.2, -1]} scale={0.3} speed={2.5} rotationIntensity={isHovered ? 0.5 : 1.5} offset={1.2} />
        <SmallRock position={[2.2, -0.8, -0.5]} scale={0.2} speed={3} rotationIntensity={isHovered ? 0.5 : 2} offset={3.4} />
        <SmallRock position={[-1.5, -1.5, -2]} scale={0.4} speed={2} rotationIntensity={isHovered ? 0.2 : 1} color="#f0f0f0" offset={5.1} />
        <SmallRock position={[2.8, 1.5, -2]} scale={0.25} speed={2.8} rotationIntensity={isHovered ? 0.5 : 1.8} offset={7.8} />
        
        {/* Global atmospheric dust/sparkles */}
        <Sparkles count={40} scale={8} size={2} speed={0.4} opacity={0.15} color="#c0c0c0" />

        {/* Dramatic floor shadow */}
        <ContactShadows 
          position={[0, -2.5, 0]} 
          opacity={0.7} 
          scale={15} 
          blur={2.5} 
          far={6} 
          resolution={512}
          color="#000000"
        />
      </Canvas>
    </div>
  );
}
