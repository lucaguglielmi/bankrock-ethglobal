"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ArrowRight, X } from "lucide-react";

export function AboutRocks() {
  const [isOpen, setIsOpen] = useState(false);

  // Prevent scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen]);

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 mt-8 text-neutral-900 hover:text-blue-600 transition-colors group font-semibold"
      >
        More about the rocks
        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-12">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-white/80 backdrop-blur-md"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Modal Content */}
          <div className="bg-white border border-neutral-200 rounded-3xl p-6 md:p-10 max-w-5xl w-full shadow-2xl relative max-h-full overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-6 right-6 p-2 bg-neutral-100 rounded-full hover:bg-neutral-200 transition-colors z-10"
            >
              <X className="w-5 h-5 text-neutral-700" />
            </button>
            
            <h3 className="text-3xl md:text-5xl font-black tracking-tighter mb-4 text-neutral-900">
              The Physical Bearer
            </h3>
            <p className="text-lg md:text-xl text-neutral-600 mb-10 max-w-3xl leading-relaxed font-medium">
              These are normal rocks handpicked from the riverbeds near Florence. They are carefully polished and selected. The best ones receive an embedded NFC sensor and a splash of colorful resin to cover it, transforming them into secure physical bearers for agentic DeFi.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {[1, 2, 3, 4, 5].map((num) => (
                <div key={num} className="aspect-square bg-neutral-100 rounded-2xl overflow-hidden relative group shadow-sm border border-neutral-100">
                  <Image
                    src={`/rocks/rock${num}.jpg`}
                    alt={`Bank Rock ${num}`}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
