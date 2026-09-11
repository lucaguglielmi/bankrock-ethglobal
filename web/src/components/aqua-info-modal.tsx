"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ArrowRight, Code, Beaker, GraduationCap, Sparkles as SparklesIcon } from "lucide-react";
import { Canvas } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Environment, Sparkles, Wireframe, Sphere, TorusKnot } from "@react-three/drei";

interface AquaInfoModalProps {
  triggerText: string;
}

type TabType = "simple" | "defi" | "nerd" | "agents";

function Scene({ tab }: { tab: TabType }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 5, 2]} intensity={1} />
      <Environment preset="city" />

      {tab === "simple" && (
        <Float speed={2} rotationIntensity={1} floatIntensity={2}>
          <mesh scale={2.5}>
            <sphereGeometry args={[1, 64, 64]} />
            <MeshDistortMaterial
              color="#0066ff"
              roughness={0.1}
              metalness={0.8}
              transparent={true}
              opacity={0.3}
              distort={0.4}
              speed={2}
            />
          </mesh>
          <Sparkles count={40} scale={5} size={2} color="#00aaff" />
        </Float>
      )}

      {tab === "defi" && (
        <Float speed={3} rotationIntensity={2} floatIntensity={1.5}>
          <mesh scale={1.8}>
            <torusGeometry args={[1, 0.4, 32, 64]} />
            <MeshDistortMaterial
              color="#0044ff"
              roughness={0.3}
              metalness={0.6}
              transparent={true}
              opacity={0.5}
              distort={0.2}
              speed={3}
              wireframe
            />
          </mesh>
          <Sparkles count={60} scale={6} size={1} color="#ffffff" />
        </Float>
      )}

      {tab === "nerd" && (
        <Float speed={1} rotationIntensity={0.5} floatIntensity={1}>
          <mesh scale={1.2}>
            <torusKnotGeometry args={[1, 0.3, 128, 32]} />
            <MeshDistortMaterial
              color="#0022aa"
              roughness={0.2}
              metalness={1}
              transparent={true}
              opacity={0.7}
              distort={0.1}
              speed={1}
            />
          </mesh>
          <Sparkles count={100} scale={7} size={0.5} color="#0044ff" />
        </Float>
      )}

      {tab === "agents" && (
        <Float speed={0.5} rotationIntensity={0.1} floatIntensity={0.1}>
          <mesh scale={2}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#000000" wireframe />
          </mesh>
          <Sparkles count={200} scale={8} size={0.5} color="#00ff00" />
        </Float>
      )}
    </>
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-8 text-black text-left cursor-default">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(false);
        }}
      />
      
      <div 
        className="bg-white border border-neutral-200 rounded-[2rem] max-w-[900px] w-full shadow-2xl relative max-h-[90vh] flex flex-col animate-in fade-in slide-in-from-bottom-8 zoom-in-95 duration-300 z-10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Background 3D Canvas */}
        <div className="absolute inset-0 z-0 opacity-40 pointer-events-none bg-gradient-to-b from-white/0 via-white/50 to-white">
          <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
            <Scene tab={activeTab} />
          </Canvas>
        </div>

        {/* Sticky Header */}
        <div className="relative z-20 bg-white/80 backdrop-blur-xl border-b border-neutral-200/50 p-6 pt-8 pb-4 shrink-0 flex flex-col gap-6">
          <button 
            onClick={() => setIsOpen(false)}
            className="absolute top-6 right-6 p-2 bg-neutral-100 rounded-full hover:bg-neutral-200 transition-colors z-10"
          >
            <X className="w-5 h-5 text-neutral-700" />
          </button>
          
          <div>
            <h3 className="text-3xl font-black tracking-tighter mb-1 text-neutral-900">
              Understanding Aqua
            </h3>
            <p className="text-neutral-500 font-medium">Choose your level of depth.</p>
          </div>

          <div className="flex overflow-x-auto hide-scrollbar gap-2 pb-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold transition-all whitespace-nowrap ${
                  activeTab === t.id 
                    ? "bg-black text-white shadow-md scale-100" 
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 scale-95 hover:scale-100"
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
        
        {/* Scrollable Content */}
        <div className="relative z-10 overflow-y-auto p-6 md:p-10 flex-1">
          <div className="max-w-2xl mx-auto prose prose-neutral prose-lg">
            
            {activeTab === "simple" && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <h4 className="text-2xl font-bold mb-4">The Magic of Virtual Liquidity</h4>
                <p>
                  Imagine you have a vault of money, and you want to use it to earn fees by acting as a market maker. 
                  Traditionally, you would have to take your money out of your vault, lock it into a smart contract, and hope everything works perfectly.
                </p>
                <p>
                  <strong>Aqua changes this completely.</strong>
                </p>
                <p>
                  With Aqua, your tokens never leave your wallet. Instead, you create a "virtual allocation"—a mathematical promise that says "I will allow this specific strategy to use my tokens, but I'm keeping them in my pocket until someone actually trades with me."
                </p>
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 mt-8">
                  <h5 className="font-bold text-blue-900 mt-0">The Bank Rock Experience</h5>
                  <p className="text-blue-800 mb-0">
                    Your Bank Rock holds tokens inside its Rock Account. Through Aqua, it constantly exposes these tokens to the market to earn fees, but the tokens stay safely inside the Rock until an actual trade happens. It's like having your cake and eating it too.
                  </p>
                </div>
              </div>
            )}

            {activeTab === "defi" && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <h4 className="text-2xl font-bold mb-4">How Aqua Routes Trades</h4>
                <p>
                  Aqua allows liquidity providers (like the Bank Rock) to keep tokens in their own smart contract wallets while assigning virtual balances to one or more <strong>Strategies</strong>.
                </p>
                <p>
                  A single approved token balance can support multiple strategies simultaneously, without needing to deposit funds into separate protocol pools (like Uniswap or Curve).
                </p>
                <ul>
                  <li><strong>The Maker:</strong> The Bank Rock account itself. It holds the actual ERC-20 tokens.</li>
                  <li><strong>The Strategy:</strong> An immutable mathematical curve (e.g. constant product) deployed to the network. It dictates the price at which the Maker is willing to buy or sell.</li>
                  <li><strong>The Swap:</strong> When a user routes a trade through the 1inch aggregator, it might find your Aqua strategy. The swap executes directly against your Rock's wallet.</li>
                </ul>
                <p>
                  Because the strategy is immutable, your funds are incredibly secure. The only way to change the parameters of a strategy is to "dock" (cancel) the old one and "ship" (deploy) a new one.
                </p>
              </div>
            )}

            {activeTab === "nerd" && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <h4 className="text-2xl font-bold mb-4">Deep Dive: Mechanics & Risks</h4>
                
                <h5>1. Constant Product Execution</h5>
                <p>
                  The Bank Rock uses a SwapVM program for a two-token constant-product (AMM-like) strategy. This acts exactly like a traditional Uniswap V2 pool ($x \times y = k$), but executed entirely virtually. The strategy parameters (fee in basis points, pricing curve, salt, expiry) are baked into the execution context.
                </p>
                
                <h5>2. Shared Liquidity & Idle Yield</h5>
                <p>
                  The true power of Aqua is capital efficiency. Since tokens are not locked in an AMM, the Bank Rock can deploy its idle stablecoins into a yield protocol (e.g. Aave v3 or Morpho) to earn passive yield. When a swap occurs, the required liquidity is dynamically pulled to fulfill the trade.
                </p>
                
                <h5>3. Risks to Consider</h5>
                <div className="space-y-4">
                  <div className="border border-neutral-200 rounded-xl p-4 bg-white/80">
                    <strong className="text-black">Impermanent Loss</strong>
                    <p className="text-sm text-neutral-600 mt-1 mb-0">Like any AMM strategy, exposing a virtual curve subjects the portfolio to impermanent loss if asset prices diverge significantly.</p>
                  </div>
                  <div className="border border-neutral-200 rounded-xl p-4 bg-white/80">
                    <strong className="text-black">Smart Contract Risk</strong>
                    <p className="text-sm text-neutral-600 mt-1 mb-0">The Rock relies on the security of the 1inch SwapVM and the underlying yield protocols (like Aave). If those are compromised, the funds in the Rock are at risk.</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "agents" && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="font-mono text-sm bg-neutral-900 text-neutral-300 p-6 rounded-2xl overflow-hidden shadow-inner">
                  <h4 className="text-green-400 font-bold mb-4 mt-0">04-aqua-integration.md</h4>
                  
                  <div className="space-y-6">
                    <div>
                      <h5 className="text-white mt-0 mb-2 border-b border-neutral-700 pb-2">Why Aqua</h5>
                      <p className="mb-0">Aqua allows a liquidity provider to keep tokens in its wallet while assigning virtual balances to strategies. One approved balance can support multiple strategies without depositing funds into separate protocol pools.</p>
                    </div>

                    <div>
                      <h5 className="text-white mt-0 mb-2 border-b border-neutral-700 pb-2">Bank Rock mapping</h5>
                      <table className="w-full text-left text-neutral-400 border-collapse">
                        <thead>
                          <tr>
                            <th className="border-b border-neutral-700 pb-2">Bank Rock</th>
                            <th className="border-b border-neutral-700 pb-2">Aqua</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800">
                          <tr><td className="py-2">Rock Account</td><td className="py-2">Maker</td></tr>
                          <tr><td className="py-2">Token reserves</td><td className="py-2">ERC-20 balances</td></tr>
                          <tr><td className="py-2">Liquidity stream</td><td className="py-2">Immutable strategy</td></tr>
                          <tr><td className="py-2">Opening/Closing</td><td className="py-2">ship / dock</td></tr>
                        </tbody>
                      </table>
                    </div>

                    <div>
                      <h5 className="text-white mt-0 mb-2 border-b border-neutral-700 pb-2">Strategy direction</h5>
                      <p className="text-yellow-300 mb-1">Decision: Constant-product strategy</p>
                      <p className="mb-0">The MVP will use a simple, two-token constant-product (AMM-like) strategy. This provides predictable behaviour. The strategy will use test tokens representing USDC and WETH.</p>
                    </div>

                    <div>
                      <h5 className="text-white mt-0 mb-2 border-b border-neutral-700 pb-2">SwapVM vs Custom Aqua App</h5>
                      <p className="text-yellow-300 mb-1">Decision: SwapVM program for MVP</p>
                      <p className="mb-0">Given time constraints, we use an existing SwapVM program instead of a custom Aqua App for faster routing, less custom surface, and immediate standard compatibility.</p>
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
        className="px-6 py-3 rounded-full border border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/40 backdrop-blur-md transition-all font-semibold flex items-center gap-2 group cursor-pointer"
      >
        {triggerText}
        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </button>

      {mounted && isOpen && createPortal(modalContent, document.body)}
    </>
  );
}
