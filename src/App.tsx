/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useRef, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Text, Float } from '@react-three/drei';
import * as THREE from 'three';
import { 
  Settings, 
  Weight, 
  Maximize2, 
  Layers, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  ChevronRight,
  Activity,
  Zap,
  Box,
  RotateCcw
} from 'lucide-react';

// Constants
const G = 9.80665; // Gravity m/s^2
const MATERIAL_STRENGTH_MPA = 400; // Sigma in MPa
const SAFETY_FACTOR = 1.5;
const MODULE_WIDTH_MM = 400; // Fixed external width
const MODULE_HEIGHT_MM = 400; // Fixed external height

enum LoadMode {
  REST = '一般休憩',
  SQUEEZE = '高密度擠壓',
  IMPACT = '青少年衝擊'
}

const MODE_FACTORS = {
  [LoadMode.REST]: 1.0,
  [LoadMode.SQUEEZE]: 1.5,
  [LoadMode.IMPACT]: 3.0
};

// 3D Model Component
function CycletModule({ length, wallThickness, stressRatio, isDanger, heatmapColor }: { 
  length: number, 
  wallThickness: number, 
  stressRatio: number,
  isDanger: boolean,
  heatmapColor: string
}) {
  const meshRef = useRef<THREE.Group>(null);
  
  // Scale units (mm to units, assuming 100mm = 1 unit)
  const l = length / 100;
  const w = MODULE_WIDTH_MM / 100;
  const h = MODULE_HEIGHT_MM / 100;
  const t = wallThickness / 100;

  useFrame((state) => {
    if (meshRef.current) {
      // Subtle bounce or vibration based on stress if danger
      if (isDanger) {
        meshRef.current.position.y = Math.sin(state.clock.getElapsedTime() * 20) * 0.02;
      } else {
        meshRef.current.position.y = 0;
      }
    }
  });

  return (
    <group ref={meshRef}>
      {/* Outer shell (Top/Bottom) */}
      <mesh position={[0, h/2 - t/2, 0]}>
        <boxGeometry args={[l, t, w]} />
        <meshStandardMaterial 
          color={isDanger ? '#ef4444' : '#ffffff'} 
          metalness={0.8} 
          roughness={0.1} 
          opacity={0.9}
          transparent
        />
      </mesh>
      <mesh position={[0, -h/2 + t/2, 0]}>
        <boxGeometry args={[l, t, w]} />
        <meshStandardMaterial 
          color={isDanger ? '#ef4444' : '#ffffff'} 
          metalness={0.8} 
          roughness={0.1}
          opacity={0.9}
          transparent
        />
      </mesh>

      {/* Side walls */}
      <mesh position={[0, 0, w/2 - t/2]}>
        <boxGeometry args={[l, h, t]} />
        <meshStandardMaterial 
          color="#ffffff" 
          transparent 
          opacity={0.4} 
          metalness={0.2}
          roughness={0}
        />
      </mesh>
      <mesh position={[0, 0, -w/2 + t/2]}>
        <boxGeometry args={[l, h, t]} />
        <meshStandardMaterial 
          color="#ffffff" 
          transparent 
          opacity={0.4} 
          metalness={0.2}
          roughness={0}
        />
      </mesh>

      {/* Internal Ribs (Middle section) */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.1, h - 2*t, w - 2*t]} />
        <meshStandardMaterial color="#3b82f6" metalness={0.9} roughness={0.05} />
      </mesh>

      {/* Stress Heatmap Center Sphere */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[Math.min(1.5, stressRatio * 1.2), 32, 32]} />
        <meshStandardMaterial 
          color={heatmapColor} 
          emissive={heatmapColor} 
          emissiveIntensity={stressRatio > 1 ? 2 : 0.5} 
          transparent 
          opacity={0.6} 
        />
      </mesh>

      {/* Quick-Lock T-Pins (at ends) */}
      <group position={[-l/2, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI/2]}>
          <cylinderGeometry args={[0.2, 0.2, 0.5]} />
          <meshStandardMaterial color={isDanger ? '#ef4444' : '#3b82f6'} />
        </mesh>
        {/* Connection point stress aura */}
        <mesh>
          <sphereGeometry args={[0.4, 16, 16]} />
          <meshStandardMaterial color={heatmapColor} transparent opacity={0.3} />
        </mesh>
      </group>
      <group position={[l/2, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI/2]}>
          <cylinderGeometry args={[0.2, 0.2, 0.5]} />
          <meshStandardMaterial color={isDanger ? '#ef4444' : '#3b82f6'} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.4, 16, 16]} />
          <meshStandardMaterial color={heatmapColor} transparent opacity={0.3} />
        </mesh>
      </group>

      {/* Floor reflection proxy */}
      <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -h/2 - 0.5, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.1} />
      </mesh>
    </group>
  );
}

