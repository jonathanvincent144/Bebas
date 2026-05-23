import React, { useState, useEffect, useRef } from 'react';
import { 
  Power, Cpu, Wifi, WifiOff, RefreshCw, 
  Settings, Sliders, Thermometer, Droplets, 
  HelpCircle, AlertCircle, ShieldCheck, Play, 
  Mic, Sparkles, Code, Info, CheckCircle2, ChevronRight 
} from 'lucide-react';
import { RelayInfo, SensorReading, ControlMode, ConnectionState } from './types';
import RealTimeCharts from './components/RealTimeCharts';
import VoicePanel from './components/VoicePanel';

// Pre-populate sensor data history with smooth curves
const generateInitialHistory = (): SensorReading[] => {
  const points: SensorReading[] = [];
  const now = Date.now();
  // Generate 12 historical points spaced 5 seconds path
  for (let i = 11; i >= 0; i--) {
    const timestamp = now - i * 5000;
    const dateObj = new Date(timestamp);
    const timeStr = dateObj.toTimeString().split(' ')[0].substring(3, 8); // MM:SS
    
    // Clean sin waves for aesthetic start curves in charts
    points.push({
      timestamp,
      time: timeStr,
      suhu: 26.8 + Math.sin((11 - i) * 0.4) * 0.7 + Math.random() * 0.15,
      kelembapan: 64.2 + Math.cos((11 - i) * 0.3) * 1.8 + Math.random() * 0.4
    });
  }
  return points;
};

