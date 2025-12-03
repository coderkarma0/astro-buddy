import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { DatingMode, UserProfile } from '../types';
import { Mic, MicOff, PhoneOff, Radio, Sparkles, Loader2 } from 'lucide-react';

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

// Tool Definitions
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
  const [transcript, setTranscript] = useState<string>("");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Refs for cleanup
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
    
    // Fix: Check state before closing to avoid "Cannot close a closed AudioContext"
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

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const systemInstruction = `
        You are 'Astro Buddy', a friendly, mystical, and supportive astrology companion. 
        Your goal is to guide the user through the '${datingMode}' portal.
        
        STRICT CONVERSATION FLOW:
        1. When the session starts or the user says Hello, ask for their NAME immediately.
        2. Once they give their name, greet them warmly by name (e.g., "Hi [Name]! It's written in the stars that we meet.") and IMMEDIATELY ask for their BIRTH DETAILS (Date, Time, and Place of birth) to align their stars.
        3. Wait for the user to provide the details.
        4. CRITICAL STEP: When you receive the birth details, FIRST call the tool 'start_analysis' to trigger the analysis animation. Say something like "Hmm, let me read the celestial map for you..."
        5. Pause for a brief moment (simulated), then calculate their Sun Sign and the corresponding Hindi Rashi.
        6. Call the tool 'set_user_profile' with their Name, Sun Sign, and Rashi.
        7. After the tool call, verbally announce their sign with excitement (e.g., "Ah! You are a Leo, the Simha rashi! That explains your radiance.").
        8. Then, invite them to ask a question related to ${datingMode} or their life.
        
        TONE:
        - Casual, like a best friend.
        - Use emojis in your voice (warmth, chuckles).
        - Keep responses concise but insightful.
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
                 if (inputCtx.state === 'suspended') inputCtx.resume();
                 if (isMuted) return;

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
             // 1. Handle Tool Calls
             if (message.toolCall) {
               console.log("Tool call received", message.toolCall);
               const responses = [];
               for (const fc of message.toolCall.functionCalls) {
                 if (fc.name === 'set_user_profile') {
                    const args = fc.args as any;
                    setUserProfile({
                      name: args.name,
                      sunSign: args.sunSign,
                      rashi: args.rashi
                    });
                    setAnalyzingState(false); // Stop analyzing
                    responses.push({
                      id: fc.id,
                      name: fc.name,
                      response: { result: "Profile set successfully on UI." }
                    });
                 } else if (fc.name === 'start_analysis') {
                    setAnalyzingState(true); // Start animation
                    responses.push({
                      id: fc.id,
                      name: fc.name,
                      response: { result: "Animation started." }
                    });
                 }
               }
               
               // Send Tool Response
               if (responses.length > 0) {
                 sessionPromise.then(session => {
                   session.sendToolResponse({
                     functionResponses: responses
                   });
                 });
               }
             }

             // 2. Handle Audio Output
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
             
             // 3. Handle Text Transcription (Subtitles)
             if (message.serverContent?.outputTranscription) {
                const text = message.serverContent.outputTranscription.text;
                setTranscript(prev => {
                    if (prev.length > 200) return text; 
                    return prev + text;
                });
             }
             // Handle turn complete
             if (message.serverContent?.turnComplete) {
                setTimeout(() => setTranscript(""), 5000); // Fade out after 5s
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
          onclose: () => {
            setIsConnected(false);
            setTalkingState(false);
            setAnalyzingState(false);
          },
          onerror: (err) => {
            console.error(err);
            setError("Connection disrupted.");
            setTalkingState(false);
            setAnalyzingState(false);
          }
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err: any) {
      setError(err.message || "Failed to initialize");
    }
  }, [datingMode, setTalkingState, setAnalyzingState, isMuted]);

  useEffect(() => {
    initSession();
    return () => cleanup();
  }, []);

  const toggleMute = () => {
      if (inputAudioContextRef.current) {
          if (isMuted) inputAudioContextRef.current.resume();
          else inputAudioContextRef.current.suspend();
      }
      setIsMuted(!isMuted);
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-between p-6 pointer-events-none">
      
      {/* Top Bar: Connection & Mode */}
      <div className="flex justify-between items-start pointer-events-auto animate-fade-in">
        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 transition-all duration-300">
           <Radio size={16} className={isConnected ? "text-green-400 animate-pulse" : "text-gray-400"} />
           <span className="text-sm font-medium text-white/80">
              {isConnected ? "Astro Buddy Connected" : "Connecting..."}
           </span>
        </div>
        <button
          onClick={() => { cleanup(); onEndSession(); }}
          className="p-3 rounded-full bg-red-500/20 hover:bg-red-500/40 backdrop-blur-md border border-red-500/30 text-red-200 transition-all hover:scale-105"
        >
          <PhoneOff size={20} />
        </button>
      </div>

      {/* Center: Profile Card OR Analysis Loader */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-md pointer-events-none">
        
        {/* Analysis Loader Overlay */}
        {isAnalyzing && (
            <div className="flex flex-col items-center justify-center animate-fade-in">
                <div className="relative mb-6">
                    <Loader2 size={64} className="text-indigo-400 animate-spin" />
                    <Sparkles size={24} className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-yellow-300 animate-pulse" />
                </div>
                <h3 className="text-2xl font-light text-white tracking-widest uppercase animate-pulse-slow">Reading the Stars...</h3>
                <p className="text-white/50 text-sm mt-2">Aligning birth charts</p>
            </div>
        )}

        {/* User Profile Card */}
        {userProfile && !isAnalyzing && (
           <div className="bg-white/5 backdrop-blur-xl border border-white/20 p-6 rounded-3xl shadow-2xl animate-scale-in text-center transform transition-transform duration-500 hover:scale-105">
              <div className="inline-block p-4 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 mb-4 shadow-lg shadow-purple-500/30 animate-fade-in-up" style={{animationDelay: '0.2s'}}>
                <Sparkles size={32} className="text-white" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-1 animate-fade-in-up" style={{animationDelay: '0.3s'}}>{userProfile.name}</h2>
              <div className="h-px w-24 bg-white/20 mx-auto my-3" />
              <div className="grid grid-cols-2 gap-4 mt-4 animate-fade-in-up" style={{animationDelay: '0.4s'}}>
                  <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                      <p className="text-xs text-indigo-200 uppercase tracking-wider mb-1">Sun Sign</p>
                      <p className="text-xl font-semibold text-white">{userProfile.sunSign}</p>
                  </div>
                  <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                      <p className="text-xs text-purple-200 uppercase tracking-wider mb-1">Rashi</p>
                      <p className="text-xl font-semibold text-white">{userProfile.rashi}</p>
                  </div>
              </div>
           </div>
        )}
      </div>

      {/* Bottom Area: Controls & Transcript */}
      <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto pointer-events-auto">
        
        {/* Transcript Bubble */}
        {transcript && (
          <div className="bg-black/60 backdrop-blur-lg px-6 py-4 rounded-2xl border border-white/10 text-center shadow-xl animate-fade-in-up">
            <p className="text-lg text-white font-light leading-relaxed">
              "{transcript}"
            </p>
          </div>
        )}

        {/* Mic Control */}
        <div className="relative animate-fade-in-up" style={{animationDelay: '0.5s'}}>
            {/* Visual Ripple for Mic */}
            <div className={`absolute inset-0 bg-indigo-500 rounded-full blur-xl opacity-20 transition-all duration-300 ${!isMuted ? 'scale-150 animate-pulse' : 'scale-100 opacity-0'}`} />
            
            <button
              onClick={toggleMute}
              className={`relative z-10 p-6 rounded-full transition-all duration-300 shadow-2xl border ${
                isMuted 
                  ? 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700' 
                  : 'bg-indigo-600 border-indigo-400 text-white hover:bg-indigo-500 hover:scale-110'
              }`}
            >
              {isMuted ? <MicOff size={32} /> : <Mic size={32} />}
            </button>
        </div>
        
        <p className="text-white/30 text-sm font-light tracking-wide animate-fade-in" style={{animationDelay: '0.6s'}}>
            {isMuted ? "Tap to speak" : "Listening..."}
        </p>
      </div>
    </div>
  );
};