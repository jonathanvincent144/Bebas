export interface RelayInfo {
  id: number;
  pin: number;
  name: string;
  state: boolean;
}

export interface SensorReading {
  timestamp: number;
  time: string;
  suhu: number;      // Temperature in Celsius
  kelembapan: number;  // Humidity in %
}

export type ControlMode = 'simulation' | 'direct';

export interface VoiceCommandStatus {
  state: 'idle' | 'listening' | 'speaking' | 'success' | 'error';
  transcript: string;
  feedbackText: string;
}

export interface ConnectionState {
  status: 'connected' | 'disconnected' | 'connecting' | 'warning';
  message: string;
  latency?: number;
}