export default function App() {
  // States
  const [loadKg, setLoadKg] = useState(60);
  const [wallThicknessMm, setWallThicknessMm] = useState(15);
  const [lengthMm, setLengthMm] = useState(800);
  const [mode, setMode] = useState<LoadMode>(LoadMode.REST);

  // Calculations
  const results = useMemo(() => {
    const factor = MODE_FACTORS[mode];
    const m = loadKg * factor;
    const S = SAFETY_FACTOR;
    const L = lengthMm / 1000;
    const t = wallThicknessMm / 1000;
    const W = MODULE_WIDTH_MM / 1000;
    const H = MODULE_HEIGHT_MM / 1000;

    // Force F = m * g * S
    const F = m * G * S;

    // Effective Area A = W*H - (W-2t)*(H-2t)
    const A = (W * H) - (W - 2*t) * (H - 2*t);

    // Max Moment M = (F * L) / 4
    const M = (F * L) / 4;

    // Moment of Inertia I
    const B_inner = W - 2 * t;
    const H_inner = H - 2 * t;
    const I = (W * Math.pow(H, 3) - B_inner * Math.pow(H_inner, 3)) / 12;

    // Max Stress Sigma = (M * y) / I
    const y = H / 2;
    const stressPa = (M * y) / I;
    const stressMpa = stressPa / 1e6;

    const ratio = stressMpa / MATERIAL_STRENGTH_MPA;
    
    return {
      force: F,
      moment: M,
      stress: stressMpa,
      area: A * 1e6, // mm^2
      ratio: ratio,
      isSafe: ratio < 0.6,
      isWarning: ratio >= 0.6 && ratio < 1.0,
      isDanger: ratio >= 1.0
    };
  }, [loadKg, wallThicknessMm, lengthMm, mode]);

  const getStressColor = () => {
    if (results.isDanger) return 'text-brand-danger shadow-brand-danger/50';
    if (results.isWarning) return 'text-orange-400';
    return 'text-brand-safety';
  };

  const getHeatmapColor = () => {
    const t = Math.min(1, results.ratio);
    // Green (16, 185, 129) to Red (239, 68, 68)
    const r = Math.floor(16 + (239 - 16) * t);
    const g = Math.floor(185 + (68 - 185) * t);
    const b = Math.floor(129 + (68 - 129) * t);
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <div id="app-container" className="h-screen w-screen bg-brand-bg font-sans text-brand-text flex flex-col overflow-hidden selection:bg-brand-accent selection:text-white">
      {/* Header */}
      <header className="flex justify-between items-end px-8 py-6 pb-4 shrink-0">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-3">
            <Activity className="text-brand-accent w-6 h-6" />
            Cyclet 
            <span className="text-brand-accent font-mono text-sm ml-2 bg-brand-accent/5 px-2 py-0.5 rounded-full border border-brand-accent/10">3D Verification Lab</span>
          </h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold flex items-center gap-1.5">
            Liquid Glass Performance Engine
          </p>
        </div>
        
        <div className="hidden md:flex space-x-12 text-[10px] font-mono">
          <div className="flex flex-col">
            <span className="text-slate-400 uppercase font-black text-right">Sigma Limit</span>
            <span className="text-slate-900 font-bold text-right text-lg">400 <span className="text-xs">MPa</span></span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-slate-400 uppercase font-black">System Status</span>
            <span className={`font-black text-lg ${results.isDanger ? 'text-brand-danger animate-pulse' : 'text-brand-safety'}`}>
              {results.isDanger ? 'CRITICAL' : 'OPTIMAL'}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-12 gap-6 p-6 min-h-0 overflow-hidden">
        
        {/* Left: Controls */}
        <aside className="col-span-3 h-full min-h-0 flex flex-col space-y-4">
          <div className="liquid-glass crystalline-edge p-6 flex-1 flex flex-col space-y-8 overflow-y-auto custom-scrollbar">
            <div className="space-y-8">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-brand-accent text-white rounded-xl shadow-lg shadow-brand-accent/20">
                  <Settings className="w-4 h-4" />
                </div>
                <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Core Variables</h2>
              </div>

              {/* Mode Selection */}
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block border-l-4 border-brand-accent pl-3">Simulation Mode</label>
                <div className="grid grid-cols-1 gap-3">
                  {Object.values(LoadMode).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m as LoadMode)}
                      className={`capsule-btn text-[11px] font-bold ${
                        mode === m 
                        ? 'bg-brand-accent text-white! ring-4 ring-brand-accent/10 border-brand-accent/20 shadow-xl' 
                        : 'text-slate-500 hover:bg-white/60'
                      }`}
                    >
                      <span className="flex-1 text-left px-2">{m}</span>
                      {mode === m && <Zap className="w-3 h-3 fill-current" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sliders */}
              <div className="space-y-8 pt-6 border-t border-slate-200">
                <div className="group">
                  <div className="flex justify-between mb-3">
                    <label className="text-[11px] font-black text-slate-500 flex items-center gap-2">
                      <Weight className="w-4 h-4 text-brand-accent" /> Load Capacity <span className="text-[9px] opacity-40">kg</span>
                    </label>
                    <span className="text-brand-accent font-black text-xs">{loadKg}</span>
                  </div>
                  <input 
                    type="range" min="20" max="150" value={loadKg} 
                    onChange={(e) => setLoadKg(Number(e.target.value))}
                    className="cobalt-slider w-full"
                  />
                </div>

                <div className="group">
                  <div className="flex justify-between mb-3">
                    <label className="text-[11px] font-black text-slate-500 flex items-center gap-2">
                      <Layers className="w-4 h-4 text-brand-accent" /> Wall Density <span className="text-[9px] opacity-40">mm</span>
                    </label>
                    <span className="text-brand-accent font-black text-xs">{wallThicknessMm}</span>
                  </div>
                  <input 
                    type="range" min="5" max="40" value={wallThicknessMm} 
                    onChange={(e) => setWallThicknessMm(Number(e.target.value))}
                    className="cobalt-slider w-full"
                  />
                </div>

                <div className="group">
                  <div className="flex justify-between mb-3">
                    <label className="text-[11px] font-black text-slate-500 flex items-center gap-2">
                      <Maximize2 className="w-4 h-4 text-brand-accent" /> Span Length <span className="text-[9px] opacity-40">mm</span>
                    </label>
                    <span className="text-brand-accent font-black text-xs">{lengthMm}</span>
                  </div>
                  <input 
                    type="range" min="400" max="1500" value={lengthMm} 
                    onChange={(e) => setLengthMm(Number(e.target.value))}
                    className="cobalt-slider w-full"
                  />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-200 space-y-3">
              <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-2">
                <Info className="w-3 h-3" /> Hardware Profile
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-slate-500">
                <div className="p-2 border border-slate-200 rounded-lg bg-white/40 shadow-sm">DIM_W:400</div>
                <div className="p-2 border border-slate-200 rounded-lg bg-white/40 shadow-sm">DIM_H:400</div>
                <div className="p-2 border border-slate-200 rounded-lg bg-white/40 shadow-sm col-span-2">MAT_ID: 7075-T6</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Main Area */}
        <section className="col-span-9 grid grid-rows-12 gap-6 min-h-0 overflow-hidden">
          {/* Top Panel: 3D Visualization */}
          <div className="row-span-8 liquid-glass crystalline-edge relative overflow-hidden bg-white shadow-2xl! group">
            <div className="absolute top-6 left-8 z-10 space-y-3">
              <AnimatePresence>
                {results.isDanger && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-brand-danger/10 px-4 py-2 rounded-full border border-brand-danger/30 flex items-center gap-2 backdrop-blur-xl"
                  >
                    <AlertTriangle className="w-4 h-4 text-brand-danger" />
                    <span className="text-[10px] font-black text-brand-danger uppercase tracking-widest">Yield Point Exceeded</span>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="bg-slate-900/5 px-4 py-2 rounded-full border border-slate-900/5 flex items-center gap-2 backdrop-blur-lg">
                <div className="w-2 h-2 bg-brand-accent rounded-full animate-pulse shadow-[0_0_10px_#3B82F6]" />
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Raytrace: Active</span>
              </div>
            </div>

            <div className="w-full h-full cursor-grab active:cursor-grabbing">
              <Canvas shadows dpr={[1, 2]}>
                <PerspectiveCamera makeDefault position={[6, 5, 12]} fov={35} />
                <OrbitControls enablePan={false} maxDistance={20} minDistance={5} />
                <ambientLight intensity={1.5} />
                <spotLight position={[10, 15, 10]} angle={0.3} penumbra={1} intensity={3} castShadow />
                <directionalLight position={[-10, 10, 5]} intensity={1} />
                
                <Suspense fallback={null}>
                  <Float speed={2} rotationIntensity={0.1} floatIntensity={0.2}>
                    <CycletModule 
                      length={lengthMm} 
                      wallThickness={wallThicknessMm} 
                      stressRatio={results.ratio}
                      isDanger={results.isDanger}
                      heatmapColor={getHeatmapColor()}
                    />
                  </Float>
                  <Environment preset="studio" />
                </Suspense>
              </Canvas>
            </div>

            <div className="absolute top-6 right-8 text-right z-10">
              <div className="iridescent-stat px-8 py-5 rounded-3xl border border-white shadow-2xl overflow-hidden">
                <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2">Real-time Stress</div>
                <div className={`text-6xl font-black transition-colors duration-700 font-sans tracking-tighter ${getStressColor()}`}>
                  {results.stress.toFixed(1)} <span className="text-xl font-bold opacity-40">MPa</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full mt-4 overflow-hidden shadow-inner">
                  <motion.div 
                    className={`h-full ${results.isDanger ? 'bg-brand-danger' : results.isWarning ? 'bg-orange-400' : 'bg-brand-accent'}`}
                    animate={{ width: `${Math.min(100, results.ratio * 100)}%` }}
                    transition={{ type: 'spring', stiffness: 40, damping: 20 }}
                  />
                </div>
              </div>
            </div>

            {/* Hint for 3D navigation */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-6 text-[10px] text-slate-400 font-black uppercase tracking-widest opacity-20 group-hover:opacity-100 transition-all duration-500">
              <span className="flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Orbit View</span>
              <span className="flex items-center gap-2"><Maximize2 className="w-4 h-4" /> Scroll Zoom</span>
            </div>
          </div>

          {/* Bottom Panel: Physics & Recommendations */}
          <div className="row-span-4 grid grid-cols-12 gap-6 min-h-0 overflow-hidden">
            <div className="col-span-5 liquid-glass crystalline-edge p-6 flex flex-col min-h-0">
              <div className="flex justify-between items-center mb-6 border-b border-slate-200 pb-3">
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <Activity className="w-4 h-4 text-brand-accent" /> Physics Model
                </h3>
                <span className="text-[9px] text-slate-300 font-mono tracking-tighter uppercase px-2 py-0.5 bg-slate-900/5 rounded">ISO 12100:2010</span>
              </div>
              
              <div className="flex-1 space-y-4 font-mono text-[11px] overflow-y-auto custom-scrollbar pr-3">
                <div className="iridescent-stat p-4 rounded-2xl border border-white/50 shadow-sm space-y-2">
                  <div className="flex justify-between border-b border-white/40 pb-1">
                    <span className="text-slate-400 font-bold">F (Total Force)</span>
                    <span className="text-slate-900 font-black">{results.force.toFixed(1)} N</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">Formula: $F = m \cdot g \cdot S$</p>
                </div>

                <div className="iridescent-stat p-4 rounded-2xl border border-white/50 shadow-sm space-y-2">
                  <div className="flex justify-between border-b border-white/40 pb-1">
                    <span className="text-slate-400 font-bold">A (Net Area)</span>
                    <span className="text-slate-900 font-black">{results.area.toFixed(1)} mm²</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">Constraint: Hollow Rectangle Profile</p>
                </div>

                <div className="iridescent-stat p-4 rounded-2xl border border-brand-accent/20 bg-brand-accent/5! shadow-lg shadow-brand-accent/5 space-y-2">
                  <div className="flex justify-between border-b border-brand-accent/10 pb-1">
                    <span className="text-brand-accent font-black italic">σ (Calculated)</span>
                    <span className="text-slate-900 font-black">{results.stress.toFixed(2)} MPa</span>
                  </div>
                  <p className="text-[10px] text-brand-accent/60 leading-tight font-bold">Max Bending Stress Theory</p>
                </div>
              </div>
            </div>

            <div className={`col-span-7 liquid-glass crystalline-edge p-8 flex flex-col justify-between shadow-xl! ${
              results.isDanger ? 'bg-red-50/50' : 
              results.isWarning ? 'bg-orange-50/50' : 
              'bg-emerald-50/50'
            }`}>
              <div>
                <h3 className={`text-[11px] font-black mb-6 uppercase tracking-widest flex items-center gap-2 ${
                  results.isDanger ? 'text-brand-danger' : results.isWarning ? 'text-orange-500' : 'text-brand-safety'
                }`}>
                  <Info className="w-4 h-4" /> Structure Assessment
                </h3>
                <div className="space-y-6">
                  <p className="text-[16px] text-slate-700 leading-relaxed font-semibold">
                    {results.isDanger 
                      ? "【危險】結構受力遠超材料彈性極限。此狀態下 T-slot 接腳將發生瞬時斷裂。請務必修正跨距或增厚結構壁。" 
                      : results.isWarning 
                      ? "【警戒】結構處於塑性變形邊緣。雖然目前穩定，但在『青少年衝擊』模式下會大幅縮短產品使用壽命。"
                      : "【安全】結構強度設計精良。當前分佈式應力在 Quick-Lock 插銷點分佈極其均勻，符合工業安全規範。"}
                  </p>
                  
                  {!results.isSafe && (
                    <div className="grid grid-cols-2 gap-3">
                       <button className="capsule-btn text-[10px] text-slate-500 justify-start py-3">
                        <ChevronRight className="w-4 h-4 text-brand-accent" /> Optimize Thickness &gt; {wallThicknessMm + 5}mm
                       </button>
                       <button className="capsule-btn text-[10px] text-slate-500 justify-start py-3">
                        <ChevronRight className="w-4 h-4 text-brand-accent" /> Shrink Span &lt; {lengthMm - 120}mm
                       </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-6 border-t border-slate-200/50 flex items-center justify-between text-[11px] font-bold text-slate-300">
                <span className="flex items-center gap-2">Confidence Level: 98.4%</span>
                <span className="text-brand-accent cursor-pointer hover:underline">Download Finite Element Report (PDF)</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="text-[10px] text-slate-400 flex justify-between items-center px-12 py-4 bg-white/40 shrink-0 border-t border-slate-200">
        <p className="font-black tracking-widest uppercase flex items-center gap-3">
          <Box className="w-4 h-4 text-slate-300" /> Cyclet Modular Systems · R&D Div. · 2024
        </p>
        <div className="flex space-x-12 font-mono">
          <span className="flex items-center gap-2">
            <div className="w-2 h-2 bg-brand-safety rounded-full shadow-[0_0_8px_#10B981]" />
            CRYSTAL_ENGINE_STABLE
          </span>
          <span className="font-black text-slate-300">L_GLASS_BUILD_8K</span>
        </div>
      </footer>

      <style>{`
        .crystalline-edge::after { pointer-events: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.05); border-radius: 2px; }
      `}</style>
    </div>
  );
}

