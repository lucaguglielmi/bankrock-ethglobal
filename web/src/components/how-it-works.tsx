"use client";

import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Environment, Sparkles } from "@react-three/drei";
import { InfoModal } from "@/components/info-modal";
import { AquaInfoModal } from "@/components/aqua-info-modal";
import * as THREE from "three";

// A 3D Background that changes based on the hovered topic
function Hover3DBackground({ topic }: { topic: string | null }) {
  if (!topic) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden rounded-3xl opacity-60 transition-opacity duration-1000">
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
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

export function HowItWorks() {
  const [hoveredTopic, setHoveredTopic] = useState<string | null>(null);

  return (
    <section className="w-full bg-neutral-50 px-6 md:px-12 pb-32 md:pb-48 relative z-10">
      <div className="relative w-full max-w-6xl mx-auto bg-black rounded-[3rem] p-8 md:p-24 overflow-hidden shadow-2xl text-white min-h-[500px] flex items-center">
        
        {/* Subtle base gradient when no topic is hovered */}
        <div className={`absolute inset-0 bg-gradient-to-br from-neutral-900 to-black transition-opacity duration-700 ${hoveredTopic ? 'opacity-0' : 'opacity-100'}`} />
        
        {/* Topic-specific 3D background */}
        <Hover3DBackground topic={hoveredTopic} />
        
        <div className="relative z-10 max-w-3xl flex flex-col gap-8">
          <span className="text-sm font-bold uppercase tracking-widest text-neutral-400">The Mechanism</span>
          <h2 className="text-4xl md:text-6xl font-black tracking-tighter">
            How does it work?
          </h2>
          
          <p className="text-xl md:text-2xl text-neutral-300 leading-relaxed font-medium">
            Your bank is up to no good. A Bank Rock is a physical pebble that you can gift someone. 
            They can forget it in a drawer, or activate it by tapping their phone. 
            It contains an Aqua position that earns on autopilot.
          </p>

          <div className="flex flex-wrap gap-4 mt-8">
            <div 
              onMouseEnter={() => setHoveredTopic("aqua")}
              onMouseLeave={() => setHoveredTopic(null)}
            >
              <AquaInfoModal triggerText="What is Aqua?" />
            </div>
            <div
              onMouseEnter={() => setHoveredTopic("control")}
              onMouseLeave={() => setHoveredTopic(null)}
            >
              <InfoModal 
                triggerText="How do I control the rock?" 
                title="How do I control the rock?"
                content="Control is entirely physical and cryptographic. Tap your NFC-enabled smartphone against the resin-sealed portion of the Bank Rock to securely open the interface. Alternatively, you can copy the setup prompt to your favorite AI agent and control the rock via the Model Context Protocol (MCP). Your agent can perform on-chain operations, manage your liquidity, and rebalance your portfolio entirely on your behalf."
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
