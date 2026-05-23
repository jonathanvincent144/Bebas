import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, VolumeX, HelpCircle, CornerDownLeft, Play, AlertCircle, CheckCircle2 } from 'lucide-react';
import { VoiceCommandStatus } from '../types';

interface VoicePanelProps {
  onExecuteCommand: (command: string) => { success: boolean; feedback: string };
  isVariasiRunning: boolean;
}

export default function VoicePanel({ onExecuteCommand, isVariasiRunning }: VoicePanelProps) {
  const [status, setStatus] = useState<VoiceCommandStatus>({
    state: 'idle',
    transcript: '',
    feedbackText: 'Klik tombol mikrofon dan katakan perintah Anda (misal: "Nyalakan Relay 1").'
  });
  
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(true);
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [manualCommand, setManualCommand] = useState<string>('');
  const [recentCommands, setRecentCommands] = useState<Array<{ text: string; success: boolean; time: string }>>([]);
  
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check speech recognition support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'id-ID'; // Focus on Indonesian command structure
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setStatus(prev => ({
        ...prev,
        state: 'listening',
        transcript: 'Mendengarkan...',
        feedbackText: 'Katakan perintah kontrol Anda sekarang...'
      }));
    };

    recognition.onresult = (event: any) => {
      const result = event.results[0][0].transcript;
      const confidence = event.results[0][0].confidence;
      
      setStatus(prev => ({
        ...prev,
        state: 'speaking',
        transcript: `"${result}"`
      }));

      handleCommandMatch(result);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      let errorMsg = 'Gagal mendengar suara dengan jelas. Silakan coba lagi.';
      if (event.error === 'not-allowed') {
        errorMsg = 'Akses mikrofon ditolak! Izinkan mikrofon di browser Anda lalu coba kembali.';
      } else if (event.error === 'no-speech') {
        errorMsg = 'Tidak terdengar suara. Silakan bicara lebih dekat ke mikrofon.';
      }
      
      setStatus(prev => ({
        ...prev,
        state: 'error',
        feedbackText: errorMsg
      }));
      speakText(errorMsg);
    };

    recognition.onend = () => {
      setStatus(prev => {
        if (prev.state === 'listening') {
          return { ...prev, state: 'idle', transcript: '' };
        }
        return prev;
      });
    };

    recognitionRef.current = recognition;
  }, [ttsEnabled]);

  const toggleListening = () => {
    if (!isSupported) return;
    
    if (status.state === 'listening') {
      recognitionRef.current?.stop();
    } else {
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.warn('Recognition already started:', e);
      }
    }
  };

  // Speaks out response text
  const speakText = (text: string) => {
    if (!ttsEnabled) return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    
    // Stop ongoing speech
    synth.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID'; // Indonesian voice
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    
    // Try to find an Indonesian voice
    const voices = synth.getVoices();
    const indonesianVoice = voices.find(v => v.lang.includes('ID') || v.lang.includes('id'));
    if (indonesianVoice) {
      utterance.voice = indonesianVoice;
    }
    
    synth.speak(utterance);
  };

  // Match voice input against commands list
  const handleCommandMatch = (rawText: string) => {
    // Process string
    const result = onExecuteCommand(rawText);
    
    // Log history
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);
    setRecentCommands(prev => [
      { text: rawText, success: result.success, time: timeStr },
      ...prev.slice(0, 4)
    ]);

    if (result.success) {
      setStatus(prev => ({
        ...prev,
        state: 'success',
        feedbackText: result.feedback
      }));
      speakText(result.feedback);
    } else {
      setStatus(prev => ({
        ...prev,
        state: 'error',
        feedbackText: result.feedback
      }));
      speakText(result.feedback);
    }

    // Return to idle state after 4 seconds
    setTimeout(() => {
      setStatus(prev => {
        if (prev.state === 'success' || prev.state === 'error') {
          return {
            ...prev,
            state: 'idle',
            transcript: '',
            feedbackText: 'Klik tombol mikrofon dan katakan perintah Anda (misal: "Nyalakan Relay 1").'
          };
        }
        return prev;
      });
    }, 4000);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCommand.trim()) return;
    
    setStatus(prev => ({
      ...prev,
      state: 'speaking',
      transcript: `⌨️ "${manualCommand.trim()}"`
    }));
    
    handleCommandMatch(manualCommand.trim());
    setManualCommand('');
  };

  const listManualCommandTrigger = (cmd: string) => {
    setStatus(prev => ({
      ...prev,
      state: 'speaking',
      transcript: `"${cmd}"`
    }));
    handleCommandMatch(cmd);
  };

  const commandShortcuts = [
    { title: "R1 ON", text: "Nyalakan r1" },
    { title: "R1 OFF", text: "Matikan r1" },
    { title: "ALL ON", text: "Nyalakan semua" },
    { title: "ALL OFF", text: "Matikan semua" },
    { title: "CEK STATUS", text: "Status" },
    { title: "Suhu & Humid", text: "Suhu" },
  ];

  return (
    <div className="bg-[#15171C] rounded-3xl border border-[#282C34] p-6 shadow-xl" id="voice-control-panel">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Perintah Suara (Voice Command)</h2>
          <p className="text-xs text-slate-400 mt-0.5 font-mono">Kontrol relay & cek suhu dengan suara Bahasa Indonesia secara interaktif</p>
        </div>
        
        {/* TTS Toggle */}
        <button
          onClick={() => setTtsEnabled(!ttsEnabled)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold select-none cursor-pointer transition-all duration-200 ${
            ttsEnabled 
              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-sm' 
              : 'bg-[#282C34] text-slate-400 border-[#3A4150]'
          }`}
          title={ttsEnabled ? "Matikan Suara Balasan (TTS)" : "Aktifkan Suara Balasan (TTS)"}
        >
          {ttsEnabled ? <Volume2 className="w-4 h-4 animate-bounce" /> : <VolumeX className="w-4 h-4" />}
          {ttsEnabled ? "Audio ON" : "Mute"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Mic Activation Area */}
        <div className="md:col-span-5 flex flex-col items-center justify-center p-6 bg-[#0B0C0E]/50 rounded-2xl border border-[#282C34]/60 relative overflow-hidden min-h-[220px]">
          {/* Neon ripple behind mic */}
          {status.state === 'listening' && (
            <>
              <div className="absolute inset-0 bg-rose-500/5 animate-pulse rounded-2xl" />
              <span className="absolute w-32 h-32 rounded-full border border-rose-500/25 animate-ping duration-1000" />
              <span className="absolute w-40 h-40 rounded-full border border-rose-500/15 animate-ping duration-1500 delay-300" />
            </>
          )}

          {/* Microphone button */}
          <button
            onClick={toggleListening}
            disabled={!isSupported || isVariasiRunning}
            className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 transform select-none cursor-pointer ${
              !isSupported 
                ? 'bg-[#282C34] text-slate-500 cursor-not-allowed border border-[#3A4150]' :
              isVariasiRunning
                ? 'bg-amber-500/10 text-amber-500 cursor-not-allowed border border-amber-500/20' :
              status.state === 'listening'
                ? 'bg-rose-500 text-white scale-110 border border-rose-400 animate-pulse' :
              status.state === 'speaking'
                ? 'bg-indigo-600 text-white scale-105 border border-indigo-500' :
              status.state === 'success'
                ? 'bg-emerald-600 text-white' :
              'bg-[#282C34] text-slate-100 hover:bg-[#323945] hover:scale-105 border border-[#3A4150]'
            }`}
          >
            {status.state === 'listening' ? (
              <Mic className="w-9 h-9 animate-bounce" />
            ) : !isSupported ? (
              <MicOff className="w-9 h-9" />
            ) : (
              <Mic className="w-9 h-9" />
            )}
          </button>

          {/* Current State Text */}
          <div className="text-center mt-5 z-10">
            <p className={`text-xs font-semibold uppercase font-mono tracking-wider ${
              status.state === 'listening' ? 'text-rose-400 animate-pulse' :
              status.state === 'speaking' ? 'text-indigo-400' :
              status.state === 'success' ? 'text-emerald-400' :
              status.state === 'error' ? 'text-rose-400 font-bold' :
              'text-slate-400'
            }`}>
              {status.state === 'listening' ? 'Mendengarkan Sinyal Suara...' :
               status.state === 'speaking' ? 'Menganalisis Perintah...' :
               status.state === 'success' ? 'Hasil Berhasil Dieksekusi!' :
               status.state === 'error' ? 'Kesalahan Input!' :
               isVariasiRunning ? 'Tunggu Variasi Selesai' : 'Siap Menerima Perintah'}
            </p>
            {status.transcript && (
              <p className="text-xs font-bold text-white mt-2 bg-[#15171C]/90 backdrop-blur-xs px-3 py-1 rounded-full border border-[#282C34]/80 inline-block shadow-md">
                {status.transcript}
              </p>
            )}
          </div>

          {!isSupported && (
            <div className="absolute inset-0 bg-[#15171C]/95 flex flex-col items-center justify-center p-4 text-center z-20">
              <AlertCircle className="w-8 h-8 text-amber-500 mb-2" />
              <p className="text-xs font-bold text-white">Browser Tidak Mendukung Mic API</p>
              <p className="text-xxs text-slate-450 mt-1 max-w-[180px]">
                Fitur suara memerlukan Chrome, Edge, atau Safari. Silakan ketik perintah secara manual di bawah.
              </p>
            </div>
          )}
        </div>

        {/* Info & Transcript Response Area */}
        <div className="md:col-span-7 flex flex-col justify-between">
          <div className="bg-[#0B0C0E]/40 p-4 rounded-2xl border border-[#282C34] flex-1 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">Respon Bot</span>
              <p className={`text-sm mt-1.5 font-medium leading-relaxed ${
                status.state === 'success' ? 'text-emerald-400 font-semibold' :
                status.state === 'error' ? 'text-rose-400 font-semibold' :
                'text-slate-300'
              }`}>
                {status.feedbackText}
              </p>
            </div>

            {/* List of shortcuts */}
            <div className="mt-4">
              <span className="text-[10px] font-mono tracking-wider text-slate-500 uppercase block mb-1.5">Klik Cepat Perintah:</span>
              <div className="flex flex-wrap gap-1.5">
                {commandShortcuts.map((sc, i) => (
                  <button
                    key={i}
                    onClick={() => listManualCommandTrigger(sc.text)}
                    disabled={isVariasiRunning}
                    className="text-xxs bg-[#282C34] text-slate-300 font-semibold px-2 py-1.5 rounded-lg border border-[#3A4150] hover:bg-[#323945] hover:text-white transition-all cursor-pointer disabled:opacity-50"
                  >
                    {sc.title}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Manual Input Fallback */}
          <form onSubmit={handleManualSubmit} className="mt-4 flex gap-2">
            <input
              type="text"
              value={manualCommand}
              onChange={(e) => setManualCommand(e.target.value)}
              placeholder="Masukan perintah manual... (e.g. 'all off', 'v1')"
              className="flex-1 text-sm bg-[#0B0C0E]/50 border border-[#282C34] focus:border-[#3A4150] rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder:text-slate-500 text-white"
            />
            <button
              type="submit"
              disabled={!manualCommand.trim()}
              className="p-2.5 rounded-xl bg-[#282C34] hover:bg-[#343A46] border border-[#3A4150] text-slate-100 transition-colors cursor-pointer disabled:bg-slate-800 disabled:text-slate-600"
            >
              <CornerDownLeft className="w-5 h-5" />
            </button>
          </form>
        </div>

      </div>

      {/* Recent commands log */}
      {recentCommands.length > 0 && (
        <div className="mt-5 border-t border-[#282C34] pt-4" id="voice-history">
          <span className="text-[10px] font-mono tracking-wider text-slate-500 uppercase block mb-2">Riwayat Perintah:</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xxs">
            {recentCommands.map((rc, idx) => (
              <div key={idx} className="flex items-center justify-between bg-[#0B0C0E]/30 p-2 rounded-xl border border-[#282C34]">
                <div className="flex items-center gap-2 overflow-hidden mr-2">
                  {rc.success ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-450 shrink-0" />
                  )}
                  <span className="font-semibold text-slate-300 truncate font-mono">"{rc.text}"</span>
                </div>
                <span className="text-slate-500 font-mono shrink-0">{rc.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Panduan Perintah Modal Trigger */}
      <div className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-400 bg-[#1A1C23] p-3 rounded-2xl border border-[#282C34]">
        <HelpCircle className="w-4 h-4 text-slate-500 shrink-0" />
        <div>
          <span className="text-slate-300 font-bold font-mono">Dukungan Bahasa:</span> Aturan perintah responsif dikoordinasikan menggunakan kata kunci: 
          <span className="font-bold text-rose-400"> "on", "off" </span>(aktifkan/matikan) + target name / pin. Contoh: <span className="italic text-slate-300">"Relay satu hidup"</span>, <span className="italic text-slate-300">"Matikan semua"</span>, <span className="italic text-slate-300">"Panggil variasi dua"</span>.
        </div>
      </div>
    </div>
  );
}
