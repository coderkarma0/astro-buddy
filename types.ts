export enum DatingMode {
  SOULMATE = 'Soulmate Search',
  CASUAL = 'Stellar Fling',
  FRIENDSHIP = 'Cosmic Friendship',
  UNDECIDED = 'General Guidance'
}

export interface DatingPortal {
  id: DatingMode;
  title: string;
  description: string;
  color: string;
}

export interface UserProfile {
  name: string;
  sunSign: string;
  rashi: string; // Hindi name
  birthDate?: string;
}

export interface AudioVisualizerState {
  isTalking: boolean;
  volume: number;
}