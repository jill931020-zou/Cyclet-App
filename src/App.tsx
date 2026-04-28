/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useRef, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Text, Float, Html } from '@react-three/drei';
import * as THREE from 'three';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
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
  RotateCcw,
  Thermometer,
  User,
  Clock,
  Wind,
  ShieldCheck,
  Cpu,
  CornerDownRight,
  Compass
} from 'lucide-react';

// Constants
const G = 9.81; 
const E_MODULUS = 70e9; // 70 GPa for Aluminum/Tea-Fiber composite base
const THERMAL_EXPANSION = 23e-6; // 23 x 10^-6 /°C
const MATERIAL_STRENGTH_MPA = 400; 
const SAFETY_FACTOR = 1.5;
const MODULE_WIDTH_MM = 400;
const MODULE_HEIGHT_MM = 400;

enum SimulationTab {
  SCENARIO = 'SCENARIO',
  FORCES = 'FORCES',
  OPTIMIZATION = 'OPTIMIZATION'
}

enum EnvCondition {
  NORMAL = '正常',
  EXTREME = '極端'
}

enum ForceType {
  STATIC_VERTICAL = '垂直靜載重',
  DYNAMIC_IMPACT = '動態衝擊力',
  ECCENTRIC_LOAD = '偏心/懸臂受力',
  HORIZONTAL_SHEAR = '水平剪力',
  TORSIONAL_FORCE = '扭轉力矩',
  THERMAL_STRESS = '環境熱應力'
}

const FORCE_DESCRIPTIONS = {
  [ForceType.STATIC_VERTICAL]: '標準坐姿下的中心受力分析。',
  [ForceType.DYNAMIC_IMPACT]: '瞬間衝擊負荷 (Impulse) 模擬，如跳躍或重物落下。',
  [ForceType.ECCENTRIC_LOAD]: '單側邊緣受力導致的翻覆力矩及局部剪力。',
  [ForceType.HORIZONTAL_SHEAR]: '模組側向推擠或斜坡停靠時的側向負荷。',
  [ForceType.TORSIONAL_FORCE]: '地面不平整或非對稱支撐導致的接點扭曲。',
  [ForceType.THERMAL_STRESS]: '環境溫差導致的材料膨脹/收縮及其引發的內部應力。'
};

