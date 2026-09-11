"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

interface ContactModalProps {
  triggerText: string;
  title: string;
  variant?: "dark" | "light";
}

export function ContactModal({ triggerText, title, variant = "dark" }: ContactModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setIsOpen(false);
      setSubmitted(false);
    }, 2000);
  };

  const isDark = variant === "dark";
  const btnClass = isDark 
    ? "w-full bg-black text-white py-4 rounded-full font-semibold hover:bg-black/80 transition-colors"
    : "w-full bg-white text-black border border-black/10 py-4 rounded-full font-semibold hover:bg-neutral-50 transition-colors";

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className={btnClass}
      >
        {triggerText}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-12 text-black text-left cursor-default">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          
          <div className="bg-white border border-neutral-200 rounded-3xl p-8 md:p-10 max-w-lg w-full shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-6 right-6 p-2 bg-neutral-100 rounded-full hover:bg-neutral-200 transition-colors"
            >
              <X className="w-5 h-5 text-neutral-700" />
            </button>
            
            <h3 className="text-2xl md:text-3xl font-black tracking-tighter mb-2 text-neutral-900">
              {title}
            </h3>
            
            {submitted ? (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h4 className="text-xl font-bold mb-2">Message Sent!</h4>
                <p className="text-neutral-500">We'll be in touch soon.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-6">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Name</label>
                  <input required type="text" className="w-full px-4 py-3 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all" placeholder="Your name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Contact</label>
                  <input required type="text" className="w-full px-4 py-3 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all" placeholder="Email or Telegram/Twitter handle" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Message</label>
                  <textarea required rows={4} className="w-full px-4 py-3 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all resize-none" placeholder="Tell us why you deserve a rock or how you'd like to sponsor..."></textarea>
                </div>
                <button type="submit" className="w-full bg-black text-white py-4 rounded-full font-semibold hover:bg-black/90 transition-colors mt-2">
                  Send Message
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
