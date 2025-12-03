import React from 'react';
import { DatingMode, DatingPortal } from '../types';
import { Heart, Sparkles, Users, Search, ArrowRight } from 'lucide-react';

interface PortalSelectorProps {
  onSelect: (mode: DatingMode) => void;
}

const portals: DatingPortal[] = [
  {
    id: DatingMode.SOULMATE,
    title: 'Twin Flame',
    description: 'Seek deep spiritual connection',
    color: '#ec4899', // Pink
  },
  {
    id: DatingMode.CASUAL,
    title: 'Stellar Fling',
    description: 'Fun & casual encounters',
    color: '#f59e0b', // Amber
  },
  {
    id: DatingMode.FRIENDSHIP,
    title: 'Cosmic Friend',
    description: 'Platonic vibes & chat',
    color: '#10b981', // Emerald
  },
  {
    id: DatingMode.UNDECIDED,
    title: 'Open Void',
    description: 'Let the stars decide',
    color: '#6366f1', // Indigo
  }
];

export const PortalSelector: React.FC<PortalSelectorProps> = ({ onSelect }) => {
  return (
    <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-6 animate-fade-in font-sans overflow-y-auto">
      
      {/* Hero Section */}
      <div className="text-center mb-16 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-astro-gold/20 rounded-full blur-[100px] pointer-events-none" />
        <h1 className="text-6xl md:text-8xl font-bold font-mystical text-white mb-6 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] tracking-tighter">
          ASTRO BUDDY
        </h1>
        <p className="text-xl md:text-2xl text-indigo-100 max-w-2xl mx-auto font-light tracking-wide bg-black/30 backdrop-blur-sm p-4 rounded-xl border border-white/10">
          Your AI companion for navigating the cosmos of connection.
          <br />
          <span className="text-astro-gold font-semibold text-base uppercase tracking-[0.2em] mt-2 block">Select Your Path</span>
        </p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full max-w-7xl px-4">
        {portals.map((portal) => (
          <button
            key={portal.id}
            onClick={() => onSelect(portal.id)}
            className="group relative flex flex-col h-full overflow-hidden rounded-3xl bg-slate-950/60 backdrop-blur-xl border border-white/10 transition-all duration-500 hover:scale-105 hover:bg-slate-900/80 hover:border-astro-gold/50 shadow-2xl"
          >
            {/* Top Color Bar */}
            <div className="h-2 w-full" style={{ backgroundColor: portal.color }} />
            
            <div className="p-8 flex flex-col items-center text-center flex-grow">
              {/* Icon Container */}
              <div 
                className="mb-6 p-5 rounded-full bg-white/5 border border-white/10 group-hover:bg-white/10 group-hover:border-white/30 transition-all duration-500 group-hover:scale-110 shadow-[0_0_30px_rgba(0,0,0,0.5)]"
                style={{ color: portal.color }}
              >
                {portal.id === DatingMode.SOULMATE && <Heart size={32} strokeWidth={1.5} />}
                {portal.id === DatingMode.CASUAL && <Sparkles size={32} strokeWidth={1.5} />}
                {portal.id === DatingMode.FRIENDSHIP && <Users size={32} strokeWidth={1.5} />}
                {portal.id === DatingMode.UNDECIDED && <Search size={32} strokeWidth={1.5} />}
              </div>

              <h3 className="text-2xl font-mystical text-white mb-3 group-hover:text-astro-gold transition-colors">
                {portal.title}
              </h3>
              
              <p className="text-indigo-200/80 font-medium text-base leading-relaxed mb-6">
                {portal.description}
              </p>

              <div className="mt-auto opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 flex items-center gap-2 text-astro-gold text-sm font-bold uppercase tracking-widest">
                Enter Portal <ArrowRight size={16} />
              </div>
            </div>

            {/* Background Glow on Hover */}
            <div 
              className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-700 pointer-events-none"
              style={{ background: `radial-gradient(circle at center, ${portal.color}, transparent 70%)` }}
            />
          </button>
        ))}
      </div>
      
      <div className="mt-12 text-white/30 text-xs font-sans tracking-[0.2em] uppercase">
        Powered by Gemini 2.5 Flash
      </div>
    </div>
  );
};
