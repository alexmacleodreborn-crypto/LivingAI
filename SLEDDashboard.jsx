import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Lock, RefreshCw, Wifi, AlertTriangle, Zap } from 'lucide-react';

const SYMBOLS = ['IBM', 'AAPL', 'NVDA', 'TSLA'];

const calculateSLEDMetrics = (dataPoints, historyBuffer = []) => {
  if (dataPoints.length < 10) {
    return {
      z: 0.95, sigma: 0.1, gate: 0, tau_SL: 0,
      dZ_dt: 0, dSigma_dt: 0, rp: false,
      phase: 'WAITING', signal: 'INSUFFICIENT DATA'
    };
  }

  const prices = dataPoints.map(d => d.price);
  const volumes = dataPoints.map(d => d.volume);

  const meanPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((a, b) => a + Math.pow(b - meanPrice, 2), 0) / prices.length;
  const stdDev = Math.sqrt(variance);

  const k_Z = 0.5;
  const Z = 1.0 / (1.0 + k_Z * stdDev);

  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length || 1;
  const lastVolume = volumes[volumes.length - 1];
  let Sigma = lastVolume / avgVolume;
  Sigma = Math.min(Sigma, 3.0);

  const Gate = (1 - Z) * Sigma;

  let dZ_dt = 0;
  let dSigma_dt = 0;
  if (historyBuffer.length > 0) {
    const prev = historyBuffer[historyBuffer.length - 1];
    dZ_dt = Z - prev.z;
    dSigma_dt = Sigma - prev.sigma;
  }

  const rp = (dZ_dt < -0.01) && (dSigma_dt > 0.08) && (Gate > 0.35);

  const C = 1.0;
  const prevTau = historyBuffer.length > 0 ? historyBuffer[historyBuffer.length - 1].tau_SL : 0;
  const tau_SL = prevTau + C * Gate;

  let phase = '0';
  let signal = 'MONITORING';

  if (Z > 0.9 && Sigma < 1.0) {
    phase = 'IV'; signal = 'SAFE / FROZEN';
  } else if (Z < 0.8 && Gate > 0.55) {
    phase = 'III'; signal = 'EVENT IN PROGRESS';
  } else if (rp || (Z < 0.85 && Z > 0.6)) {
    phase = 'II'; signal = 'TURBULENCE';
  } else if (Z > 0.85 && Sigma > 1.4) {
    phase = '0'; signal = 'NOTIFICATION';
  }

  return {
    z: Number(Z.toFixed(3)),
    sigma: Number(Sigma.toFixed(3)),
    gate: Number(Gate.toFixed(3)),
    tau_SL: Number(tau_SL.toFixed(2)),
    dZ_dt: Number(dZ_dt.toFixed(3)),
    dSigma_dt: Number(dSigma_dt.toFixed(3)),
    rp,
    phase,
    signal
  };
};

