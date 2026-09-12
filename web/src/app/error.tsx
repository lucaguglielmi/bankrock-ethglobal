"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service like Sentry or our telemetry
    console.error("Unhandled App Error:", error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 bg-white text-center font-sans">
      <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6 shadow-sm border border-red-100">
        <AlertTriangle className="w-8 h-8 text-red-500" />
      </div>
      
      <h2 className="text-3xl font-black tracking-tighter mb-3">
        System Anomaly Detected
      </h2>
      
      <p className="text-neutral-500 font-medium max-w-md mx-auto mb-8 leading-relaxed">
        We've encountered an unexpected error processing this interface. Our telemetry agents have been notified.
      </p>

      <button
        onClick={() => reset()}
        className="bg-black text-white px-8 py-3.5 rounded-full font-bold text-sm hover:bg-neutral-800 transition-all shadow-lg active:scale-95 flex items-center gap-2"
      >
        <RotateCcw className="w-4 h-4" />
        Restart Interface
      </button>

      {process.env.NODE_ENV === "development" && (
        <div className="mt-12 p-4 bg-neutral-50 border border-neutral-200 rounded-xl max-w-2xl w-full text-left overflow-auto">
          <p className="text-xs font-mono font-bold text-red-600 mb-2">DEVELOPMENT TRACE:</p>
          <pre className="text-[10px] font-mono text-neutral-600 whitespace-pre-wrap">
            {error.message}
            {"\n"}
            {error.stack}
          </pre>
        </div>
      )}
    </div>
  );
}
