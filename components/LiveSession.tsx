import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { DatingMode, UserProfile } from '../types';
import { Mic, MicOff, PhoneOff, Radio, Sparkles, Loader2, Pause, Play } from 'lucide-react';

interface LiveSessionProps {
  datingMode: DatingMode;
  isAnalyzing: boolean;
  onEndSession: () => void;
  setTalkingState: (isTalking: boolean) => void;
  setAnalyzingState: (isAnalyzing: boolean) => void;
}

// Audio helpers
function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return new Blob([int16], { type: 'audio/pcm' });
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const setProfileTool: FunctionDeclaration = {
  name: 'set_user_profile',
  description: 'Sets the user profile after analyzing birth details. Call this when you have calculated the Sun Sign and Rashi.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "The user's name" },
      sunSign: { type: Type.STRING, description: "The calculated Sun Sign (e.g., Aries)" },
      rashi: { type: Type.STRING, description: "The corresponding Hindi Rashi name (e.g., Mesha)" }
    },
    required: ['name', 'sunSign', 'rashi']
  }
};

const startAnalysisTool: FunctionDeclaration = {
  name: 'start_analysis',
  description: 'Triggers the visual analysis animation. Call this immediately after the user provides their birth details, before you calculate the result.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  }
};

export const LiveSession: React.FC<LiveSessionProps> = ({ datingMode, isAnalyzing, onEndSession, setTalkingState, setAnalyzingState }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const cleanup = useCallback(() => {
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => {
            if (session && typeof session.close === 'function') {
                session.close();
            }
        }).catch(() => {});
        sessionPromiseRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      inputAudioContextRef.current.close();
    }
    inputAudioContextRef.current = null;

    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      outputAudioContextRef.current.close();
    }
    outputAudioContextRef.current = null;

    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    sourcesRef.current.clear();
    setIsConnected(false);
    setTalkingState(false);
    setAnalyzingState(false);
    setIsPaused(false);
  }, [setTalkingState, setAnalyzingState]);

  const initSession = useCallback(async () => {
    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key not found in environment.");

      const ai = new GoogleGenAI({ apiKey });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;

      const outputNode = outputCtx.createGain();
      outputNode.connect(outputCtx.destination);

      // Get User Media (Audio ONLY - fixes blocking issues)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const systemInstruction = `
        You are 'Astro Buddy', a friendly, mystical, and supportive astrology companion. 
        Your goal is to guide the user through the '${datingMode}' portal.
        
        STRICT CONVERSATION FLOW:
        1. When the session starts or the user says Hello, ask for their NAME immediately.
        2. Once they give their name, greet them warmly by name and IMMEDIATELY ask for their BIRTH DETAILS (Date, Time, and Place of birth).
        3. Wait for the user to provide the details.
        4. CRITICAL: When you receive the birth details, FIRST call 'start_analysis'. Say something like "Consulting the stars..."
        5. Pause for a brief moment, then calculate their Sun Sign and Hindi Rashi.
        6. Call 'set_user_profile' with their Name, Sun Sign, and Rashi.
        7. Announce their sign CLEARLY and CONCISELY ONE TIME. Say "You are a [Sun Sign], known as [Rashi] in Vedic astrology." Do NOT repeat the sign name multiple times.
        8. Invite them to ask a question related to ${datingMode} or their life.
        
        TONE: Casual, Best Friend, Mystical.
      `;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: systemInstruction,
          tools: [{ functionDeclarations: [setProfileTool, startAnalysisTool] }],
          outputAudioTranscription: {} 
        },
        callbacks: {
          onopen: () => {
            console.log("Session Opened");
            setIsConnected(true);
            
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (e) => {
                 if (inputCtx.state === 'suspended' && !isPaused) inputCtx.resume();
                 if (isMuted || isPaused) return;

                 const inputData = e.inputBuffer.getChannelData(0);
                 const l = inputData.length;
                 const int16 = new Int16Array(l);
                 for (let i = 0; i < l; i++) {
                   int16[i] = inputData[i] * 32768;
                 }
                 const bytes = new Uint8Array(int16.buffer);
                 let binary = '';
                 const len = bytes.byteLength;
                 for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                 }
                 const base64Data = btoa(binary);

                 sessionPromise.then(session => {
                    session.sendRealtimeInput({
                        media: {
                            mimeType: 'audio/pcm;rate=16000',
                            data: base64Data
                        }
                    });
                 });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
             if (message.toolCall) {
               const responses = [];
               for (const fc of message.toolCall.functionCalls) {
                 if (fc.name === 'set_user_profile') {
                    const args = fc.args as any;
                    setUserProfile({
                      name: args.name,
                      sunSign: args.sunSign,
                      rashi: args.rashi
                    });
                    setAnalyzingState(false); 
                    responses.push({
                      id: fc.id, name: fc.name, response: { result: "Profile set." }
                    });
                 } else if (fc.name === 'start_analysis') {
                    setAnalyzingState(true);
                    responses.push({
                      id: fc.id, name: fc.name, response: { result: "Animation started." }
                    });
                 }
               }
               if (responses.length > 0) {
                 sessionPromise.then(session => session.sendToolResponse({ functionResponses: responses }));
               }
             }

             const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
             if (base64Audio) {
                setTalkingState(true);
                const ctx = outputAudioContextRef.current;
                if (ctx) {
                  const audioBytes = decode(base64Audio);
                  const audioBuffer = await decodeAudioData(audioBytes, ctx, 24000, 1);
                  nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                  const source = ctx.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(outputNode);
                  source.addEventListener('ended', () => {
                     sourcesRef.current.delete(source);
                     if (sourcesRef.current.size === 0) setTalkingState(false);
                  });
                  source.start(nextStartTimeRef.current);
                  nextStartTimeRef.current += audioBuffer.duration;
                  sourcesRef.current.add(source);
                }
             }
             
             if (message.serverContent?.outputTranscription) {
                const text = message.serverContent.outputTranscription.text;
                setTranscript(prev => (prev.length > 200 ? text : prev + text));
             }
             if (message.serverContent?.turnComplete) {
                setTimeout(() => setTranscript(""), 6000);
             }

             if (message.serverContent?.interrupted) {
                 sourcesRef.current.forEach(s => s.stop());
                 sourcesRef.current.clear();
                 nextStartTimeRef.current = 0;
                 setTalkingState(false);
                 setAnalyzingState(false);
                 setTranscript("");
             }
          },
          onclose: () => cleanup(),
          onerror: (err) => {
            console.error(err);
            setError("Connection disrupted.");
            cleanup();
          }
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to initialize");
    }
  }, [datingMode, setTalkingState, setAnalyzingState, isMuted, isPaused]);

  useEffect(() => {
    initSession();
    return () => cleanup();
  }, []);

  const toggleMute = () => {
      setIsMuted(!isMuted);
  };

  const togglePause = () => {
      const inputCtx = inputAudioContextRef.current;
      const outputCtx = outputAudioContextRef.current;

      if (!isPaused) {
          // Pause logic
          if (inputCtx && inputCtx.state === 'running') inputCtx.suspend();
          if (outputCtx && outputCtx.state === 'running') outputCtx.suspend();
          setIsPaused(true);
      } else {
          // Resume logic
          if (inputCtx && inputCtx.state === 'suspended') inputCtx.resume();
          if (outputCtx && outputCtx.state === 'suspended') outputCtx.resume();
          setIsPaused(false);
      }
  };

  const sendTextMessage = (text: string) => {
    if (sessionPromiseRef.current) {
        sessionPromiseRef.current.then(session => {
             // Use generic send for client content to simulate user input
             if (typeof session.send === 'function') {
                 session.send({
                     clientContent: {
                         turns: [{ role: 'user', parts: [{ text }] }],
                         turnComplete: true
                     }
                 });
             }
        });
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-between p-6 pointer-events-none">
      
      {/* Decorative Border Frame */}
      <div className="absolute inset-4 border border-white/10 rounded-3xl pointer-events-none">
         <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-astro-gold rounded-tl-xl opacity-60"></div>
         <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-astro-gold rounded-tr-xl opacity-60"></div>
         <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-astro-gold rounded-bl-xl opacity-60"></div>
         <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-astro-gold rounded-br-xl opacity-60"></div>
      </div>

      {/* Error Overlay */}
      {error && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md pointer-events-auto">
              <div className="bg-red-900/50 p-6 rounded-2xl border border-red-500/50 text-center max-w-md mx-4">
                  <h3 className="text-xl font-mystical text-red-200 mb-2">Connection Error</h3>
                  <p className="text-white/80">{error}</p>
                  <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-white text-sm font-bold uppercase tracking-wide">
                      Retry
                  </button>
              </div>
          </div>
      )}

      {/* Top Bar */}
      <div className="flex justify-between items-start pointer-events-auto z-30 animate-fade-in">
        <div className="flex items-center gap-3 bg-black/60 backdrop-blur-xl px-5 py-2 rounded-full border border-white/20 shadow-lg">
           <Radio size={16} className={isConnected && !isPaused ? "text-astro-gold animate-pulse" : "text-gray-400"} />
           <span className="text-sm font-bold tracking-wide text-white font-sans uppercase">
              {isPaused ? "Session Paused" : (isConnected ? "Live Connection" : "Initializing...")}
           </span>
        </div>
      </div>

      {/* Center Content */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-lg pointer-events-none z-20">
        
        {/* Paused State Overlay */}
        {isPaused && (
            <div className="flex flex-col items-center justify-center animate-fade-in backdrop-blur-md bg-black/60 p-8 rounded-3xl border border-white/10 shadow-2xl">
                <Pause size={48} className="text-white/80 mb-4" />
                <h3 className="text-2xl font-mystical text-white tracking-widest uppercase">Paused</h3>
            </div>
        )}

        {/* Analysis Loader */}
        {isAnalyzing && !isPaused && (
            <div className="flex flex-col items-center justify-center animate-fade-in">
                <div className="relative mb-8">
                    <Loader2 size={80} className="text-indigo-400 animate-spin opacity-50" />
                    <div className="absolute inset-0 flex items-center justify-center animate-pulse-slow">
                        <Sparkles size={32} className="text-astro-gold" />
                    </div>
                </div>
                <h3 className="text-2xl font-mystical text-astro-gold tracking-[0.2em] uppercase text-shadow-glow bg-black/40 px-6 py-2 rounded-full backdrop-blur-md border border-astro-gold/20">Reading the Stars...</h3>
            </div>
        )}

        {/* User Profile Card */}
        {userProfile && !isAnalyzing && !isPaused && (
           <div className="bg-slate-950/80 backdrop-blur-xl border border-white/20 p-8 rounded-3xl shadow-2xl animate-scale-in text-center transform transition-all duration-500 hover:border-astro-gold/30">
              <div className="inline-block p-4 rounded-full bg-gradient-to-br from-indigo-900 to-purple-900 mb-6 shadow-lg shadow-purple-900/40 border border-white/10 animate-fade-in-up">
                <Sparkles size={32} className="text-astro-gold" />
              </div>
              <h2 className="text-4xl font-mystical text-white mb-2 animate-fade-in-up drop-shadow-lg" style={{animationDelay: '0.1s'}}>{userProfile.name}</h2>
              <div className="h-px w-32 bg-gradient-to-r from-transparent via-astro-gold to-transparent mx-auto my-4 opacity-50" />
              <div className="grid grid-cols-2 gap-4 mt-6 animate-fade-in-up" style={{animationDelay: '0.2s'}}>
                  <div className="bg-black/50 rounded-2xl p-4 border border-white/10">
                      <p className="text-xs text-indigo-300 font-sans uppercase tracking-widest mb-1">Sun Sign</p>
                      <p className="text-2xl font-mystical text-white">{userProfile.sunSign}</p>
                  </div>
                  <div className="bg-black/50 rounded-2xl p-4 border border-white/10">
                      <p className="text-xs text-purple-300 font-sans uppercase tracking-widest mb-1">Rashi</p>
                      <p className="text-2xl font-mystical text-white">{userProfile.rashi}</p>
                  </div>
              </div>
           </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto pointer-events-auto z-30 mb-8">
        
        {/* Transcript with better readability */}
        {transcript && !isPaused && (
          <div className="bg-black/70 backdrop-blur-xl px-8 py-6 rounded-2xl border border-white/10 text-center shadow-xl animate-fade-in-up max-w-xl">
            <p className="text-lg text-white/90 font-sans font-medium leading-relaxed drop-shadow-md">
              "{transcript}"
            </p>
          </div>
        )}

        {/* Suggestion Chips */}
        {!transcript && !isAnalyzing && !isPaused && (
             <div className="flex gap-2 flex-wrap justify-center animate-fade-in">
                {["Tell me about my love life", "What is my rising sign?", "Compatibility check?"].map((q, i) => (
                    <button 
                        key={i} 
                        onClick={() => sendTextMessage(q)}
                        className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-white/60 uppercase tracking-wider hover:bg-white/10 hover:scale-105 hover:border-astro-gold/30 cursor-pointer transition-all duration-300"
                    >
                        {q}
                    </button>
                ))}
             </div>
        )}

        <div className="flex items-center gap-6 animate-fade-in-up" style={{animationDelay: '0.3s'}}>
            
            <button
                onClick={() => { cleanup(); onEndSession(); }}
                className="p-4 rounded-full bg-red-500/20 border border-red-500/30 text-red-200 hover:bg-red-500/30 hover:scale-105 transition-all backdrop-blur-md"
                title="End Session"
            >
               <PhoneOff size={24} />
            </button>

            {/* Mic Button */}
            <div className="relative">
                <div className={`absolute inset-0 bg-astro-gold rounded-full blur-xl opacity-20 transition-all duration-300 ${!isMuted && !isPaused ? 'scale-150 animate-pulse' : 'scale-100 opacity-0'}`} />
                <button
                onClick={toggleMute}
                disabled={isPaused}
                className={`relative z-10 p-6 rounded-full transition-all duration-300 shadow-2xl border-2 ${
                    isMuted || isPaused
                    ? 'bg-slate-800 border-slate-600 text-slate-400' 
                    : 'bg-gradient-to-br from-indigo-600 to-purple-700 border-indigo-300 text-white hover:scale-105 hover:shadow-[0_0_20px_rgba(79,70,229,0.5)]'
                }`}
                >
                {isMuted ? <MicOff size={32} /> : <Mic size={32} />}
                </button>
            </div>

            <button
                onClick={togglePause}
                className="p-4 rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:scale-105 transition-all backdrop-blur-md"
                title={isPaused ? "Resume Session" : "Pause Session"}
            >
                {isPaused ? <Play size={24} fill="currentColor" /> : <Pause size={24} fill="currentColor" />}
            </button>
        </div>
      </div>
    </div>
  );
};