// 3D Model Component
function CycletModule({ length, wallThickness, stressRatio, isDanger, heatmapColor, forceType, criticalPoints, baseFormOptimized }: { 
  length: number, 
  wallThickness: number, 
  stressRatio: number,
  isDanger: boolean,
  heatmapColor: string,
  forceType: ForceType,
  criticalPoints: { x: number, y: number, z: number, label: string }[],
  baseFormOptimized: boolean
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
      <mesh position={[0, h/2 - t/2, 0]} rotation={[baseFormOptimized ? 0.02 : 0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[l, t, w]} />
        <meshStandardMaterial 
          color={isDanger ? '#ef4444' : '#ffffff'} 
          metalness={0.8} 
          roughness={0.2} 
          opacity={0.9}
          transparent
        />
      </mesh>
      <mesh position={[0, -h/2 + t/2, 0]} castShadow receiveShadow>
        <boxGeometry args={[l, t, w]} />
        <meshStandardMaterial 
          color={isDanger ? '#ef4444' : '#ffffff'} 
          metalness={0.8} 
          roughness={0.2}
          opacity={0.9}
          transparent
        />
      </mesh>

      {/* Side walls */}
      <mesh position={[0, 0, w/2 - t/2]} castShadow>
        <boxGeometry args={[l, h, t]} />
        <meshStandardMaterial 
          color="#ffffff" 
          transparent 
          opacity={0.3} 
          metalness={0.5}
          roughness={0.1}
        />
      </mesh>
      <mesh position={[0, 0, -w/2 + t/2]} castShadow>
        <boxGeometry args={[l, h, t]} />
        <meshStandardMaterial 
          color="#ffffff" 
          transparent 
          opacity={0.3} 
          metalness={0.5}
          roughness={0.1}
        />
      </mesh>

      {/* Anti-slip Base Visual */}
      {baseFormOptimized && (
        <mesh position={[0, -h/2, 0]}>
          <boxGeometry args={[l, 0.05, w]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} roughness={0.9} />
        </mesh>
      )}

      {/* Internal Ribs (Enhanced Visualization) */}
      <group>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.05, h - 2*t, w - 2*t]} />
          <meshStandardMaterial color="#3b82f6" metalness={0.9} roughness={0.1} />
        </mesh>
        <mesh position={[l * 0.25, 0, 0]}>
          <boxGeometry args={[0.02, h - 2*t, w - 2*t]} />
          <meshStandardMaterial color="#3b82f6" opacity={0.5} transparent />
        </mesh>
        <mesh position={[-l * 0.25, 0, 0]}>
          <boxGeometry args={[0.02, h - 2*t, w - 2*t]} />
          <meshStandardMaterial color="#3b82f6" opacity={0.5} transparent />
        </mesh>
      </group>

      {/* Force Heatmap Indicator */}
      <group>
        {forceType === ForceType.STATIC_VERTICAL && (
          <mesh position={[0, h/2, 0]}>
            <sphereGeometry args={[Math.min(1.2, stressRatio * 0.8), 32, 32]} />
            <meshStandardMaterial color={heatmapColor} transparent opacity={0.6} emissive={heatmapColor} emissiveIntensity={0.5} />
          </mesh>
        )}
        {forceType === ForceType.ECCENTRIC_LOAD && (
          <mesh position={[l/2 - 0.5, h/2, w/2 - 0.5]}>
            <sphereGeometry args={[Math.min(1.2, stressRatio * 0.8), 32, 32]} />
            <meshStandardMaterial color={heatmapColor} transparent opacity={0.6} emissive={heatmapColor} emissiveIntensity={0.5} />
          </mesh>
        )}
      </group>

      {/* Critical Points Labels */}
      {criticalPoints.map((pt, i) => (
        <group key={i} position={[pt.x, pt.y, pt.z]}>
          <mesh>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshBasicMaterial color="#ef4444" />
          </mesh>
          <Html distanceFactor={10}>
            <div className="bg-red-500/90 text-white text-[8px] font-black px-1.5 py-0.5 rounded whitespace-nowrap shadow-lg">
              {pt.label}
            </div>
          </Html>
        </group>
      ))}

      {/* Quick-Lock T-Pins */}
      <group position={[-l/2, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI/2]}>
          <cylinderGeometry args={[0.15, 0.15, 0.4]} />
          <meshStandardMaterial color={isDanger ? '#ef4444' : '#3b82f6'} metalness={1} roughness={0} />
        </mesh>
      </group>
      <group position={[l/2, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI/2]}>
          <cylinderGeometry args={[0.15, 0.15, 0.4]} />
          <meshStandardMaterial color={isDanger ? '#ef4444' : '#3b82f6'} metalness={1} roughness={0} />
        </mesh>
      </group>

      {/* Floor reflection proxy */}
      <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -h/2 - 0.5, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#f8fafc" transparent opacity={0.05} />
      </mesh>
    </group>
  );
}

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<SimulationTab>(SimulationTab.SCENARIO);

  // States: Scenario Engine (5W1H)
  const [scenarioEnv, setScenarioEnv] = useState<EnvCondition>(EnvCondition.NORMAL);
  const [userAge, setUserAge] = useState(25);
  const [freqDays, setFreqDays] = useState(5);
  const [tempCelsius, setTempCelsius] = useState(24);

  // States: Physical Params
  const [loadKg, setLoadKg] = useState(70);
  const [wallThicknessMm, setWallThicknessMm] = useState(15);
  const [lengthMm, setLengthMm] = useState(800);
  const [forceType, setForceType] = useState<ForceType>(ForceType.STATIC_VERTICAL);

  // States: Optimization
  const [ribbingOptimized, setRibbingOptimized] = useState(false);
  const [teaFiberRatio, setTeaFiberRatio] = useState(30); // 20-40%
  const [baseFormOptimized, setBaseFormOptimized] = useState(false);

  // Advanced Calculations
  const results = useMemo(() => {
    const L = lengthMm / 1000;
    const t = wallThicknessMm / 1000;
    const W = MODULE_WIDTH_MM / 1000;
    const H = MODULE_HEIGHT_MM / 1000;
    const Area = (W * H) - (W - 2 * t) * (H - 2 * t);
    
    let F = loadKg * G * SAFETY_FACTOR;
    let sigma_max = 0;
    let criticalNodes: { x: number, y: number, z: number, label: string }[] = [];
    const l_units = lengthMm / 100;
    const h_units = MODULE_HEIGHT_MM / 100;

    // Base Moment of Inertia
    const B_inner = W - 2 * t;
    const H_inner = H - 2 * t;
    const I = (W * Math.pow(H, 3) - B_inner * Math.pow(H_inner, 3)) / 12;
    const y = H / 2;

    const ribFactor = ribbingOptimized ? 0.75 : 1.0;

    switch (forceType) {
      case ForceType.STATIC_VERTICAL: {
        const M = (F * L) / 4;
        sigma_max = (M * y) / I;
        criticalNodes.push({ x: 0, y: h_units/2, z: 0, label: 'BENDING_PEAK' });
        break;
      }
      case ForceType.DYNAMIC_IMPACT: {
        const impactFactor = scenarioEnv === EnvCondition.EXTREME ? 3.5 : 2.5;
        const F_impact = F * impactFactor;
        const M = (F_impact * L) / 4;
        sigma_max = (M * y) / I;
        criticalNodes.push({ x: 0, y: h_units/2, z: 0, label: 'IMPULSE_SHOCK' });
        break;
      }
      case ForceType.ECCENTRIC_LOAD: {
        // Eccentricity e = W/3
        const e = W / 3;
        const M_eccentric = F * e;
        const M_bending = (F * L) / 4;
        sigma_max = ((M_bending * y) / I) + (M_eccentric * (W/2) / I); // Simplified superposition
        criticalNodes.push({ x: l_units/2, y: h_units/2, z: (MODULE_WIDTH_MM/200), label: 'EDGE_TORSION' });
        break;
      }
      case ForceType.HORIZONTAL_SHEAR: {
        const lateralForce = F * 0.4;
        const tau = (lateralForce) / Area;
        sigma_max = tau * 1.5; // Shear stress to equivalent principal
        criticalNodes.push({ x: -l_units/2, y: 0, z: 0, label: 'SHEAR_PLANE' });
        break;
      }
      case ForceType.TORSIONAL_FORCE: {
        const torque = F * 0.15; // Assumption based on misalignment
        const J = (W * H * (W * W + H * H) - B_inner * H_inner * (B_inner * B_inner + H_inner * H_inner)) / 12;
        const r_max = Math.sqrt(Math.pow(W / 2, 2) + Math.pow(H / 2, 2));
        sigma_max = (torque * r_max) / J;
        criticalNodes.push({ x: -l_units/2, y: h_units/2, z: (MODULE_WIDTH_MM/200), label: 'JOINT_TWIST' });
        break;
      }
      case ForceType.THERMAL_STRESS: {
        const dT = Math.abs(tempCelsius - 20); // Relative to 20C assembly
        sigma_max = E_MODULUS * THERMAL_EXPANSION * dT * (1 - (teaFiberRatio / 100) * 0.3); // Fiber reduces expansion effectively
        criticalNodes.push({ x: l_units/2, y: 0, z: 0, label: 'EXPANSION_NODE' });
        break;
      }
    }

    sigma_max *= ribFactor;
    const stressMpa = sigma_max / 1e6;
    const ratio = stressMpa / MATERIAL_STRENGTH_MPA;

    return {
      force: F,
      stress: stressMpa,
      area: Area * 1e6,
      ratio: ratio,
      isSafe: ratio < 0.6,
      isWarning: ratio >= 0.6 && ratio < 1.0,
      isDanger: ratio >= 1.0,
      nodes: criticalNodes
    };
  }, [loadKg, wallThicknessMm, lengthMm, forceType, scenarioEnv, ribbingOptimized, tempCelsius, teaFiberRatio]);

  const physicsMarkdown = useMemo(() => {
    switch (forceType) {
      case ForceType.STATIC_VERTICAL:
        return `### 垂直靜載重 (Static Vertical)
算式: $\\sigma = \\frac{M \\cdot y}{I}$
- $F = m \\cdot g \\cdot S$: 總受量 (N)
- $M = \\frac{F \\cdot L}{4}$: 中心彎曲力矩
- 應力 $\\sigma$ 單位: MPa
- $y = H/2$: 距中性軸距離`;
      case ForceType.DYNAMIC_IMPACT:
        return `### 動態衝擊力 (Dynamic Impact)
算式: $F_{dyn} = F_{stat} \\cdot K$
- $K$: 衝擊係數 (2.5 - 3.5)
- 反映瞬間跳躍或重物撞擊動能
- 單位: 牛頓 (N)`;
      case ForceType.ECCENTRIC_LOAD:
        return `### 偏心受力 (Eccentric)
算式: $\\sigma_{total} = \\sigma_{bend} + \\frac{M_e \\cdot c}{I}$
- $M_e = F \\cdot e$: 偏心力矩
- 模擬使用者坐在板凳邊緣的情境
- 容易導致 Quick-Lock 插銷剪應力集中`;
      case ForceType.HORIZONTAL_SHEAR:
        return `### 水平剪力 (Shear)
算式: $\\tau = \\frac{V}{A}$
- $V$: 平行截面作用力
- 評估模組在移動推擠時的結構變位
- 關鍵點: $A$ (有效截面積)`;
      case ForceType.TORSIONAL_FORCE:
        return `### 扭轉力矩 (Torsion)
算式: $\\tau = \\frac{T \\cdot r}{J}$
- $T$: 扭矩 (Torque)
- $J$: 極慣性矩 (Polar Moment)
- 模擬地面不平導致的支撐腳不同步扭曲`;
      case ForceType.THERMAL_STRESS:
        return `### 環境熱應力 (Thermal)
算式: $\\sigma_{th} = E \\alpha \\Delta T$
- $\\alpha$: 熱膨脹係數
- $\\Delta T$: 溫差變化
- 茶葉纖維複合材料 (Tea Fiber) 可有效降低 $\\alpha$`;
      default:
        return '';
    }
  }, [forceType]);

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
          <div className="liquid-glass crystalline-edge p-2 flex shrink-0 gap-1 bg-white/20">
            {Object.values(SimulationTab).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${
                  activeTab === tab ? 'bg-brand-accent text-white shadow-lg' : 'text-slate-400 hover:bg-white/40'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="liquid-glass crystalline-edge p-6 flex-1 flex flex-col space-y-8 overflow-y-auto custom-scrollbar">
            {activeTab === SimulationTab.SCENARIO && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-brand-accent text-white rounded-xl shadow-lg shadow-brand-accent/20">
                    <Compass className="w-4 h-4" />
                  </div>
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Scenario Engine</h2>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block border-l-4 border-brand-accent pl-3">Environment State</label>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.values(EnvCondition).map(cond => (
                      <button
                        key={cond}
                        onClick={() => setScenarioEnv(cond)}
                        className={`capsule-btn text-[11px] font-bold ${
                          scenarioEnv === cond 
                          ? 'bg-slate-900 text-white! border-slate-900 shadow-xl' 
                          : 'text-slate-500 hover:bg-white/60'
                        }`}
                      >
                        {cond}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-6 pt-6 border-t border-slate-200">
                  <div className="group">
                    <div className="flex justify-between mb-3 font-black text-slate-500 text-[10px] uppercase">
                      <span className="flex items-center gap-2"><User className="w-3 h-3" /> Target Age: <span className="text-brand-accent">{userAge}</span></span>
                    </div>
                    <input type="range" min="3" max="80" value={userAge} onChange={e => setUserAge(Number(e.target.value))} className="cobalt-slider w-full" />
                  </div>
                  <div className="group">
                    <div className="flex justify-between mb-3 font-black text-slate-500 text-[10px] uppercase">
                      <span className="flex items-center gap-2"><Clock className="w-3 h-3" /> Frequency (p/w): <span className="text-brand-accent">{freqDays}</span></span>
                    </div>
                    <input type="range" min="1" max="7" value={freqDays} onChange={e => setFreqDays(Number(e.target.value))} className="cobalt-slider w-full" />
                  </div>
                  <div className="group">
                    <div className="flex justify-between mb-3 font-black text-slate-500 text-[10px] uppercase">
                      <span className="flex items-center gap-2"><Thermometer className="w-3 h-3" /> Temp: <span className="text-brand-accent">{tempCelsius}°C</span></span>
                    </div>
                    <input type="range" min="-10" max="55" value={tempCelsius} onChange={e => setTempCelsius(Number(e.target.value))} className="cobalt-slider w-full" />
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === SimulationTab.FORCES && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-brand-accent text-white rounded-xl shadow-lg shadow-brand-accent/20">
                    <Activity className="w-4 h-4" />
                  </div>
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">6-Force Analysis</h2>
                </div>

                <div className="space-y-3">
                  {Object.values(ForceType).map(f => (
                    <button
                      key={f}
                      onClick={() => setForceType(f)}
                      className={`w-full text-left p-3 rounded-2xl border transition-all ${
                        forceType === f 
                        ? 'bg-brand-accent/5 border-brand-accent/30 shadow-sm' 
                        : 'border-transparent hover:bg-black/5 text-slate-500'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[11px] font-black ${forceType === f ? 'text-brand-accent' : ''}`}>{f}</span>
                        {forceType === f && <div className="w-1.5 h-1.5 bg-brand-accent rounded-full animate-ping" />}
                      </div>
                      {forceType === f && <p className="text-[9px] text-slate-400 leading-tight italic">{FORCE_DESCRIPTIONS[f]}</p>}
                    </button>
                  ))}
                </div>

                <div className="space-y-6 pt-6 border-t border-slate-200">
                  <div className="group">
                    <div className="flex justify-between mb-3 font-black text-slate-500 text-[10px] uppercase">
                      <span><Weight className="inline w-3 h-3 mr-1" /> Load: {loadKg}kg</span>
                    </div>
                    <input type="range" min="20" max="250" value={loadKg} onChange={e => setLoadKg(Number(e.target.value))} className="cobalt-slider w-full" />
                  </div>
                  <div className="group">
                    <div className="flex justify-between mb-3 font-black text-slate-500 text-[10px] uppercase">
                      <span><Layers className="inline w-3 h-3 mr-1" /> Wall: {wallThicknessMm}mm</span>
                    </div>
                    <input type="range" min="5" max="40" value={wallThicknessMm} onChange={e => setWallThicknessMm(Number(e.target.value))} className="cobalt-slider w-full" />
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === SimulationTab.OPTIMIZATION && (
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/20">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">Optimization</h2>
                </div>

                <div className="space-y-6">
                  <div className="p-4 bg-white/40 border border-white/60 rounded-2xl space-y-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-slate-500">T-slot Ribbing</span>
                      <input type="checkbox" checked={ribbingOptimized} onChange={e => setRibbingOptimized(e.target.checked)} className="w-4 h-4 accent-brand-accent cursor-pointer" />
                    </div>
                    <p className="text-[9px] text-slate-400 leading-tight">內部加強肋 (Ribbing) 幾何優化，提升抗扭強度 25%。</p>
                  </div>

                  <div className="p-4 bg-white/40 border border-white/60 rounded-2xl space-y-3 shadow-sm">
                    <div className="flex justify-between font-black text-slate-500 text-[10px] uppercase">
                      <span>Tea Fiber Ratio: <span className="text-brand-accent">{teaFiberRatio}%</span></span>
                    </div>
                    <input type="range" min="20" max="40" value={teaFiberRatio} onChange={e => setTeaFiberRatio(Number(e.target.value))} className="cobalt-slider w-full" />
                    <p className="text-[9px] text-slate-400 leading-tight">複合茶葉纖維比例優化，調整熱應力。 (20-40%)</p>
                  </div>

                  <div className="p-4 bg-white/40 border border-white/60 rounded-2xl space-y-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-slate-500">Form Verification</span>
                      <input type="checkbox" checked={baseFormOptimized} onChange={e => setBaseFormOptimized(e.target.checked)} className="w-4 h-4 accent-brand-accent cursor-pointer" />
                    </div>
                    <p className="text-[9px] text-slate-400 leading-tight">座面 1.5% 排水斜度與防滑底座幾何驗證。</p>
                  </div>
                </div>
              </motion.div>
            )}
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
                      forceType={forceType}
                      criticalPoints={results.nodes}
                      baseFormOptimized={baseFormOptimized}
                    />
                  </Float>
                  <Environment preset="studio" />
                </Suspense>
              </Canvas>
            </div>

            <div className="absolute top-6 right-8 text-right z-10 max-w-[240px]">
              <div className="iridescent-stat px-6 py-5 rounded-3xl border border-white shadow-2xl overflow-hidden">
                <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2 flex items-center justify-end gap-2">
                  <Cpu className="w-3 h-3" /> Real-time Stress
                </div>
                <div className={`text-5xl font-black transition-colors duration-700 font-sans tracking-tighter ${getStressColor()}`}>
                  {results.stress.toFixed(1)} <span className="text-xl font-bold opacity-40">MPa</span>
                </div>
                <div className="text-[9px] text-slate-400 font-black uppercase mt-1">({forceType})</div>
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
                  <Activity className="w-4 h-4 text-brand-accent" /> Physics Explainer
                </h3>
                <span className="text-[9px] text-slate-300 font-mono tracking-tighter uppercase px-2 py-0.5 bg-slate-900/5 rounded">ENGINE: V3.5-PRO</span>
              </div>
              
              <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-3">
                <div className="iridescent-stat p-5 rounded-2xl border border-white shadow-inner bg-white/20">
                  <article className="prose prose-slate prose-sm max-w-none text-[12px]">
                    <div className="markdown-body">
                      <ReactMarkdown 
                        remarkPlugins={[remarkMath]} 
                        rehypePlugins={[rehypeKatex]}
                      >
                        {physicsMarkdown}
                      </ReactMarkdown>
                    </div>
                  </article>
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
                  <Zap className="w-4 h-4" /> Design Optimization Report
                </h3>
                <div className="space-y-6">
                  <div className="text-[16px] text-slate-700 leading-relaxed font-semibold italic flex items-start gap-3">
                    <CornerDownRight className="w-5 h-5 shrink-0 mt-1 opacity-40" />
                    {results.isDanger 
                      ? "【致命警告】目前的幾何參數在當前情境下無法負荷。結構插銷處面臨斷裂風險。" 
                      : results.isWarning 
                      ? "【系統警戒】結構餘裕不足，產品長期耐用度 (Fatigue life) 將因極端環境溫差或頻繁衝擊大幅衰減。"
                      : "【安全認證】當前設計工學符合標準。分佈應力均勻，適合產品規模化量產。"}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-white/60 border border-white/80 rounded-2xl shadow-sm space-y-2">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Structural Strategy</span>
                       <p className="text-[11px] text-slate-600 font-medium">
                         {results.isDanger ? '增加內肋厚度 (+50%) 並改採連續焊縫。' : '當前 T-slot 幾何可滿足 1.5x 安全係數。'}
                       </p>
                    </div>
                    <div className="p-4 bg-white/60 border border-white/80 rounded-2xl shadow-sm space-y-2">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Material Strategy</span>
                       <p className="text-[11px] text-slate-600 font-medium">
                         茶葉纖維比例穩定在 {teaFiberRatio}%，{tempCelsius > 40 ? '適合高溫抗熱。' : '具備良好衝擊韌性。'}
                       </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-200/50 flex items-center justify-between text-[11px] font-bold">
                <div className="flex gap-4">
                  <span className="text-slate-400">Environment: {scenarioEnv}</span>
                  <span className="text-slate-400">Age: {userAge}y</span>
                </div>
                <div className="flex gap-2">
                  <span className="px-3 py-1 bg-brand-accent/10 text-brand-accent rounded-full border border-brand-accent/20 cursor-pointer hover:bg-brand-accent/20 transition-all">EXPAND FEM MAP</span>
                </div>
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
        .markdown-body h3 { 
          font-size: 14px; 
          font-weight: 900; 
          margin-bottom: 8px; 
          letter-spacing: -0.025em;
          text-transform: uppercase;
          color: #334155;
        }
        .markdown-body ul { 
          list-style: none; 
          padding: 0; 
          margin: 0;
          font-size: 11px;
          color: #64748b;
        }
        .markdown-body li { 
          margin-bottom: 4px;
          position: relative;
          padding-left: 12px;
        }
        .markdown-body li::before {
          content: '•';
          position: absolute;
          left: 0;
          color: #3b82f6;
        }
        .katex { font-size: 1.1em; }
      `}</style>
    </div>
  );
}

