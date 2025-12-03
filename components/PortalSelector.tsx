import React from 'react';
import { DatingMode, DatingPortal } from '../types';
import { Heart, Sparkles, Users, Search } from 'lucide-react';

interface PortalSelectorProps {
  onSelect: (mode: DatingMode) => void;
}

const portals: DatingPortal[] = [
  {
    id: DatingMode.SOULMATE,
    title: 'Twin Flame',
    description: 'Deep, spiritual connection seeker.',
    color: '#ec4899', // Pink
  },
  {
    id: DatingMode.CASUAL,
    title: 'Stellar Fling',
    description: 'Fun, casual, and in the moment.',
    color: '#f59e0b', // Amber
  },
  {
    id: DatingMode.FRIENDSHIP,
    title: 'Cosmic Friend',
    description: 'Platonic connections and vibes.',
    color: '#10b981', // Emerald
  },
  {
    id: DatingMode.UNDECIDED,
    title: 'Open Void',
    description: 'Not sure yet? Let the stars decide.',
    color: '#6366f1', // Indigo
  }
];

export const PortalSelector: React.FC<PortalSelectorProps> = ({ onSelect }) => {
  return (
    <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-6 animate-fade-in">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-6xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-300 via-pink-300 to-indigo-300 mb-4 drop-shadow-lg">
          Astro Buddy
        </h1>
        <p className="text-lg text-indigo-200 max-w-md mx-auto">
          Choose your portal to begin your astrological journey.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
        {portals.map((portal) => (
          <button
            key={portal.id}
            onClick={() => onSelect(portal.id)}
            className="group relative overflow-hidden rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 p-6 transition-all duration-300 hover:scale-105 hover:bg-white/10 hover:border-white/30 text-left"
          >
            <div 
              className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-300" 
              style={{ backgroundColor: portal.color }}
            />
            <div className="relative z-10 flex items-start justify-between">
              <div>
                <h3 className="text-2xl font-semibold text-white mb-2">{portal.title}</h3>
                <p className="text-indigo-200">{portal.description}</p>
              </div>
              <div 
                className="p-3 rounded-full bg-white/10 text-white"
                style={{ color: portal.color }}
              >
                {portal.id === DatingMode.SOULMATE && <Heart size={24} />}
                {portal.id === DatingMode.CASUAL && <Sparkles size={24} />}
                {portal.id === DatingMode.FRIENDSHIP && <Users size={24} />}
                {portal.id === DatingMode.UNDECIDED && <Search size={24} />}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
