"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";

function RockMesh() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.1;
      meshRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.1;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
      <mesh ref={meshRef} position={[0, 0, 0]} castShadow receiveShadow>
        <icosahedronGeometry args={[1.5, 4]} />
        <MeshDistortMaterial
          color="#f0f0f0"
          roughness={0.7}
          metalness={0.1}
          distort={0.4}
          speed={1.5}
        />
      </mesh>
    </Float>
  );
}

export function RockCanvas() {
  return (
    <div className="absolute inset-0 pointer-events-none z-0">
      <Canvas shadows camera={{ position: [0, 0, 5], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
        <Environment preset="city" />
        <RockMesh />
        <ContactShadows position={[0, -2, 0]} opacity={0.5} scale={10} blur={2} far={4} />
      </Canvas>
    </div>
  );
}