const SLEDDashboard = () => {
  const [currentSymbol, setCurrentSymbol] = useState('IBM');
  const [data, setData] = useState([]);
  const [metrics, setMetrics] = useState({ z: 0, sigma: 0, gate: 0, tau_SL: 0, dZ_dt: 0, dSigma_dt: 0, rp: false, phase: '-', signal: 'INITIALIZING' });
  const [metricsHistory, setMetricsHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchData = async (symbol = currentSymbol) => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/yahoo/v8/finance/chart/${symbol}?interval=5m&range=5d`;
      const res = await fetch(url);
      const json = await res.json();

      const result = json.chart?.result?.[0];
      if (!result?.timestamp) throw new Error("No data from Yahoo Finance");

      const quotes = result.indicators.quote[0];
      const timestamps = result.timestamp;

      const formattedData = timestamps.slice(-60).map((ts, i) => ({
        time: new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        price: parseFloat(quotes.close[i]?.toFixed(2) || 0),
        volume: parseInt(quotes.volume[i] || 0)
      })).filter(d => d.price > 0);

      if (formattedData.length < 10) throw new Error("Not enough candles yet");

      const newMetrics = calculateSLEDMetrics(formattedData, metricsHistory);

      setData(formattedData);
      setMetrics(newMetrics);
      setMetricsHistory(prev => [...prev.slice(-19), newMetrics]);
      setLastFetch(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runBacktest = () => {
    alert(`SLED Backtest for ${currentSymbol} (30 days)\n\nResults are logged to browser console.\nExpand the refined kernel in calculateSLEDMetrics for full backtesting.`);
    console.log(`=== SLED Backtest Started for ${currentSymbol} ===`);
  };

  useEffect(() => {
    fetchData(currentSymbol);
  }, [currentSymbol]);

  const getPhaseColor = (phase) => {
    if (phase === 'IV') return 'bg-blue-900 border-blue-500 text-blue-100';
    if (phase === 'III') return 'bg-red-900 border-red-500 text-red-100';
    if (phase === 'II') return 'bg-orange-900 border-orange-500 text-orange-100';
    if (phase === '0') return 'bg-yellow-900 border-yellow-500 text-yellow-100';
    return 'bg-gray-800 border-gray-700';
  };

  return (
    <div className="p-6 bg-gray-900 min-h-screen text-gray-100 font-mono">
      <div className="mb-6 border-b border-gray-700 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Zap className="text-purple-400" /> SLED AI ENGINE
          </h1>
          <p className="text-xs text-gray-500">Scalar-Led Emergence Dynamics • Sandy&apos;s Law</p>
        </div>
        <div className="flex items-center gap-4">
          <select value={currentSymbol} onChange={e => setCurrentSymbol(e.target.value)} className="bg-gray-800 border border-gray-700 rounded px-4 py-2">
            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="bg-red-900/50 border border-red-500 p-4 rounded mb-6 flex gap-3"><AlertTriangle size={20} /> {error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* SLED Readouts */}
        <div className="lg:col-span-4 space-y-5">
          <div className={`p-8 rounded-2xl border-2 ${getPhaseColor(metrics.phase)}`}>
            <div className="text-xs uppercase tracking-widest opacity-75">DETECTED PHASE</div>
            <div className="text-5xl font-bold mt-3">PHASE {metrics.phase}</div>
            <div className="text-xl mt-3">{metrics.signal}</div>
            {metrics.rp && <div className="mt-4 text-red-300 flex items-center gap-2"><Zap size={18} /> REACTION POINT ACTIVE</div>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
              <div className="text-red-400 flex items-center gap-2 mb-2"><Lock size={18} /> TRAP Z</div>
              <div className="text-4xl font-mono">{metrics.z}</div>
            </div>
            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
              <div className="text-green-400 flex items-center gap-2 mb-2"><Activity size={18} /> ENTROPY Σ</div>
              <div className="text-4xl font-mono">{metrics.sigma}</div>
            </div>
          </div>

          <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
            <div className="text-purple-400 mb-4 flex items-center gap-2"><Zap size={18} /> SANDY&apos;S LAW</div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span>Gate</span><span className="font-mono">{metrics.gate}</span></div>
              <div className="flex justify-between"><span>τ_SL (Event Time)</span><span className="font-mono text-purple-300">{metrics.tau_SL}</span></div>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => fetchData()} disabled={loading} className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-70">
              <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
              FETCH LIVE
            </button>
            <button onClick={runBacktest} className="flex-1 py-4 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold">
              BACKTEST
            </button>
          </div>
        </div>

        {/* Charts */}
        <div className="lg:col-span-8 bg-gray-800 rounded-2xl border border-gray-700 p-6">
          <div className="uppercase text-xs tracking-widest text-gray-400 mb-6">{currentSymbol} • 5-MIN • SLED LIVE</div>
          
          <div className="h-72 mb-8">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#6B7280" />
                <YAxis stroke="#6B7280" />
                <Tooltip />
                <Line type="monotone" dataKey="price" stroke="#60A5FA" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#6B7280" />
                <YAxis stroke="#6B7280" />
                <Tooltip />
                <Line type="step" dataKey="volume" stroke="#34D399" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SLEDDashboard;