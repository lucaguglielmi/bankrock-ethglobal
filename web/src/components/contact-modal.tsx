"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ArrowRight, Loader2, CheckCircle } from "lucide-react";

interface ContactModalProps {
  triggerText: string;
  title: string;
  variant?: "dark" | "light";
}

export function ContactModal({ triggerText, title, variant = "dark" }: ContactModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
      }, 2000);
    }, 1500);
  };

  const isDark = variant === "dark";
  const btnClass = isDark 
    ? "w-full bg-black text-white py-4 rounded-full font-semibold hover:bg-neutral-800 active:scale-[0.98] transition-all"
    : "w-full bg-white text-black border border-black/10 py-4 rounded-full font-semibold hover:bg-neutral-50 active:scale-[0.98] transition-all shadow-sm";

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-12 text-black text-left cursor-default">
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={() => setIsOpen(false)}
      />
      
      <div className="bg-white rounded-[2rem] p-8 md:p-10 max-w-lg w-full shadow-2xl relative z-10 animate-in slide-in-from-bottom-8 fade-in zoom-in-95 duration-300">
        <button 
          onClick={() => setIsOpen(false)}
          className="absolute top-6 right-6 p-2 bg-neutral-100/50 rounded-full hover:bg-neutral-200 active:scale-95 transition-all"
        >
          <X className="w-5 h-5 text-neutral-700" />
        </button>
        
        <h3 className="text-2xl md:text-3xl font-black tracking-tighter mb-2 text-neutral-900">
          {title}
        </h3>
        
        {submitted ? (
          <div className="py-12 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
            <h4 className="text-2xl font-bold mb-2">Message Sent!</h4>
            <p className="text-neutral-500">We'll be in touch soon.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5 mt-8 animate-in fade-in duration-300">
            <div className="relative group">
              <input 
                required 
                type="text" 
                id="name"
                className="peer w-full px-4 py-4 pt-6 rounded-2xl border-2 border-neutral-100 bg-neutral-50 focus:bg-white focus:outline-none focus:border-black transition-all placeholder-transparent" 
                placeholder="Your name" 
              />
              <label 
                htmlFor="name" 
                className="absolute left-4 top-2 text-xs font-bold uppercase tracking-wider text-neutral-400 transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-placeholder-shown:font-medium peer-placeholder-shown:normal-case peer-focus:top-2 peer-focus:text-xs peer-focus:font-bold peer-focus:uppercase"
              >
                Name
              </label>
            </div>
            <div className="relative group">
              <input 
                required 
                type="text" 
                id="contact"
                className="peer w-full px-4 py-4 pt-6 rounded-2xl border-2 border-neutral-100 bg-neutral-50 focus:bg-white focus:outline-none focus:border-black transition-all placeholder-transparent" 
                placeholder="Email or Telegram/Twitter handle" 
              />
              <label 
                htmlFor="contact" 
                className="absolute left-4 top-2 text-xs font-bold uppercase tracking-wider text-neutral-400 transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-placeholder-shown:font-medium peer-placeholder-shown:normal-case peer-focus:top-2 peer-focus:text-xs peer-focus:font-bold peer-focus:uppercase"
              >
                Contact Info
              </label>
            </div>
            <div className="relative group">
              <textarea 
                required 
                id="message"
                rows={4} 
                className="peer w-full px-4 py-4 pt-6 rounded-2xl border-2 border-neutral-100 bg-neutral-50 focus:bg-white focus:outline-none focus:border-black transition-all resize-none placeholder-transparent" 
                placeholder="Message"
              ></textarea>
              <label 
                htmlFor="message" 
                className="absolute left-4 top-2 text-xs font-bold uppercase tracking-wider text-neutral-400 transition-all peer-placeholder-shown:top-4 peer-placeholder-shown:text-base peer-placeholder-shown:font-medium peer-placeholder-shown:normal-case peer-focus:top-2 peer-focus:text-xs peer-focus:font-bold peer-focus:uppercase"
              >
                Message
              </label>
            </div>
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full bg-black text-white py-4 rounded-xl font-semibold hover:bg-neutral-800 active:scale-[0.98] transition-all mt-2 flex items-center justify-center gap-2 group disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  Send Message
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className={btnClass}
      >
        {triggerText}
      </button>
      {mounted && isOpen && createPortal(modalContent, document.body)}
    </>
  );
}
