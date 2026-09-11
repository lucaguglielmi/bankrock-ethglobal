"use client";

import { useState, useEffect } from "react";
import { ArrowRight, X } from "lucide-react";

interface InfoModalProps {
  triggerText: string;
  title: string;
  content: string;
}

export function InfoModal({ triggerText, title, content }: InfoModalProps) {
  const [isOpen, setIsOpen] = useState(false);

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
        className="px-6 py-3 rounded-full border border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/40 backdrop-blur-md transition-all font-semibold flex items-center gap-2 group cursor-pointer"
      >
        {triggerText}
        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-12 text-black text-left cursor-default">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />
          
          <div 
            className="bg-white border border-neutral-200 rounded-3xl p-8 md:p-12 max-w-2xl w-full shadow-2xl relative max-h-full overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-6 right-6 p-2 bg-neutral-100 rounded-full hover:bg-neutral-200 transition-colors z-10"
            >
              <X className="w-5 h-5 text-neutral-700" />
            </button>
            
            <h3 className="text-3xl md:text-4xl font-black tracking-tighter mb-6 text-neutral-900">
              {title}
            </h3>
            <p className="text-lg md:text-xl text-neutral-600 leading-relaxed font-medium">
              {content}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
