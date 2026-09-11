"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Environment, ContactShadows, Sparkles } from "@react-three/drei";
import * as THREE from "three";

function RockMesh() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.1;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.6} floatIntensity={1.2}>
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
  return (
    <div className="absolute inset-0 pointer-events-none z-0">
      <Canvas shadows camera={{ position: [0, 0, 6], fov: 45 }}>
        {/* Lights */}
        <ambientLight intensity={0.5} />
        {/* Main dramatic light */}
        <directionalLight position={[5, 8, 4]} intensity={1.5} castShadow shadow-bias={-0.0001} />
        {/* Soft fill light from the other side */}
        <directionalLight position={[-5, 5, -2]} intensity={0.5} color="#e6f0ff" />
        
        <Environment preset="city" />
        
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
          resolution={512}
          color="#000000"
        />
      </Canvas>
    </div>
  );
}
