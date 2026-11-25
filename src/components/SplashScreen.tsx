import React, { useEffect, useState } from 'react';
import { Mic2 } from 'lucide-react';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t1 = window.setTimeout(() => setFading(true), 780);
    const t2 = window.setTimeout(() => onComplete(), 1120);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-50 bg-[#0D0E11] flex flex-col items-center justify-center select-none transition-opacity duration-300 ${
        fading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center gap-5">
        {/* Emblem */}
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-[#14171E] border border-amber-500/35 shadow-2xl flex items-center justify-center">
            <Mic2 className="w-9 h-9 text-amber-400" />
          </div>
        </div>

        {/* Wordmark */}
        <div className="text-center space-y-1">
          <h1 className="text-[22px] font-semibold tracking-tight text-[#F4F5F7]">
            KaraokePitch
          </h1>
          <p className="text-[11px] font-mono-num uppercase tracking-[0.22em] text-[#7D8594]">
            Studio Edition
          </p>
        </div>

        {/* Minimal studio level loader bar */}
        <div className="w-36 h-[3px] rounded-full bg-white/[0.08] overflow-hidden mt-1">
          <div className="h-full bg-amber-500 rounded-full animate-[splashbar_0.85s_ease-out_forwards]" />
        </div>
      </div>

      <style>{`
        @keyframes splashbar {
          0% { width: 8%; }
          65% { width: 78%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
};
