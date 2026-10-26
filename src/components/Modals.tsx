import React, { useState } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { PAIR_LIST } from '../constants/pairs';
import { getPairAccuracyPct } from '../engine/mlEngine';
import {
  X,
  Key,
  Brain,
  Globe,
  Download,
  Upload,
  RotateCcw,
  ShieldCheck,
  Server,
} from 'lucide-react';

interface ModalProps {
  activeModal: 'API' | 'BRAIN' | 'DEPLOY' | null;
  onClose: () => void;
}

export const Modals: React.FC<ModalProps> = ({ activeModal, onClose }) => {
  const {
    apiToken,
    appId,
    pairModels,
    saveApiCredentials,
    exportBrainJson,
    importBrainJson,
    resetAllModels,
  } = useTerminalStore();

  const [tokenInput, setTokenInput] = useState(apiToken);
  const [appIdInput, setAppIdInput] = useState(appId);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  if (!activeModal) return null;

  const handleDownloadBrain = () => {
    const json = exportBrainJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deriv-ict-brain-weights-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadBrain = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const content = String(ev.target?.result || '');
        await importBrainJson(content);
        setImportStatus('Successfully imported pair memory weights into IndexedDB!');
      } catch {
        setImportStatus('Error: Invalid JSON brain file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-[#0b111d] border border-slate-700/80 rounded-xl max-w-2xl w-full max-h-[88vh] overflow-y-auto shadow-2xl text-slate-200 font-mono">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <div className="flex items-center gap-2 font-bold text-sm">
            {activeModal === 'API' && <Key className="w-4 h-4 text-emerald-400" />}
            {activeModal === 'BRAIN' && <Brain className="w-4 h-4 text-purple-400" />}
            {activeModal === 'DEPLOY' && <Globe className="w-4 h-4 text-sky-400" />}
            <span>
              {activeModal === 'API' && 'DERIV WEBSOCKET API & TOKEN SETTINGS'}
              {activeModal === 'BRAIN' && 'ADAPTIVE ML PAIR MEMORY & BRAIN WEIGHTS (INDEXEDDB)'}
              {activeModal === 'DEPLOY' && 'DEPLOYMENT GUIDE: VERCEL / GITHUB PAGES + NAMECHEAP .SITE'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 text-xs space-y-4">
          {activeModal === 'API' && (
            <>
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 flex items-start gap-2.5 text-emerald-200">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold mb-0.5">100% Client-Side Security</div>
                  <p className="text-slate-300 leading-relaxed">
                    Your Deriv API Token never leaves your browser. It connects directly to{' '}
                    <code className="text-emerald-300">wss://ws.derivws.com/websockets/v3</code>. Leave
                    blank to trade in zero-risk Institutional Paper / Demo Simulation mode.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-slate-400 uppercase text-[11px] mb-1">
                    Deriv App ID (Default: 1089)
                  </label>
                  <input
                    type="text"
                    value={appIdInput}
                    onChange={(e) => setAppIdInput(e.target.value)}
                    placeholder="1089"
                    className="w-full bg-[#070b12] border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 uppercase text-[11px] mb-1">
                    Deriv API Token (Read + Trade Scopes for Demo/Real Account)
                  </label>
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Paste your Deriv API token (optional)..."
                    className="w-full bg-[#070b12] border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    saveApiCredentials(tokenInput, appIdInput);
                    onClose();
                  }}
                  className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  Connect & Save Credentials
                </button>
              </div>
            </>
          )}

          {activeModal === 'BRAIN' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#070b12] p-3 rounded-lg border border-slate-800">
                <div>
                  <div className="font-bold text-slate-200">
                    Persistent IndexedDB Pair Memory
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Export or import your trained SGD weight matrices across devices as a{' '}
                    <code>.json</code> file.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadBrain}
                    className="px-3 py-1.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 font-bold"
                  >
                    <Download className="w-3.5 h-3.5" /> Export .JSON
                  </button>
                  <label className="px-3 py-1.5 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 flex items-center gap-1.5 font-bold cursor-pointer">
                    <Upload className="w-3.5 h-3.5" /> Import .JSON
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleUploadBrain}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={() => resetAllModels()}
                    className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700 flex items-center gap-1"
                    title="Reset all pair weights to factory baseline"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reset
                  </button>
                </div>
              </div>

              {importStatus && (
                <div className="p-2.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300">
                  {importStatus}
                </div>
              )}

              <div className="overflow-x-auto border border-slate-800 rounded-lg">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#070b12] text-slate-400 border-b border-slate-800">
                      <th className="p-2.5">Pair</th>
                      <th className="p-2.5">Accuracy</th>
                      <th className="p-2.5">Live (W/L)</th>
                      <th className="p-2.5">Shadow ML</th>
                      <th className="p-2.5">Learned FVG Fill</th>
                      <th className="p-2.5">Gate</th>
                      <th className="p-2.5">Version</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PAIR_LIST.map((p) => {
                      const m = pairModels[p.symbol];
                      const acc = getPairAccuracyPct(m);
                      return (
                        <tr
                          key={p.symbol}
                          className="border-b border-slate-800/60 hover:bg-slate-900/40"
                        >
                          <td className="p-2.5 font-bold text-slate-200">{p.shortName}</td>
                          <td className="p-2.5 text-emerald-400 font-bold">{acc}%</td>
                          <td className="p-2.5 text-slate-300">
                            {m.wins}W / {m.losses}L
                          </td>
                          <td className="p-2.5 text-purple-300">
                            {m.shadowWins}/{m.shadowTrades}
                          </td>
                          <td className="p-2.5 text-amber-300">
                            {m.learnedAvgMitigationDepth.toFixed(1)}%
                          </td>
                          <td className="p-2.5 text-slate-300">{m.dynamicThreshold}%</td>
                          <td className="p-2.5 text-slate-400">v{m.version.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeModal === 'DEPLOY' && (
            <div className="space-y-4 leading-relaxed">
              <div className="bg-[#070b12] border border-slate-800 rounded-lg p-3.5">
                <div className="font-bold text-sky-400 mb-1 flex items-center gap-1.5">
                  <Server className="w-4 h-4" /> Step 1: Deploy Static Bundle (Vercel or GitHub Pages)
                </div>
                <p className="text-slate-300 mb-2">
                  This project includes pre-configured <code>vercel.json</code> and{' '}
                  <code>.github/workflows/deploy.yml</code> files:
                </p>
                <ul className="list-disc list-inside text-slate-400 space-y-1">
                  <li>
                    <strong className="text-slate-200">Vercel:</strong> Import repository → Framework
                    Preset: <code>Vite</code> → Build Command: <code>npm run build</code> → Output
                    Directory: <code>dist</code>.
                  </li>
                  <li>
                    <strong className="text-slate-200">GitHub Pages:</strong> Push to{' '}
                    <code>main</code> branch; GitHub Actions automatically builds and deploys{' '}
                    <code>./dist</code>.
                  </li>
                </ul>
              </div>

              <div className="bg-[#070b12] border border-slate-800 rounded-lg p-3.5">
                <div className="font-bold text-emerald-400 mb-2 flex items-center gap-1.5">
                  <Globe className="w-4 h-4" /> Step 2: Namecheap Custom <code>.site</code> Domain
                  DNS Records
                </div>
                <p className="text-slate-300 mb-2">
                  In Namecheap Dashboard → <strong>Manage</strong> next to your <code>.site</code>{' '}
                  domain → <strong>Advanced DNS</strong>, add:
                </p>
                <div className="bg-slate-950 border border-slate-800 rounded p-2.5 space-y-1.5 text-[11px]">
                  <div className="flex justify-between text-slate-300">
                    <span>Type: <strong>A Record</strong></span>
                    <span>Host: <strong>@</strong></span>
                    <span className="text-emerald-400">Value: 76.76.21.21 (Vercel)</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Type: <strong>CNAME Record</strong></span>
                    <span>Host: <strong>www</strong></span>
                    <span className="text-emerald-400">Value: cname.vercel-dns.com</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
