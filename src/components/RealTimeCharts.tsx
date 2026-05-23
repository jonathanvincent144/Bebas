import React, { useMemo } from 'react';
import { SensorReading } from '../types';
import { Thermometer, Droplets, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';

interface RealTimeChartsProps {
  data: SensorReading[];
  onClearHistory: () => void;
}

export default function RealTimeCharts({ data, onClearHistory }: RealTimeChartsProps) {
  // Extract latest metrics
  const latest = data[data.length - 1] || { suhu: 27.5, kelembapan: 65, timestamp: Date.now() };
  
  // Calculate stats
  const stats = useMemo(() => {
    if (data.length === 0) {
      return {
        tempMin: 22, tempMax: 35,
        humMin: 40, humMax: 85,
        tempTrend: 'stable', humTrend: 'stable'
      };
    }
    const temps = data.map(d => d.suhu);
    const hums = data.map(d => d.kelembapan);
    
    // Calculate trends (comparing last 3 points)
    let tempTrend = 'stable';
    if (temps.length >= 3) {
      const diff = temps[temps.length - 1] - temps[temps.length - 3];
      if (diff > 0.1) tempTrend = 'up';
      else if (diff < -0.1) tempTrend = 'down';
    }
    let humTrend = 'stable';
    if (hums.length >= 3) {
      const diff = hums[hums.length - 1] - hums[hums.length - 3];
      if (diff > 0.2) humTrend = 'up';
      else if (diff < -0.2) humTrend = 'down';
    }

    return {
      tempMin: Math.min(...temps),
      tempMax: Math.max(...temps),
      humMin: Math.min(...hums),
      humMax: Math.max(...hums),
      tempTrend,
      humTrend
    };
  }, [data]);

  // Helper to generate SVG Path points
  const generatePath = (
    readings: SensorReading[],
    key: 'suhu' | 'kelembapan',
    width: number,
    height: number,
    padding: number,
    minVal: number,
    maxVal: number
  ) => {
    if (readings.length < 2) return { line: '', area: '', points: [] };

    const points = readings.map((r, i) => {
      const x = padding + (i / (readings.length - 1)) * (width - 2 * padding);
      const val = r[key];
      // Normalize value within min and max
      const valueRange = maxVal - minVal || 1;
      const normalized = (val - minVal) / valueRange;
      const y = height - padding - normalized * (height - 2 * padding);
      return { x, y, value: val, time: r.time };
    });

    // Produce bezier lines for smooth curved visualization
    let linePath = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpX1 = p0.x + (p1.x - p0.x) / 3;
      const cpY1 = p0.y;
      const cpX2 = p0.x + 2 * (p1.x - p0.x) / 3;
      const cpY2 = p1.y;
      linePath += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }

    // Generate closed path for fill area
    const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

    return { line: linePath, area: areaPath, points };
  };

  // Dimensions for SVG Graphs
  const width = 600;
  const height = 180;
  const paddingX = 40;
  const paddingY = 20;

  // Compute Scales
  const tempScale = useMemo(() => {
    if (data.length === 0) return { min: 20, max: 40 };
    const temps = data.map(d => d.suhu);
    const min = Math.min(...temps) - 1.5;
    const max = Math.max(...temps) + 1.5;
    return {
      min: Math.min(22, Math.max(0, min)),
      max: Math.max(35, max)
    };
  }, [data]);

  const humScale = useMemo(() => {
    if (data.length === 0) return { min: 30, max: 100 };
    const hums = data.map(d => d.kelembapan);
    const min = Math.min(...hums) - 5;
    const max = Math.max(...hums) + 5;
    return {
      min: Math.min(40, Math.max(0, min)),
      max: Math.max(85, Math.min(100, max))
    };
  }, [data]);

  const tempPaths = useMemo(() => {
    return generatePath(data, 'suhu', width, height, paddingY, tempScale.min, tempScale.max);
  }, [data, tempScale]);

  const humPaths = useMemo(() => {
    return generatePath(data, 'kelembapan', width, height, paddingY, humScale.min, humScale.max);
  }, [data, humScale]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="realtime-charts-section">
      {/* Temperature Card & Chart */}
      <div className="bg-[#15171C] rounded-3xl border border-[#282C34] p-6 flex flex-col justify-between transition-all duration-300 shadow-lg" id="temperature-chart-card">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Thermometer className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-400 text-xs tracking-wider uppercase font-mono">Temperatur (Suhu)</h3>
                <p className="text-3xl font-bold font-mono text-white tracking-tighter mt-0.5">
                  {latest.suhu.toFixed(1)}<span className="text-lg font-normal text-slate-500 italic"> °C</span>
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end">
              <div className={`flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${
                stats.tempTrend === 'up' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                stats.tempTrend === 'down' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' :
                'bg-slate-800 text-slate-400 border-[#282C34]'
              }`}>
                {stats.tempTrend === 'up' && <TrendingUp className="w-3 h-3" />}
                {stats.tempTrend === 'down' && <TrendingDown className="w-3 h-3" />}
                {stats.tempTrend === 'up' ? 'Meningkat' : stats.tempTrend === 'down' ? 'Menurun' : 'Stabil'}
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-1">Min: {stats.tempMin.toFixed(1)}° | Max: {stats.tempMax.toFixed(1)}°</span>
            </div>
          </div>

          {/* SVG Chart */}
          <div className="relative w-full overflow-hidden bg-[#0B0C0E]/60 rounded-2xl p-2 border border-[#282C34]/50 mt-4">
            {data.length < 2 ? (
              <div className="h-40 flex flex-col items-center justify-center text-slate-500 gap-2 font-mono">
                <RefreshCw className="w-6 h-6 animate-spin text-rose-500" />
                <p className="text-xs">Menunggu data sensor masuk...</p>
              </div>
            ) : (
              <svg className="w-full h-40" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="tempAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
                  </linearGradient>
                  <filter id="tempGlow" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#f43f5e" floodOpacity="0.4" />
                  </filter>
                </defs>

                {/* Horizontal reference lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
                  const y = paddingY + ratio * (height - 2 * paddingY);
                  const val = tempScale.max - ratio * (tempScale.max - tempScale.min);
                  return (
                    <g key={index} className="opacity-20">
                      <line
                        x1={paddingX}
                        y1={y}
                        x2={width - paddingX}
                        y2={y}
                        stroke="#282C34"
                        strokeDasharray="4 4"
                        strokeWidth="1"
                      />
                      <text
                        x={paddingX - 10}
                        y={y + 4}
                        fill="#64748b"
                        fontSize="10"
                        textAnchor="end"
                        fontWeight="500"
                        className="font-mono"
                      >
                        {val.toFixed(1)}
                      </text>
                    </g>
                  );
                })}

                {/* Filled Area */}
                <path d={tempPaths.area} fill="url(#tempAreaGrad)" />

                {/* Main Glowing Line */}
                <path
                  d={tempPaths.line}
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="3"
                  strokeLinecap="round"
                  filter="url(#tempGlow)"
                />

                {/* Tooltip Hover Circles & Labels */}
                {tempPaths.points.map((p, idx) => {
                  const isLast = idx === tempPaths.points.length - 1;
                  const isKeyNode = isLast || (idx > 0 && idx % Math.ceil(data.length / 5) === 0);
                  
                  return (
                    <g key={idx} className="group cursor-pointer">
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={isLast ? "5" : "3"}
                        fill={isLast ? "#f43f5e" : "#f43f5e"}
                        stroke="#15171C"
                        strokeWidth="2"
                        className="transition-all duration-300 transform group-hover:scale-150"
                      />
                      {isKeyNode && (
                        <g>
                          <rect
                            x={p.x - 22}
                            y={p.y - 25}
                            width="44"
                            height="18"
                            rx="5"
                            fill="#282C34"
                            stroke="#3A4150"
                            strokeWidth="1"
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                          />
                          <text
                            x={p.x}
                            y={p.y - 13}
                            fill="#ffffff"
                            fontSize="9"
                            fontWeight="bold"
                            textAnchor="middle"
                            className="pointer-events-none font-mono"
                          >
                            {p.value.toFixed(1)}°
                          </text>
                          <text
                            x={p.x}
                            y={height - 2}
                            fill="#64748b"
                            fontSize="9"
                            textAnchor="middle"
                            fontWeight="500"
                            className="font-mono opacity-80"
                          >
                            {p.time}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>
        <p className="text-[10px] text-slate-500 mt-2 font-mono italic">Grafik otomatis bergeser ke kiri setiap kali ada pembacaan data baru.</p>
      </div>

      {/* Humidity Card & Chart */}
      <div className="bg-[#15171C] rounded-3xl border border-[#282C34] p-6 flex flex-col justify-between transition-all duration-300 shadow-lg" id="humidity-chart-card">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                <Droplets className="w-6 h-6 animate-bounce" style={{ animationDuration: '3s' }} />
              </div>
              <div>
                <h3 className="font-semibold text-slate-400 text-xs tracking-wider uppercase font-mono">Kelembapan (Humidity)</h3>
                <p className="text-3xl font-bold font-mono text-white tracking-tighter mt-0.5">
                  {latest.kelembapan.toFixed(1)}<span className="text-lg font-normal text-slate-500 italic"> %</span>
                </p>
              </div>
            </div>

            <div className="flex flex-col items-end">
              <div className={`flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border ${
                stats.humTrend === 'up' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' :
                stats.humTrend === 'down' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                'bg-slate-800 text-slate-400 border-[#282C34]'
              }`}>
                {stats.humTrend === 'up' && <TrendingUp className="w-3 h-3" />}
                {stats.humTrend === 'down' && <TrendingDown className="w-3 h-3" />}
                {stats.humTrend === 'up' ? 'Meningkat' : stats.humTrend === 'down' ? 'Menurun' : 'Stabil'}
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-1">Min: {stats.humMin.toFixed(1)}% | Max: {stats.humMax.toFixed(1)}%</span>
            </div>
          </div>

          {/* SVG Chart */}
          <div className="relative w-full overflow-hidden bg-[#0B0C0E]/60 rounded-2xl p-2 border border-[#282C34]/50 mt-4">
            {data.length < 2 ? (
              <div className="h-40 flex flex-col items-center justify-center text-slate-500 gap-2 font-mono">
                <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
                <p className="text-xs">Menunggu data sensor masuk...</p>
              </div>
            ) : (
              <svg className="w-full h-40" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
                <defs>
                  <linearGradient id="humAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.0" />
                  </linearGradient>
                  <filter id="humGlow" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#0ea5e9" floodOpacity="0.4" />
                  </filter>
                </defs>

                {/* Horizontal reference lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
                  const y = paddingY + ratio * (height - 2 * paddingY);
                  const val = humScale.max - ratio * (humScale.max - humScale.min);
                  return (
                    <g key={index} className="opacity-20">
                      <line
                        x1={paddingX}
                        y1={y}
                        x2={width - paddingX}
                        y2={y}
                        stroke="#282C34"
                        strokeDasharray="4 4"
                        strokeWidth="1"
                      />
                      <text
                        x={paddingX - 10}
                        y={y + 4}
                        fill="#64748b"
                        fontSize="10"
                        textAnchor="end"
                        fontWeight="500"
                        className="font-mono"
                      >
                        {val.toFixed(0)}%
                      </text>
                    </g>
                  );
                })}

                {/* Filled Area */}
                <path d={humPaths.area} fill="url(#humAreaGrad)" />

                {/* Main Glowing Line */}
                <path
                  d={humPaths.line}
                  fill="none"
                  stroke="#0ea5e9"
                  strokeWidth="3"
                  strokeLinecap="round"
                  filter="url(#humGlow)"
                />

                {/* Tooltip Hover Circles & Labels */}
                {humPaths.points.map((p, idx) => {
                  const isLast = idx === humPaths.points.length - 1;
                  const isKeyNode = isLast || (idx > 0 && idx % Math.ceil(data.length / 5) === 0);
                  
                  return (
                    <g key={idx} className="group cursor-pointer">
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={isLast ? "5" : "3"}
                        fill={isLast ? "#0ea5e9" : "#0ea5e9"}
                        stroke="#15171C"
                        strokeWidth="2"
                        className="transition-all duration-300 transform group-hover:scale-150"
                      />
                      {isKeyNode && (
                        <g>
                          <rect
                            x={p.x - 22}
                            y={p.y - 25}
                            width="44"
                            height="18"
                            rx="5"
                            fill="#282C34"
                            stroke="#3A4150"
                            strokeWidth="1"
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                          />
                          <text
                            x={p.x}
                            y={p.y - 13}
                            fill="#ffffff"
                            fontSize="9"
                            fontWeight="bold"
                            textAnchor="middle"
                            className="pointer-events-none font-mono"
                          >
                            {p.value.toFixed(0)}%
                          </text>
                          <text
                            x={p.x}
                            y={height - 2}
                            fill="#64748b"
                            fontSize="9"
                            textAnchor="middle"
                            fontWeight="500"
                            className="font-mono opacity-80"
                          >
                            {p.time}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>
        
        <div className="flex justify-between items-center mt-3">
          <p className="text-[10px] text-slate-500 font-mono italic">DHT11 memiliki toleransi pembacaan nilai ±5% RH.</p>
          <button 
            onClick={onClearHistory}
            className="text-[10px] text-rose-400 font-bold font-mono hover:text-rose-300 tracking-wider transition-colors cursor-pointer"
          >
            HAPUS RIWAYAT
          </button>
        </div>
      </div>
    </div>
  );
}
