"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ArrowRight, Code, Beaker, GraduationCap, Sparkles as SparklesIcon, Info } from "lucide-react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Environment, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AquaInfoModalProps {
  triggerText: string;
}

type TabType = "simple" | "defi" | "nerd" | "agents";

function Scene({ tab }: { tab: TabType }) {
  const distortRef = useRef<any>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Track target color so we can lerp to it
  const targetColorRef = useRef(new THREE.Color("#0044ff"));

  useFrame((state, delta) => {
    if (!distortRef.current || !meshRef.current) return;
    
    // Target parameters based on tab
    let targetDistort = 0.2;
    let targetSpeed = 1;
    let targetScale = 2.5;

    if (tab === "simple") {
      targetDistort = 0.3;
      targetSpeed = 1.5;
      targetScale = 2.5;
      targetColorRef.current.set("#0044ff");
    } else if (tab === "defi") {
      targetDistort = 0.5;
      targetSpeed = 3;
      targetScale = 2.7;
      targetColorRef.current.set("#0066ff");
    } else if (tab === "nerd") {
      targetDistort = 0.8;
      targetSpeed = 4;
      targetScale = 2.9;
      targetColorRef.current.set("#0011aa");
    } else if (tab === "agents") {
      targetDistort = 0.1;
      targetSpeed = 0.5;
      targetScale = 2.3;
      targetColorRef.current.set("#333333");
    }

    // Smoothly interpolate parameters (Delta independent interpolation using lerp with small alpha)
    distortRef.current.distort = THREE.MathUtils.lerp(distortRef.current.distort, targetDistort, 0.05);
    distortRef.current.speed = THREE.MathUtils.lerp(distortRef.current.speed, targetSpeed, 0.05);
    
    // Smoothly interpolate color
    distortRef.current.color.lerp(targetColorRef.current, 0.05);

    // Smoothly interpolate scale
    meshRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.05);
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 5, 2]} intensity={2} />
      <Environment preset="city" />

      <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
        <mesh ref={meshRef} scale={2.5}>
          <sphereGeometry args={[1, 128, 128]} />
          <MeshDistortMaterial
            ref={distortRef}
            color="#0044ff"
            roughness={0.1}
            metalness={0.9}
            transparent={true}
            opacity={0.3}
            distort={0.3}
            speed={1.5}
          />
        </mesh>
        <Sparkles count={80} scale={6} size={2} color="#ffffff" opacity={0.3} />
      </Float>
    </>
  );
}