// Help helper to fetch with standard AbortController timeout
async function fetchWithTimeout(resource: string, options: any = {}) {
  const { timeout = 2500 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export default function App() {
  // Modes & IP Setup
  const [mode, setMode] = useState<ControlMode>(() => {
    return (localStorage.getItem('esp32_control_mode') as ControlMode) || 'simulation';
  });
  const [espIp, setEspIp] = useState<string>(() => {
    return localStorage.getItem('esp32_ip') || '192.168.1.100';
  });
  const [inputIp, setInputIp] = useState<string>(espIp);

  // Relay configuration & custom name labels (Users can rename R1 to "Pompa Air", etc.)
  const [relays, setRelays] = useState<RelayInfo[]>(() => {
    const savedNames = localStorage.getItem('esp32_relay_names');
    const names = savedNames ? JSON.parse(savedNames) : ["Lampu Kamar", "Kipas Angin", "Pompa Air", "Lampu Teras"];
    
    return [
      { id: 0, pin: 5, name: names[0], state: false },
      { id: 1, pin: 19, name: names[1], state: false },
      { id: 2, pin: 18, name: names[2], state: false },
      { id: 3, pin: 23, name: names[3], state: false },
    ];
  });

  const [sensorHistory, setSensorHistory] = useState<SensorReading[]>(generateInitialHistory);
  const [connState, setConnState] = useState<ConnectionState>({
    status: 'connected',
    message: 'Mode simulasi aktif secara offline.'
  });
  
  const [isVariasiRunning, setIsVariasiRunning] = useState<number | null>(null);
  const [variasiProgress, setVariasiProgress] = useState<number>(0);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [pingLatency, setPingLatency] = useState<number | null>(null);

  // Auto-save settings in localstorage when changed
  useEffect(() => {
    localStorage.setItem('esp32_control_mode', mode);
  }, [mode]);

  useEffect(() => {
    const names = relays.map(r => r.name);
    localStorage.setItem('esp32_relay_names', JSON.stringify(names));
  }, [relays]);

  // Handle direct IP polling or simulated updates
  useEffect(() => {
    let pollingInterval: any = null;

    if (mode === 'direct') {
      // Set status to connecting initially
      setConnState({
        status: 'connecting',
        message: `Menghubungi ESP32 di IP: http://${espIp}...`
      });
      
      // Perform immediate status pull
      pullESP32Status();

      // Setup 5-second recurring poll
      pollingInterval = setInterval(() => {
        pullESP32Status();
      }, 5000);
    } else {
      // Simulation mode: Update values randomly every 5 seconds
      setConnState({
        status: 'connected',
        message: 'Mode demo aktif. Unit virtual beroperasi di memori.'
      });
      setPingLatency(null);

      pollingInterval = setInterval(() => {
        const now = Date.now();
        const timeStr = new Date(now).toTimeString().split(' ')[0].substring(3, 8); // MM:SS
        
        setSensorHistory(prev => {
          const lastPoint = prev[prev.length - 1] || { suhu: 27.2, kelembapan: 64.5 };
          // Fluctuate temp by max +/- 0.25 °C, humidity +/- 1.0 %
          const deltaTemp = (Math.random() - 0.5) * 0.4;
          const deltaHum = (Math.random() - 0.5) * 1.6;
          
          const newSuhu = Math.min(45, Math.max(16, lastPoint.suhu + deltaTemp));
          const newKelembapan = Math.min(100, Math.max(20, lastPoint.kelembapan + deltaHum));
          
          const updated = [...prev, {
            timestamp: now,
            time: timeStr,
            suhu: newSuhu,
            kelembapan: newKelembapan
          }];
          return updated.slice(-25); // Limit array capacity to 25
        });
      }, 5000);
    }

    return () => {
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [mode, espIp]);

  // Pull status from physical ESP32 card
  const pullESP32Status = async () => {
    if (isPolling) return;
    setIsPolling(true);
    const startTime = Date.now();
    try {
      const url = `http://${espIp}/api/status`;
      const response = await fetchWithTimeout(url, { timeout: 2000 });
      const data = await response.json();
      
      const latency = Date.now() - startTime;
      setPingLatency(latency);

      setConnState({
        status: 'connected',
        message: `Terhubung langsung ke ESP32 pada jaringan lokal (Latency: ${latency}ms)`,
        latency
      });

      // Map incoming relays
      if (data.relays && Array.isArray(data.relays)) {
        setRelays(prev => prev.map((r, idx) => ({
          ...r,
          state: data.relays[idx] !== undefined ? data.relays[idx] : r.state
        })));
      }

      // Add sensor reading
      const now = Date.now();
      const timeStr = new Date(now).toTimeString().split(' ')[0].substring(3, 8);
      setSensorHistory(prev => {
        const updated = [...prev, {
          timestamp: now,
          time: timeStr,
          suhu: data.suhu,
          kelembapan: data.kelembapan
        }];
        return updated.slice(-25);
      });
    } catch (err: any) {
      console.warn("REST API polling failed:", err);
      setPingLatency(null);
      setConnState({
        status: 'warning',
        message: 'Gagal terkoneksi ke ESP32 lokal. Periksa kecocokan Wi-Fi.'
      });
    } finally {
      setIsPolling(false);
    }
  };

  // Test direct connection manually
  const pingESP32 = async () => {
    setConnState({
      status: 'connecting',
      message: `Melakukan ping uji koneksi ke http://${inputIp}...`
    });
    const startTime = Date.now();
    try {
      const url = `http://${inputIp}/api/status`;
      const res = await fetchWithTimeout(url, { timeout: 2500 });
      if (res.ok) {
        const latency = Date.now() - startTime;
        setPingLatency(latency);
        setEspIp(inputIp);
        localStorage.setItem('esp32_ip', inputIp);
        setMode('direct');
        setConnState({
          status: 'connected',
          message: `Berhasil tersambung ke ESP32! IP diaktifkan. (Latency: ${latency}ms)`,
          latency
        });
      }
    } catch (err) {
      setPingLatency(null);
      setConnState({
        status: 'disconnected',
        message: `Sambungan diblokir atau timeout. Periksa apakah IP ${inputIp} sudah benar, ESP32 menyala, dan tersambung di Wi-Fi yang sama.`
      });
    }
  };

  // Turn relay name labels in local relays list
  const handleRenameRelay = (idx: number, newName: string) => {
    setRelays(prev => prev.map((r, i) => i === idx ? { ...r, name: newName } : r));
  };

  // Trigger individual relay toggle
  const toggleRelay = async (idx: number) => {
    const targetRelay = relays[idx];
    const targetState = !targetRelay.state;
    
    // Optmistically update local UI state immediately for responsive touch feel
    setRelays(prev => prev.map((r, i) => i === idx ? { ...r, state: targetState } : r));

    if (mode === 'direct') {
      try {
        const queryParam = `r${idx + 1}=${targetState ? 'on' : 'off'}`;
        const url = `http://${espIp}/api/control?${queryParam}`;
        const res = await fetchWithTimeout(url, { timeout: 2000 });
        const data = await res.json();
        
        // Confirm with actual hardware state from payload
        if (data.relays && Array.isArray(data.relays)) {
          setRelays(prev => prev.map((r, i) => ({
            ...r,
            state: data.relays[i] !== undefined ? data.relays[i] : r.state
          })));
        }
      } catch (err) {
        console.error("Direct control failed, reverting:", err);
        // Revert UI state on error to avoid false positives
        setRelays(prev => prev.map((r, i) => i === idx ? { ...r, state: !targetState } : r));
        setConnState({
          status: 'warning',
          message: `Relay gagal diganti. ESP32 terputus atau respon timeout.`
        });
      }
    }
  };

  // Master all relays command
  const setAllRelaysGlobal = async (state: boolean) => {
    // Optimistic UI change
    setRelays(prev => prev.map(r => ({ ...r, state })));

    if (mode === 'direct') {
      try {
        const url = `http://${espIp}/api/control?all=${state ? 'on' : 'off'}`;
        const res = await fetchWithTimeout(url, { timeout: 2000 });
        const data = await res.json();
        
        if (data.relays && Array.isArray(data.relays)) {
          setRelays(prev => prev.map((r, i) => ({ ...r, state: data.relays[i] })));
        }
      } catch (err) {
        console.error("All control failed:", err);
        pullESP32Status(); // Fetch correct status
      }
    }
  };

  // Run Relay Variations
  const triggerVariasi = async (vNumber: number) => {
    if (isVariasiRunning !== null) return;

    if (mode === 'direct') {
      setIsVariasiRunning(vNumber);
      try {
        // Direct REST command
        const url = `http://${espIp}/api/control?v=${vNumber}`;
        await fetchWithTimeout(url, { timeout: 6000 });
        
        // Direct confirmation delay then poll status
        setTimeout(() => {
          pullESP32Status();
          setIsVariasiRunning(null);
        }, 1500);
      } catch (err) {
        console.error("Variasi trig failed", err);
        setIsVariasiRunning(null);
      }
    } else {
      // Simulate variasi sequencing with beautiful physical clock
      setIsVariasiRunning(vNumber);
      setVariasiProgress(0);
      
      const onSeq = vNumber === 1 ? [0, 1, 2, 3] : [0, 2, 1, 3];
      const offSeq = vNumber === 1 ? [3, 2, 1, 0] : [3, 1, 2, 0];
      
      // Total 16 steps (2 cycles * 4 on * 4 off)
      const totalSteps = 16;
      let currentStep = 0;

      for (let cycle = 0; cycle < 2; cycle++) {
        // Sequentially TURN ON
        for (let step = 0; step < 4; step++) {
          const idx = onSeq[step];
          setRelays(prev => prev.map((r, j) => j === idx ? { ...r, state: true } : r));
          currentStep++;
          setVariasiProgress(Math.round((currentStep / totalSteps) * 100));
          await new Promise(r => setTimeout(r, 400));
        }
        // Sequentially TURN OFF
        for (let step = 0; step < 4; step++) {
          const idx = offSeq[step];
          setRelays(prev => prev.map((r, j) => j === idx ? { ...r, state: false } : r));
          currentStep++;
          setVariasiProgress(Math.round((currentStep / totalSteps) * 100));
          await new Promise(r => setTimeout(r, 400));
        }
      }
      setIsVariasiRunning(null);
      setVariasiProgress(0);
    }
  };
  // Master command parser from Voice Panel
  // Processes Indonesian words and outputs dynamic TTS responses
  const executeVoiceCommand = async (command: string): Promise<{ success: boolean; feedback: string; latency?: number }> => {
    const startTime = Date.now();
    const text = command.toLowerCase().trim();
    const l1 = relays[0].name.toLowerCase();
    const l2 = relays[1].name.toLowerCase();
    const l3 = relays[2].name.toLowerCase();
    const l4 = relays[3].name.toLowerCase();

    const getResult = (success: boolean, feedback: string) => ({
      success,
      feedback,
      latency: Date.now() - startTime
    });

    // 1. HELP OR MENU CHECK
    if (text === 'menu' || text === 'start' || text === 'bantuan') {
      return getResult(true, "Halo! Saya bot kontroler ESP32 Anda. Anda dapat mengontrol empat relay dengan perintah suara.");
    }

    // 1. STATUS CHECK
    if (text.includes('status') || text.includes('rele') || text.includes('relay')) {
      if (text.includes('cek status') || text === 'status' || text.includes('bagaimana status')) {
        const namesOn = relays.filter(r => r.state).map(r => r.name);
        if (namesOn.length === 0) {
          return getResult(true, "Seluruh relay saat ini dalam kondisi padam atau OFF.");
        }
        return getResult(true, `Saat ini terdapat ${namesOn.length} relay menyala, yaitu: ${namesOn.join(', ')}.`);
      }
    }

    // 2. TEMPERATURE AND HUMID CHECK
    if (text.includes('suhu') || text.includes('temperatur') || text.includes('kelembapan') || text.includes('dht') || text.includes('panas') || text.includes('dingin')) {
      const latestReading = sensorHistory[sensorHistory.length - 1];
      const temp = latestReading ? latestReading.suhu.toFixed(1) : "27";
      const hum = latestReading ? latestReading.kelembapan.toFixed(0) : "65";
      return getResult(true, `Suhu saat ini terdeteksi ${temp} derajat Celsius dengan kelembapan udara ${hum} persen.`);
    }

    // 3. MASTER ALL COMMANDS
    if (text.includes('semua') || text.includes('all')) {
      if (text.includes('nyala') || text.includes('hidup') || text.includes('aktif') || text.includes('on')) {
        await setAllRelaysGlobal(true);
        return getResult(true, "Baik, semua relay telah diaktifkan secara bersamaan.");
      }
      if (text.includes('mati') || text.includes('padam') || text.includes('non') || text.includes('off')) {
        await setAllRelaysGlobal(false);
        return getResult(true, "Perintah diterima, seluruh sistem relay dinonaktifkan.");
      }
    }

    // 4. VARIATION CHECKS
    if (text.includes('variasi')) {
      if (text.includes('satu') || text.includes('1') || text.includes('v1')) {
        await triggerVariasi(1);
        return getResult(true, "Memulai program siklus variasi satu pada ESP32.");
      }
      if (text.includes('dua') || text.includes('2') || text.includes('v2')) {
        await triggerVariasi(2);
        return getResult(true, "Memulai program ritem variasi dua pada ESP32.");
      }
    }

    // 5. INDIVIDUAL RELAY LOGIC (supports both R1-R4 and customizable names)
    // Relay 1 Check
    if (text.includes('r1') || text.includes('relay 1') || text.includes('relay satu') || text.includes(l1)) {
      if (text.includes('nyala') || text.includes('hidup') || text.includes('on') || text.includes('aktif')) {
        if (relays[0].state) return getResult(true, `${relays[0].name} sudah dalam keadaan hidup.`);
        await toggleRelay(0);
        return getResult(true, `Baik, menghidupkan ${relays[0].name}.`);
      }
      if (text.includes('mati') || text.includes('padam') || text.includes('off') || text.includes('non')) {
        if (!relays[0].state) return getResult(true, `${relays[0].name} memang sudah mati.`);
        await toggleRelay(0);
        return getResult(true, `Siap, memadamkan ${relays[0].name}.`);
      }
    }

    // Relay 2 Check
    if (text.includes('r2') || text.includes('relay 2') || text.includes('relay dua') || text.includes(l2)) {
      if (text.includes('nyala') || text.includes('hidup') || text.includes('on') || text.includes('aktif')) {
        if (relays[1].state) return getResult(true, `${relays[1].name} sudah dalam keadaan hidup.`);
        await toggleRelay(1);
        return getResult(true, `Baik, menyalakan ${relays[1].name}.`);
      }
      if (text.includes('mati') || text.includes('padam') || text.includes('off') || text.includes('non')) {
        if (!relays[1].state) return getResult(true, `${relays[1].name} memang sudah mati.`);
        await toggleRelay(1);
        return getResult(true, `Siap, menonaktifkan ${relays[1].name}.`);
      }
    }

    // Relay 3 Check
    if (text.includes('r3') || text.includes('relay 3') || text.includes('relay tiga') || text.includes(l3)) {
      if (text.includes('nyala') || text.includes('hidup') || text.includes('on') || text.includes('aktif')) {
        if (relays[2].state) return getResult(true, `${relays[2].name} sudah aktif.`);
        await toggleRelay(2);
        return getResult(true, `Membuka saklar ${relays[2].name}.`);
      }
      if (text.includes('mati') || text.includes('padam') || text.includes('off') || text.includes('non')) {
        if (!relays[2].state) return getResult(true, `${relays[2].name} sudah padam.`);
        await toggleRelay(2);
        return getResult(true, `Mematikan saluran ${relays[2].name}.`);
      }
    }

    // Relay 4 Check
    if (text.includes('r4') || text.includes('relay 4') || text.includes('relay empat') || text.includes(l4)) {
      if (text.includes('nyala') || text.includes('hidup') || text.includes('on') || text.includes('aktif')) {
        if (relays[3].state) return getResult(true, `${relays[3].name} sudah menyala.`);
        await toggleRelay(3);
        return getResult(true, `Menghidupkan listrik ${relays[3].name}.`);
      }
      if (text.includes('mati') || text.includes('padam') || text.includes('off') || text.includes('non')) {
        if (!relays[3].state) return getResult(true, `${relays[3].name} sudah padam.`);
        await toggleRelay(3);
        return getResult(true, `Mematikan daya listrik ${relays[3].name}.`);
      }
    }

    // FALLBACK
    return getResult(false, "Perintah suara terdeteksi namun tidak cocok. Coba katakan: 'Nyalakan Lampu Kamar' atau 'Matikan Semua'.");
  };

  const clearGraphHistory = () => {
    setSensorHistory([]);
  };

  return (
    <div className="min-h-screen bg-[#0B0C0E] text-white font-sans flex flex-col antialiased selection:bg-blue-600 selection:text-white">
      
      {/* Top Header Navigation */}
      <header className="bg-[#15171C] border-b border-[#282C34] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          
          {/* Logo Title (Exact Bento style mockup visual) */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center border border-emerald-500/30">
              <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                ESP32 Control Node
                {mode === 'direct' ? (
                  <span className="text-xxs font-mono font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">LIVE / DIRECT</span>
                ) : (
                  <span className="text-xxs font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">DEMO MODE</span>
                )}
              </h1>
              <p className="text-xxs text-slate-400 font-mono tracking-wider mt-1">ID: 8838873271 • Direct Link: {espIp}</p>
            </div>
          </div>



        </div>
      </header>

      {/* Connection & Network Configuration Panel */}
      <section className="bg-[#15171C] border-b border-[#282C34] p-4 text-slate-300">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 items-center gap-4">
          
          {/* Status Indicator Info */}
          <div className="md:col-span-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl border ${
              connState.status === 'connected' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
              connState.status === 'connecting' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
              'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}>
              {connState.status === 'connected' ? (
                <Wifi className="w-5 h-5" />
              ) : (
                <WifiOff className="w-5 h-5 animate-bounce" />
              )}
            </div>
            
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-bold text-slate-500 tracking-wider uppercase block leading-none font-mono">STATUS KONEKSI</span>
              <p className="text-xs font-semibold text-slate-200 truncate mt-1 leading-relaxed">
                {connState.message}
              </p>
            </div>
          </div>

          {/* Connection Control Input and mode Switcher */}
          <div className="md:col-span-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
            
            {/* Mode Switch Button */}
            <div className="flex items-center bg-[#0B0C0E] rounded-xl border border-[#282C34] p-0.5">
              <button
                type="button"
                onClick={() => setMode('simulation')}
                className={`px-3 py-1.5 rounded-lg text-xxs font-bold cursor-pointer transition-all ${
                  mode === 'simulation' 
                    ? 'bg-blue-600 text-white shadow-xs' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Simulation
              </button>
              <button
                type="button"
                onClick={() => setMode('direct')}
                className={`px-3 py-1.5 rounded-lg text-xxs font-bold cursor-pointer transition-all ${
                  mode === 'direct' 
                    ? 'bg-emerald-600 text-white shadow-xs' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Direct IP Control
              </button>
            </div>

            {/* IP Address Field and Ping Trigger */}
            <div className={`flex gap-1.5 p-1 rounded-xl items-center transition-all border ${
              mode === 'direct' 
                ? 'border-emerald-500/50 shadow-md bg-[#0D1515] text-emerald-400' 
                : 'border-[#282C34] bg-[#0B0C0E] opacity-50 pointer-events-none'
            }`}>
              <span className="text-xxs font-mono font-bold text-slate-400 px-2 uppercase shrink-0">ESP IP:</span>
              <input
                type="text"
                disabled={mode !== 'direct'}
                value={inputIp}
                onChange={(e) => setInputIp(e.target.value)}
                placeholder="192.168.1.100"
                className="bg-transparent text-xs font-semibold font-mono border-none outline-none w-32 focus:ring-0 text-white p-1"
              />
              <button
                onClick={pingESP32}
                disabled={mode !== 'direct' || isPolling}
                className="bg-teal-600 border border-teal-500 text-white hover:bg-teal-500 disabled:bg-slate-800 disabled:text-slate-500 text-xxs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                {isPolling ? 'Polling...' : 'Hubungkan'}
              </button>
            </div>

            {pingLatency !== null && (
              <span className="text-xxs font-mono bg-emerald-500/10 text-emerald-400 px-2 py-1.5 rounded-xl border border-emerald-500/20 shrink-0 font-bold">
                {pingLatency}ms
              </span>
            )}
          </div>

        </div>


      </section>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        <div className="space-y-8 animate-fade-in">
                      {/* Upper Grid: 4-Channel Relays Control Grid */}
            <div id="controls-section">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-6">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">Saklar Relay Fisik (GPIO Outputs)</h2>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">Ubah nama alias relay sesuai beban alat eletronik Anda (otomatis sinkron asisten suara)</p>
                </div>

                {/* Master Global controllers */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setAllRelaysGlobal(true)}
                    disabled={isVariasiRunning !== null}
                    className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50 text-xxs font-bold px-3 py-2 rounded-xl transition-colors cursor-pointer border border-emerald-500/30"
                  >
                    Semua ON
                  </button>
                  <button
                    onClick={() => setAllRelaysGlobal(false)}
                    disabled={isVariasiRunning !== null}
                    className="bg-rose-500/10 text-rose-400 hover:bg-rose-500/25 disabled:opacity-50 text-xxs font-bold px-3 py-2 rounded-xl transition-colors cursor-pointer border border-rose-500/30"
                  >
                    Semua OFF
                  </button>
                  <button
                    onClick={() => triggerVariasi(1)}
                    disabled={isVariasiRunning !== null}
                    className="bg-[#282C34] text-slate-200 border border-[#3A4150] hover:bg-[#323945] hover:text-white disabled:bg-slate-800 disabled:text-slate-600 text-xxs font-bold px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-xxs"
                  >
                    <Play className="w-3 h-3 fill-white" />
                    Variasi 1
                  </button>
                  <button
                    onClick={() => triggerVariasi(2)}
                    disabled={isVariasiRunning !== null}
                    className="bg-[#282C34] text-slate-200 border border-[#3A4150] hover:bg-[#323945] hover:text-white disabled:bg-slate-800 disabled:text-slate-600 text-xxs font-bold px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-xxs"
                  >
                    <Play className="w-3 h-3 fill-white" />
                    Variasi 2
                  </button>
                </div>
              </div>

              {/* Variation progress indicator */}
              {isVariasiRunning !== null && (
                <div className="bg-amber-500/5 rounded-2xl border border-amber-500/20 p-4 mb-6 animate-pulse">
                  <div className="flex justify-between items-center text-xs font-bold text-amber-400 mb-1.5 font-mono">
                    <span className="flex items-center gap-2">
                       <Sparkles className="w-4 h-4 animate-spin text-amber-400" />
                      Variasi {isVariasiRunning} sedang berjalan di ESP32...
                    </span>
                    <span>{variasiProgress}%</span>
                  </div>
                  <div className="w-full bg-amber-950/40 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-amber-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${variasiProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Relays Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6" id="relays-grid">
                {relays.map((relay, idx) => (
                  <div 
                    key={relay.id}
                    className={`bg-[#15171C] rounded-3xl border p-5 flex flex-col justify-between min-h-[190px] transition-all duration-300 relative group overflow-hidden ${
                      relay.state 
                        ? 'border-teal-500/40 shadow-xl shadow-teal-500/5 ring-1 ring-teal-500/30' 
                        : 'border-[#282C34] hover:border-[#3A4150]'
                    }`}
                  >
                    
                    {/* Background glow overlay when active */}
                    {relay.state && (
                      <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-emerald-500/5 pointer-events-none rounded-3xl" />
                    )}

                    <div className="z-10 flex justify-between items-start">
                      
                      {/* Active Indicator Socket & Label */}
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono font-bold text-slate-400 tracking-wide uppercase">Relay #{relay.id + 1}</span>
                        <span className="text-xxs font-mono bg-[#282C34] text-slate-300 font-bold px-1.5 py-0.5 rounded-md border border-[#3A4150] inline-block mt-1 self-start">
                          GPIO {relay.pin}
                        </span>
                      </div>

                      {/* Icon with glowing shadow */}
                      <div className={`p-3 rounded-2xl transition-all duration-300 border ${
                        relay.state 
                          ? 'bg-teal-500 text-white border-teal-400 animate-pulse shadow-md shadow-teal-500/40' 
                          : 'bg-[#0B0C0E] text-slate-500 border-[#282C34]'
                      }`}>
                        <Power className="w-5 h-5" />
                      </div>
                    </div>

                    {/* Middle Title / Custom alias input */}
                    <div className="mt-5 z-10 flex flex-col">
                      <input
                        type="text"
                        value={relay.name}
                        onChange={(e) => handleRenameRelay(idx, e.target.value)}
                        placeholder={`Alat #${relay.id + 1}`}
                        className="text-sm font-bold text-white bg-transparent hover:bg-[#282C34]/40 border-none outline-none focus:bg-[#0B0C0E] focus:ring-1 focus:ring-[#3A4150] px-1.5 py-1 rounded-lg transition-all focus:outline-none placeholder:text-slate-500"
                        title="Klik untuk mengubah nama alias beban relay"
                      />
                      <span className="text-[10px] text-slate-500 ml-1.5 mt-0.5 font-mono">Nama beban aktif</span>
                    </div>

                    {/* Bottom Status & Switch Slider Trigger */}
                    <div className="mt-5 pt-4 border-t border-[#282C34] flex justify-between items-center z-10">
                      <span className={`text-xs font-bold font-mono tracking-wide ${relay.state ? 'text-teal-400' : 'text-slate-500'}`}>
                        {relay.state ? 'ACTIVE / ON' : 'STANDBY / OFF'}
                      </span>

                      {/* Toggle switch visual */}
                      <button
                        onClick={() => toggleRelay(idx)}
                        disabled={isVariasiRunning !== null}
                        className={`w-12 h-6.5 rounded-full p-1 transition-colors duration-300 cursor-pointer disabled:opacity-40 select-none ${
                          relay.state ? 'bg-teal-500' : 'bg-[#282C34] border border-[#3A4150]'
                        }`}
                      >
                        <div className={`bg-white w-4.5 h-4.5 rounded-full shadow-md transform transition-transform duration-300 ${
                          relay.state ? 'translate-x-5.5' : 'translate-x-0'
                        }`} />
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            </div>

            {/* Middle Grid: Real-time graphs for DHT11 */}
            <div id="graphs-section" className="border-t border-[#282C34] pt-8">
              <div className="mb-6 flex justify-between items-end">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">Kondisi Lingkungan Real-Time</h2>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">Pantau fluktuasi grafik suhu & kelembapan dari modul sensor DHT11</p>
                </div>
              </div>
              <RealTimeCharts data={sensorHistory} onClearHistory={clearGraphHistory} />
            </div>

            {/* Bottom Grid: Voice Control panel */}
            <div id="voice-section" className="border-t border-[#282C34] pt-8">
              <VoicePanel onExecuteCommand={executeVoiceCommand} isVariasiRunning={isVariasiRunning !== null} />
            </div>

          </div>
      </main>

      {/* Footer Disclaimer Credit */}
      <footer className="bg-[#15171C] text-slate-400 py-6 text-center text-xs mt-12 border-t border-[#282C34]">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="font-semibold text-slate-300">ESP32 Telegram Bot & Web Controller Interface — Port 80 WebServer</p>
          <div className="flex gap-4 font-mono text-[10px] text-slate-500">
            <span>Ver: 1.2.0</span>
            <span>CORS Enabled</span>
            <span>DHT11 Pin 4</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
