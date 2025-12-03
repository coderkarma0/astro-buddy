import React, { useState } from 'react';
import { PortalSelector } from './components/PortalSelector';
import { ThreeBackground } from './components/ThreeBackground';
import { LiveSession } from './components/LiveSession';
import { DatingMode } from './types';

// Helper to get color from mode
const getModeColor = (mode: DatingMode): string => {
  switch (mode) {
    case DatingMode.SOULMATE: return '#ec4899'; // Pink
    case DatingMode.CASUAL: return '#f59e0b'; // Amber
    case DatingMode.FRIENDSHIP: return '#10b981'; // Emerald
    case DatingMode.UNDECIDED: return '#6366f1'; // Indigo
    default: return '#6366f1';
  }
};

const App: React.FC = () => {
  const [datingMode, setDatingMode] = useState<DatingMode | null>(null);
  const [isTalking, setIsTalking] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handlePortalSelect = (mode: DatingMode) => {
    setDatingMode(mode);
  };

  const handleEndSession = () => {
    setDatingMode(null);
    setIsTalking(false);
    setIsAnalyzing(false);
  };

  const currentColor = datingMode ? getModeColor(datingMode) : '#4f46e5';

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-900 text-white selection:bg-indigo-500/30">
      
      {/* 3D Background Layer */}
      <ThreeBackground 
        active={!!datingMode} 
        modeColor={currentColor} 
        isTalking={isTalking}
        isAnalyzing={isAnalyzing}
      />

      {/* Content Layer */}
      <main className="relative z-10 w-full h-full">
        {!datingMode ? (
          <PortalSelector onSelect={handlePortalSelect} />
        ) : (
          <LiveSession 
            datingMode={datingMode} 
            isAnalyzing={isAnalyzing}
            onEndSession={handleEndSession} 
            setTalkingState={setIsTalking}
            setAnalyzingState={setIsAnalyzing}
          />
        )}
      </main>
    </div>
  );
};

export default App;