// Custom Tooltip helper component for the simple tab
function InfoTooltip({ children, text }: { children: React.ReactNode, text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger className="inline-flex items-center cursor-help group border-b border-dashed border-neutral-400 hover:border-white transition-colors">
        {children}
        <Info className="w-3 h-3 ml-1 text-neutral-400 group-hover:text-white transition-colors" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs bg-neutral-800 text-neutral-200 border-neutral-700 text-sm">
        <p>{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function AquaInfoModal({ triggerText }: AquaInfoModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("simple");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
      setTimeout(() => setActiveTab("simple"), 300); // Reset after close
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen]);

  const tabs = [
    { id: "simple", label: "Simple", icon: SparklesIcon },
    { id: "defi", label: "DeFi User", icon: Beaker },
    { id: "nerd", label: "Finance Nerd", icon: GraduationCap },
    { id: "agents", label: "Agents", icon: Code },
  ] as const;

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-8 text-neutral-200 text-left cursor-default">
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(false);
        }}
      />
      
      <div 
        className="bg-black border border-neutral-800 rounded-[2rem] w-[95vw] h-[95vh] max-w-7xl shadow-2xl relative flex flex-col animate-in fade-in slide-in-from-bottom-8 zoom-in-95 duration-300 z-10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background 3D Canvas */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-60">
          <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
            <Scene tab={activeTab} />
          </Canvas>
        </div>

        {/* Sticky Header */}
        <div className="relative z-20 bg-black/40 backdrop-blur-3xl border-b border-neutral-800/80 p-6 pt-8 pb-4 shrink-0 flex flex-col gap-6">
          <button 
            onClick={() => setIsOpen(false)}
            className="absolute top-6 right-6 p-2 bg-neutral-900 rounded-full hover:bg-neutral-800 transition-colors z-10"
          >
            <X className="w-5 h-5 text-neutral-400" />
          </button>
          
          <div>
            <h3 className="text-3xl md:text-5xl font-black tracking-tighter mb-2 text-white">
              Understanding Aqua
            </h3>
            <p className="text-neutral-400 font-medium text-lg">Choose your level of depth.</p>
          </div>

          <div className="flex overflow-x-auto hide-scrollbar gap-2 pb-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold transition-all whitespace-nowrap ${
                  activeTab === t.id 
                    ? "bg-white text-black shadow-md scale-100" 
                    : "bg-neutral-900/50 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 scale-95 hover:scale-100"
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
        
        {/* Scrollable Content */}
        <div className="relative z-10 overflow-y-auto p-6 md:p-12 flex-1">
          <div className="max-w-4xl mx-auto prose prose-invert prose-lg prose-p:text-neutral-300">
            
            {activeTab === "simple" && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <h4 className="text-3xl font-bold mb-6 text-white mt-0">The Magic of Virtual Capital</h4>
                <p>
                  Imagine you have a vault of money, and you want to use it to earn fees by acting as a market maker. 
                  Traditionally, you would have to take your money out of your vault, lock it into a smart contract, and hope everything works perfectly.
                </p>
                <p>
                  <strong>Aqua changes this completely.</strong>
                </p>
                <p>
                  With Aqua, your tokens never leave your wallet. Instead, you create a <InfoTooltip text="A mathematical promise that allows a strategy to use your tokens without you actually moving them out of your wallet.">virtual allocation</InfoTooltip>—a mathematical promise that says "I will allow this specific strategy to use my tokens, but I'm keeping them in my pocket until someone actually trades with me."
                </p>
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 mt-12 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-teal-400" />
                  <h5 className="font-bold text-white text-xl mt-0">The Bank Rock Experience</h5>
                  <p className="text-neutral-300 mb-0">
                    Your Bank Rock holds tokens inside its Rock Account. Through Aqua, it constantly exposes these tokens to the market to earn fees, but the tokens stay safely inside the Rock until an actual trade happens. It is the ultimate expression of self-custodial <InfoTooltip text="The world of Decentralized Finance where financial applications run on blockchain technology without central intermediaries.">DeFi</InfoTooltip>. 
                    Your <InfoTooltip text="Assets that are readily available to be traded or moved. In DeFi, providing liquidity usually means locking these assets up.">liquidity</InfoTooltip> remains entirely in your control.
                  </p>
                </div>
              </div>
            )}

            {activeTab === "defi" && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <h4 className="text-3xl font-bold mb-6 text-white mt-0">How Aqua Routes Trades</h4>
                <p>
                  Aqua allows liquidity providers (like the Bank Rock) to keep tokens in their own smart contract wallets while assigning virtual balances to one or more <strong>Strategies</strong>.
                </p>
                
                <div className="my-10 bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex justify-center items-center shadow-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/diagrams/diagram1.svg" alt="DeFi User Diagram" className="max-w-full h-auto w-full object-contain max-h-[300px] rounded-lg" />
                </div>

                <p>
                  A single approved token balance can support multiple strategies simultaneously, without needing to deposit funds into separate protocol pools (like Uniswap or Curve). This massively simplifies how you deploy capital.
                </p>
                <ul className="text-neutral-300">
                  <li><strong className="text-white">The Maker:</strong> The Bank Rock account itself. It holds the actual ERC-20 tokens.</li>
                  <li><strong className="text-white">The Strategy:</strong> An immutable mathematical curve (e.g. constant product) deployed to the network. It dictates the price at which the Maker is willing to buy or sell.</li>
                  <li><strong className="text-white">The Swap:</strong> When a user routes a trade through the 1inch aggregator, it might find your Aqua strategy. The swap executes directly against your Rock's wallet via Just-in-Time (JIT) execution.</li>
                </ul>
                <p>
                  Because the strategy is immutable, your funds are incredibly secure. The only way to change the parameters of a strategy is to "dock" (cancel) the old one and "ship" (deploy) a new one.
                </p>
              </div>
            )}

            {activeTab === "nerd" && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <h4 className="text-3xl font-bold mb-6 text-white mt-0">Deep Dive: Mechanics & Risks</h4>
                
                <p>
                  Aqua unlocks a new paradigm of capital efficiency by decoupling the <em>execution curve</em> from the <em>storage of assets</em>.
                </p>

                <div className="my-10 bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex justify-center items-center shadow-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/diagrams/diagram2.svg" alt="Finance Nerd Diagram" className="max-w-full h-auto w-full object-contain max-h-[400px] rounded-lg" />
                </div>

                <h5 className="text-white mt-8">1. Shared Liquidity & Idle Yield</h5>
                <p>
                  The true power of Aqua is capital efficiency. Since tokens are not locked in an AMM, the Bank Rock can deploy its idle stablecoins into a yield protocol (e.g., Aave v3 or Morpho) to earn passive yield. When a swap occurs via a SwapVM strategy, the required liquidity is dynamically pulled (Just-in-Time) to fulfill the trade. You are earning active AMM fees and passive lending yield on the exact same base capital.
                </p>

                <h5 className="text-white mt-8">2. Constant Product Execution</h5>
                <p>
                  The Bank Rock uses a SwapVM program for a two-token constant-product (AMM-like) strategy. This acts exactly like a traditional Uniswap V2 pool ($x \times y = k$), but executed entirely virtually. The strategy parameters (fee in basis points, pricing curve, salt, expiry) are baked into the execution context.
                </p>
                
                <h5 className="text-white mt-8 mb-4">3. Risks to Consider</h5>
                <div className="space-y-4 not-prose">
                  <div className="border border-neutral-800 rounded-xl p-5 bg-neutral-900/50">
                    <strong className="text-white block mb-1">Impermanent Loss</strong>
                    <p className="text-sm text-neutral-400 mt-1 mb-0 leading-relaxed">Like any AMM strategy, exposing a virtual curve subjects the portfolio to impermanent loss if asset prices diverge significantly.</p>
                  </div>
                  <div className="border border-neutral-800 rounded-xl p-5 bg-neutral-900/50">
                    <strong className="text-white block mb-1">Smart Contract Risk</strong>
                    <p className="text-sm text-neutral-400 mt-1 mb-0 leading-relaxed">The Rock relies on the security of the 1inch SwapVM and the underlying yield protocols (like Aave). If those are compromised, the funds in the Rock are at risk.</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "agents" && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="font-mono text-sm bg-neutral-900 text-neutral-300 p-8 rounded-2xl overflow-hidden shadow-inner border border-neutral-800">
                  <h4 className="text-green-400 font-bold mb-6 mt-0 text-xl">04-aqua-integration.md</h4>
                  
                  <div className="space-y-8">
                    <div>
                      <h5 className="text-white mt-0 mb-3 border-b border-neutral-800 pb-2 text-base">Why Aqua</h5>
                      <p className="mb-0">Aqua allows a liquidity provider to keep tokens in its wallet while assigning virtual balances to strategies. One approved balance can support multiple strategies without depositing funds into separate protocol pools.</p>
                    </div>

                    <div>
                      <h5 className="text-white mt-0 mb-3 border-b border-neutral-800 pb-2 text-base">Bank Rock mapping</h5>
                      <table className="w-full text-left text-neutral-400 border-collapse">
                        <thead>
                          <tr>
                            <th className="border-b border-neutral-800 pb-3 font-semibold text-white">Bank Rock</th>
                            <th className="border-b border-neutral-800 pb-3 font-semibold text-white">Aqua</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800">
                          <tr><td className="py-3">Rock Account</td><td className="py-3 text-white">Maker</td></tr>
                          <tr><td className="py-3">Token reserves</td><td className="py-3 text-white">ERC-20 balances</td></tr>
                          <tr><td className="py-3">Liquidity stream</td><td className="py-3 text-white">Immutable strategy</td></tr>
                          <tr><td className="py-3">Opening/Closing</td><td className="py-3 text-white">ship / dock</td></tr>
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <h5 className="text-white mt-0 mb-3 border-b border-neutral-800 pb-2 text-base">Strategy direction</h5>
                      <p className="text-yellow-400 mb-2 font-semibold">Decision: Constant-product strategy</p>
                      <p className="mb-0 leading-relaxed">The MVP will use a simple, two-token constant-product (AMM-like) strategy. This provides predictable behaviour. The strategy will use test tokens representing USDC and WETH.</p>
                    </div>

                    <div>
                      <h5 className="text-white mt-0 mb-3 border-b border-neutral-800 pb-2 text-base">SwapVM vs Custom Aqua App</h5>
                      <p className="text-yellow-400 mb-2 font-semibold">Decision: SwapVM program for MVP</p>
                      <p className="mb-0 leading-relaxed">Given time constraints, we use an existing SwapVM program instead of a custom Aqua App for faster routing, less custom surface, and immediate standard compatibility.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="px-6 py-3 rounded-full border border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/40 backdrop-blur-md transition-all font-semibold flex items-center gap-2 group cursor-pointer text-white"
      >
        {triggerText}
        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </button>

      {mounted && isOpen && createPortal(modalContent, document.body)}
    </>
  );
}
