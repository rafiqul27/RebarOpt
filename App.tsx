
import React, { useState, useRef, useEffect } from 'react';
import { Layout } from './components/Layout';
import RunVisualizer from './components/RunVisualizer';
import { HelpGuide } from './components/HelpGuide';
import { runSolver } from './utils/solver';
import { exportProjectToExcel, importProjectFromExcel, generatePDFReport } from './utils/exportUtils';
import { 
  ProjectSettings, 
  StockCatalogItem, 
  LapRule, 
  BarRun, 
  OptimizationResult, 
  MemberType, 
  LapCase,
  SpliceZone,
  DirectPiece,
  OffcutInventoryItem
} from './types';
import { DEFAULT_SETTINGS, INITIAL_STOCK, INITIAL_LAP_RULES, SAMPLE_RUNS } from './constants';
import { Plus, Trash2, PlayCircle, Download, Upload, FileSpreadsheet, AlertTriangle } from 'lucide-react';

// FILTERED OPTIONS
const MEMBER_TYPE_OPTIONS = [
  { label: 'Column (Vertical)', type: MemberType.COLUMN, lap: LapCase.COLUMN_VERTICAL },
  { label: 'Beam (Top)', type: MemberType.BEAM, lap: LapCase.BEAM_TOP },
  { label: 'Beam (Bottom)', type: MemberType.BEAM, lap: LapCase.BEAM_BOTTOM },
];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('settings');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // App State
  const [settings, setSettings] = useState<ProjectSettings>(DEFAULT_SETTINGS);
  const [stock, setStock] = useState<StockCatalogItem[]>(INITIAL_STOCK);
  const [laps, setLaps] = useState<LapRule[]>(INITIAL_LAP_RULES);
  const [runs, setRuns] = useState<BarRun[]>(SAMPLE_RUNS);
  const [directPieces, setDirectPieces] = useState<DirectPiece[]>([]);
  // New State for Inventory
  const [inventory, setInventory] = useState<OffcutInventoryItem[]>([]);
  
  const [results, setResults] = useState<OptimizationResult | null>(null);
  const [isSolving, setIsSolving] = useState(false);

  // Form States
  const [newStock, setNewStock] = useState({ dia: 10, length: 12000 });
  const [newRule, setNewRule] = useState({ dia: 10, lapCase: LapCase.COLUMN_VERTICAL, lengthMm: 500 });
  const [newInventory, setNewInventory] = useState({ dia: 10, length: 2000, qty: 1 });
  
  // Run State with combined structure index
  const [newRun, setNewRun] = useState<{
      barMark: string;
      memberTypeIndex: number; // Index into MEMBER_TYPE_OPTIONS
      dia: number;
      qty: number;
      geometry: string;
  }>({
      barMark: '',
      memberTypeIndex: 0,
      dia: 20,
      qty: 1,
      geometry: ''
  });

  const [newDirect, setNewDirect] = useState<{
      barMark: string;
      dia: number;
      length: number;
      qty: number;
  }>({
      barMark: '',
      dia: 10,
      length: 1500,
      qty: 1
  });

  // Re-calculate zones if settings change (e.g. beamDepthMm)
  useEffect(() => {
    setRuns(prevRuns => {
        return prevRuns.map(r => {
             const { totalLength, zones } = calculateZones(
                  r.geometryInput, 
                  r.memberType, 
                  r.lapCase, 
                  settings
              );
              return { ...r, totalLengthMm: totalLength, allowedZones: zones };
        });
    });
  }, [settings.beamDepthMm]);

  // --- ACTIONS ---

  const handleSolve = async () => {
    setIsSolving(true);
    setTimeout(async () => {
        try {
            const res = await runSolver(runs, directPieces, settings, stock, laps, inventory);
            setResults(res);
            setActiveTab('reports');
        } catch (e: any) {
            console.error(e);
            alert(`Optimization failed: ${e.message}`);
        } finally {
            setIsSolving(false);
        }
    }, 50);
  };

  const handleExportExcel = () => {
      // Pass results state to export function
      exportProjectToExcel(settings, stock, laps, runs, directPieces, inventory, results);
  };

  const handleImportClick = () => {
      fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          try {
              const data = await importProjectFromExcel(e.target.files[0]);
              if (data.settings) setSettings(data.settings);
              if (data.stock) setStock(data.stock);
              if (data.laps) setLaps(data.laps);
              if (data.directPieces) setDirectPieces(data.directPieces);
              if (data.inventory) setInventory(data.inventory);
              
              if (data.runs) {
                  const rehydratedRuns = data.runs.map(r => {
                      let lc = r.lapCase || (r.memberType === MemberType.COLUMN ? LapCase.COLUMN_VERTICAL : LapCase.BEAM_TOP);
                      const { totalLength, zones } = calculateZones(
                          r.geometryInput, 
                          r.memberType, 
                          lc, 
                          data.settings || settings
                      );
                      return { ...r, totalLengthMm: totalLength, allowedZones: zones, lapCase: lc };
                  });
                  setRuns(rehydratedRuns);
              }
              alert("Project imported successfully!");
          } catch (err) {
              console.error(err);
              alert("Failed to import project.");
          }
      }
  };

  const handleExportPDF = () => {
      if (!results) return;
      generatePDFReport(results, settings.projectName);
  };

  // --- LOGIC HELPERS ---

  const calculateZones = (input: string, type: MemberType, lapCase: LapCase, projSettings: ProjectSettings): { totalLength: number, zones: SpliceZone[] } => {
      const parts = input.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
      if (parts.length === 0) return { totalLength: 0, zones: [] };

      const zones: SpliceZone[] = [];
      let currentDist = 0;
      const totalLength = parts.reduce((a, b) => a + b, 0);
      const h = projSettings.beamDepthMm;

      parts.forEach(segmentLen => {
          let hasAddedZone = false;

          if (type === MemberType.COLUMN && lapCase === LapCase.COLUMN_VERTICAL) {
              // 3. Column: Middle Half (h/4 to 3h/4)
              const start = currentDist + (segmentLen * 0.25);
              const end = currentDist + (segmentLen * 0.75);
              zones.push({ startMm: start, endMm: end });
              hasAddedZone = true;

          } else if (lapCase === LapCase.BEAM_TOP) {
              // 1. Beam Top: Middle Third (l/3 to 2l/3)
              const start = currentDist + (segmentLen / 3);
              const end = currentDist + (2 * segmentLen / 3);
              zones.push({ startMm: start, endMm: end });
              hasAddedZone = true;

          } else if (lapCase === LapCase.BEAM_BOTTOM) {
              // 2. Beam Bottom: 2h from support to l/3 (Two zones per span)
              // Handle SHORT SPANS: If 2h > L/3, the zones are invalid.
              // Strict interpretation: No zone.
              
              // Zone 1: Left side
              const z1Start = currentDist + (2 * h);
              const z1End = currentDist + (segmentLen / 3);
              
              if (z1End > z1Start) {
                  zones.push({ startMm: z1Start, endMm: z1End });
                  hasAddedZone = true;
              }

              // Zone 2: Right side
              const z2Start = currentDist + (2 * segmentLen / 3);
              const z2End = currentDist + segmentLen - (2 * h);
              
              if (z2End > z2Start) {
                  zones.push({ startMm: z2Start, endMm: z2End });
                  hasAddedZone = true;
              }
          } 
          
          if (!hasAddedZone && lapCase !== LapCase.BEAM_BOTTOM) {
              // Fallback logic for NON-BEAM_BOTTOM cases (like generic runs or very short columns)
              // We do NOT add fallback for Beam Bottom if it failed constraints, per code standards (it should be zero)
              const mid = currentDist + (segmentLen / 2);
              zones.push({
                  startMm: Math.max(currentDist, mid - 200),
                  endMm: Math.min(currentDist + segmentLen, mid + 200)
              });
          }
          currentDist += segmentLen;
      });

      return { totalLength, zones };
  };

  const validateRunInput = () => {
      if (!newRun.barMark.trim()) {
          alert("Bar Mark cannot be empty.");
          return false;
      }
      if (newRun.dia <= 0) {
          alert("Diameter must be a positive number.");
          return false;
      }
      if (newRun.qty <= 0) {
          alert("Quantity must be a positive number.");
          return false;
      }
      const geoParts = newRun.geometry.split(',').map(s => s.trim());
      if (newRun.geometry.trim() === '' || geoParts.some(p => isNaN(parseFloat(p)) || parseFloat(p) <= 0)) {
          alert("Geometry must be a comma-separated list of positive numbers.");
          return false;
      }
      
      const normalizedMark = newRun.barMark.trim();
      if (runs.some(r => r.barMark.toLowerCase() === normalizedMark.toLowerCase())) {
          alert(`Bar Mark "${normalizedMark}" already exists. Please use a unique identifier.`);
          return false;
      }
      return true;
  };

  const handleAddRun = () => {
      if (!validateRunInput()) return;
      
      const structure = MEMBER_TYPE_OPTIONS[newRun.memberTypeIndex];
      const normalizedMark = newRun.barMark.trim();

      const { totalLength, zones } = calculateZones(
          newRun.geometry, 
          structure.type, 
          structure.lap, 
          settings
      );

      const run: BarRun = {
          id: `R${Date.now()}`,
          barMark: normalizedMark,
          memberType: structure.type,
          dia: newRun.dia,
          qtyParallel: newRun.qty,
          lapCase: structure.lap,
          geometryInput: newRun.geometry,
          totalLengthMm: totalLength,
          allowedZones: zones
      };

      setRuns([...runs, run]);
      setNewRun({ ...newRun, barMark: '', geometry: '' });
  };

  const handleDeleteRun = (id: string) => {
      setRuns(runs.filter(r => r.id !== id));
  };

  const handleAddDirectPiece = () => {
      if (!newDirect.barMark) return alert("Bar Mark is required");
      
      const piece: DirectPiece = {
          id: `D${Date.now()}`,
          barMark: newDirect.barMark,
          dia: newDirect.dia,
          lengthMm: newDirect.length,
          qty: newDirect.qty
      };
      
      setDirectPieces([...directPieces, piece]);
      setNewDirect({...newDirect, barMark: ''});
  };

  const handleDeleteDirect = (id: string) => {
      setDirectPieces(directPieces.filter(d => d.id !== id));
  };

  // --- UI CONSTANTS ---
  const inputClass = "w-full border border-gray-300 dark:border-slate-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-shadow";
  const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";
  const btnClass = "bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm font-medium flex items-center justify-center transition-colors h-[38px]";

  // --- RENDERERS ---

  const renderSettings = () => (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 space-y-6 transition-colors duration-200">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Project Parameters</h3>
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx" />
              <button onClick={handleImportClick} className="flex-1 md:flex-none flex items-center justify-center px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-200 dark:hover:bg-slate-600 text-sm font-medium border border-transparent dark:border-slate-600 transition-colors">
                  <Upload size={16} className="mr-2" /> Import
              </button>
              <button onClick={handleExportExcel} className="flex-1 md:flex-none flex items-center justify-center px-4 py-2 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md hover:bg-green-100 dark:hover:bg-green-900/50 text-sm font-medium border border-green-200 dark:border-green-800 transition-colors">
                  <FileSpreadsheet size={16} className="mr-2" /> Export
              </button>
          </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div>
          <label className={labelClass}>Project Name</label>
          <input 
            type="text" 
            value={settings.projectName}
            onChange={(e) => setSettings({...settings, projectName: e.target.value})}
            className={inputClass}
          />
        </div>
        <div>
            <label className={labelClass}>Inventory Strategy</label>
            <select
                value={settings.inventoryStrategy || 'SEQUENTIAL'}
                onChange={(e) => setSettings({...settings, inventoryStrategy: e.target.value as any})}
                className={inputClass}
            >
                <option value="SEQUENTIAL">Use Inventory First (Fast)</option>
                <option value="MIXED">Mix Inventory & New Stock (Best Fit)</option>
            </select>
        </div>
        <div>
            <label className={labelClass}>Optimization Level</label>
            <select
                value={settings.optimizationLevel || 'BALANCED'}
                onChange={(e) => setSettings({...settings, optimizationLevel: e.target.value as any})}
                className={inputClass}
            >
                <option value="FAST">Fast (Greedy only)</option>
                <option value="BALANCED">Balanced (Monte Carlo)</option>
                <option value="DEEP">Deep (Extensive Search)</option>
            </select>
        </div>
        <div>
          <label className={labelClass}>Rounding Step (mm)</label>
          <input 
            type="number" 
            value={settings.roundingStepMm}
            onChange={(e) => setSettings({...settings, roundingStepMm: parseInt(e.target.value)})}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Kerf per Cut (mm)</label>
          <input 
            type="number" 
            value={settings.kerfMm}
            onChange={(e) => setSettings({...settings, kerfMm: parseInt(e.target.value)})}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Min. Leftover to Keep (mm)</label>
          <input 
            type="number" 
            value={settings.minLeftoverMm}
            onChange={(e) => setSettings({...settings, minLeftoverMm: parseInt(e.target.value)})}
            className={inputClass}
          />
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-slate-700 pt-6">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Splice Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             <div>
                <label className="block text-sm font-medium text-gray-400 dark:text-gray-500 mb-1">Splice Class (Disabled)</label>
                <input 
                    type="text" 
                    value="Class B (100% Spliced)"
                    disabled
                    className="w-full border border-gray-200 dark:border-slate-700 rounded-md px-3 py-2 text-sm bg-gray-100 dark:bg-slate-800 text-gray-500 cursor-not-allowed"
                />
             </div>
             <div>
                <label className={labelClass}>Beam Depth 'h' (mm)</label>
                <input 
                    type="number" 
                    value={settings.beamDepthMm}
                    onChange={(e) => setSettings({...settings, beamDepthMm: parseInt(e.target.value)})}
                    className={inputClass}
                    placeholder="e.g. 600"
                />
                <p className="text-xs text-gray-500 mt-1">Used for Beam Bottom splice zones (2h rule).</p>
             </div>
          </div>
      </div>
    </div>
  );

  const renderStockAndRules = () => (
      <div className="space-y-8">
          {/* STOCK CATALOG */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 transition-colors">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">New Stock Catalog</h3>
              
              <div className="flex flex-wrap items-end gap-4 mb-6 p-4 bg-gray-50 dark:bg-slate-700/50 rounded border dark:border-slate-600">
                  <div className="w-full sm:w-32">
                      <label className={labelClass}>Diameter (mm)</label>
                      <input 
                        type="number" 
                        value={newStock.dia}
                        onChange={e => setNewStock({...newStock, dia: parseInt(e.target.value)})}
                        className={inputClass}
                      />
                  </div>
                  <div className="w-full sm:w-48">
                      <label className={labelClass}>Length (mm)</label>
                      <input 
                        type="number" 
                        value={newStock.length}
                        onChange={e => setNewStock({...newStock, length: parseInt(e.target.value)})}
                        className={inputClass}
                      />
                  </div>
                  <button 
                    onClick={() => {
                        const existing = stock.find(s => s.dia === newStock.dia);
                        if (existing) {
                            if (!existing.stockLengths.includes(newStock.length)) {
                                const newStockList = stock.map(s => s.dia === newStock.dia ? {...s, stockLengths: [...s.stockLengths, newStock.length].sort((a,b)=>b-a)} : s);
                                setStock(newStockList);
                            }
                        } else {
                            setStock([...stock, { dia: newStock.dia, stockLengths: [newStock.length] }].sort((a,b) => a.dia - b.dia));
                        }
                    }}
                    className={btnClass}
                  >
                      <Plus size={16} className="mr-1"/> Add Stock
                  </button>
              </div>

              <div className="overflow-x-auto scrollbar-thin">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                      <thead className="bg-gray-50 dark:bg-slate-700/50">
                          <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Diameter</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Available Lengths</th>
                              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                          </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                          {stock.map((item, idx) => (
                              <tr key={idx}>
                                  <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900 dark:text-gray-100">{item.dia}mm</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-gray-300">{item.stockLengths.join(', ')}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                      <button 
                                        onClick={() => setStock(stock.filter(s => s.dia !== item.dia))}
                                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                      >
                                          <Trash2 size={16}/>
                                      </button>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>

          {/* EXISTING INVENTORY / OFFCUTS */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 transition-colors">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Existing Inventory (Offcuts)</h3>

              <div className="flex flex-wrap items-end gap-4 mb-6 p-4 bg-gray-50 dark:bg-slate-700/50 rounded border dark:border-slate-600">
                  <div className="w-full sm:w-24">
                      <label className={labelClass}>Dia</label>
                      <input 
                        type="number" 
                        value={newInventory.dia}
                        onChange={e => setNewInventory({...newInventory, dia: parseInt(e.target.value)})}
                        className={inputClass}
                      />
                  </div>
                  <div className="w-full sm:w-32">
                      <label className={labelClass}>Length</label>
                      <input 
                        type="number" 
                        value={newInventory.length}
                        onChange={e => setNewInventory({...newInventory, length: parseInt(e.target.value)})}
                        className={inputClass}
                      />
                  </div>
                   <div className="w-full sm:w-24">
                      <label className={labelClass}>Qty</label>
                      <input 
                        type="number" 
                        value={newInventory.qty}
                        onChange={e => setNewInventory({...newInventory, qty: parseInt(e.target.value)})}
                        className={inputClass}
                      />
                  </div>
                  <button 
                    onClick={() => {
                        const newItem: OffcutInventoryItem = {
                            id: `INV-${Date.now()}`,
                            dia: newInventory.dia,
                            lengthMm: newInventory.length,
                            quantity: newInventory.qty
                        };
                        setInventory([...inventory, newItem].sort((a,b) => a.dia - b.dia || b.lengthMm - a.lengthMm));
                    }}
                    className={btnClass}
                  >
                      <Plus size={16} className="mr-1"/> Add Item
                  </button>
              </div>

               <div className="overflow-x-auto scrollbar-thin max-h-60">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                      <thead className="bg-gray-50 dark:bg-slate-700/50">
                          <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Dia</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Length (mm)</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Qty</th>
                              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300"></th>
                          </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                          {inventory.map((item) => (
                              <tr key={item.id}>
                                  <td className="px-6 py-3 text-gray-900 dark:text-gray-100">{item.dia}mm</td>
                                  <td className="px-6 py-3 text-gray-900 dark:text-gray-100">{item.lengthMm}</td>
                                  <td className="px-6 py-3 font-medium text-gray-900 dark:text-gray-100">{item.quantity}</td>
                                  <td className="px-6 py-3 text-right">
                                      <button 
                                        onClick={() => setInventory(inventory.filter(i => i.id !== item.id))}
                                        className="text-gray-400 hover:text-red-500"
                                      >
                                          <Trash2 size={16}/>
                                      </button>
                                  </td>
                              </tr>
                          ))}
                          {inventory.length === 0 && (
                              <tr>
                                  <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400 italic">No existing inventory added.</td>
                              </tr>
                          )}
                      </tbody>
                  </table>
              </div>
          </div>

          {/* LAP RULES */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 transition-colors">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Lap Rules</h3>

              <div className="flex flex-wrap items-end gap-4 mb-6 p-4 bg-gray-50 dark:bg-slate-700/50 rounded border dark:border-slate-600">
                  <div className="w-full sm:w-24">
                      <label className={labelClass}>Dia</label>
                      <input 
                        type="number" 
                        value={newRule.dia}
                        onChange={e => setNewRule({...newRule, dia: parseInt(e.target.value)})}
                        className={inputClass}
                      />
                  </div>
                  <div className="flex-1 min-w-[150px]">
                      <label className={labelClass}>Case</label>
                      <select 
                        value={newRule.lapCase}
                        onChange={e => setNewRule({...newRule, lapCase: e.target.value as LapCase})}
                        className={inputClass}
                      >
                          <option value={LapCase.COLUMN_VERTICAL}>Column Vertical</option>
                          <option value={LapCase.BEAM_TOP}>Beam Top</option>
                          <option value={LapCase.BEAM_BOTTOM}>Beam Bottom</option>
                      </select>
                  </div>
                  <div className="w-full sm:w-32">
                      <label className={labelClass}>Lap Length</label>
                      <input 
                        type="number" 
                        value={newRule.lengthMm}
                        onChange={e => setNewRule({...newRule, lengthMm: parseInt(e.target.value)})}
                        className={inputClass}
                      />
                  </div>
                  <button 
                    onClick={() => {
                        const filtered = laps.filter(l => !(l.dia === newRule.dia && l.lapCase === newRule.lapCase));
                        setLaps([...filtered, { ...newRule }].sort((a,b) => a.dia - b.dia));
                    }}
                    className={btnClass}
                  >
                      <Plus size={16} className="mr-1"/> Save Rule
                  </button>
              </div>

              <div className="overflow-x-auto scrollbar-thin">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                      <thead className="bg-gray-50 dark:bg-slate-700/50">
                          <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Diameter</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Case</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Lap Length (mm)</th>
                              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Actions</th>
                          </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                          {laps.map((rule, idx) => (
                              <tr key={idx}>
                                  <td className="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-gray-100">{rule.dia}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400">{rule.lapCase}</td>
                                  <td className="px-6 py-4 whitespace-nowrap font-medium text-blue-600 dark:text-blue-400">{rule.lengthMm}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-right">
                                      <button 
                                        onClick={() => setLaps(laps.filter((_, i) => i !== idx))}
                                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                      >
                                          <Trash2 size={16}/>
                                      </button>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      </div>
  );

  const renderRuns = () => (
      <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 transition-colors">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Add Bar Run</h3>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
                  <div className="md:col-span-2">
                      <label className={labelClass}>Bar Mark</label>
                      <input 
                        className={inputClass}
                        placeholder="e.g. C1-Verticals"
                        value={newRun.barMark}
                        onChange={e => setNewRun({...newRun, barMark: e.target.value})}
                      />
                  </div>
                  <div className="md:col-span-2">
                      <label className={labelClass}>Member Type</label>
                      <select 
                        className={inputClass}
                        value={newRun.memberTypeIndex}
                        onChange={e => setNewRun({...newRun, memberTypeIndex: parseInt(e.target.value)})}
                      >
                          {MEMBER_TYPE_OPTIONS.map((opt, idx) => (
                              <option key={idx} value={idx}>{opt.label}</option>
                          ))}
                      </select>
                  </div>
                  <div className="flex gap-2 md:col-span-2">
                    <div className="flex-1">
                        <label className={labelClass}>Dia</label>
                        <input 
                            type="number" className={inputClass}
                            value={newRun.dia}
                            onChange={e => setNewRun({...newRun, dia: parseInt(e.target.value)})}
                        />
                    </div>
                    <div className="flex-1">
                        <label className={labelClass}>Qty</label>
                        <input 
                            type="number" className={inputClass}
                            value={newRun.qty}
                            onChange={e => setNewRun({...newRun, qty: parseInt(e.target.value)})}
                        />
                    </div>
                  </div>
                  <div className="md:col-span-6">
                      <label className={labelClass}>
                          Geometry Input (Comma Separated mm)
                      </label>
                      <textarea 
                        className="w-full border border-gray-300 dark:border-slate-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-shadow h-20 font-mono"
                        placeholder="e.g., 3000, 3200, 3200 (for Column) or 5000, 6000 (for Beam)"
                        value={newRun.geometry}
                        onChange={e => setNewRun({...newRun, geometry: e.target.value})}
                      />
                  </div>
              </div>
              <div className="flex justify-end">
                  <button 
                    onClick={handleAddRun}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center text-sm font-medium transition-colors h-[38px]"
                  >
                      <Plus size={18} className="mr-2"/> Add Run
                  </button>
              </div>
          </div>
          
          <div className="grid grid-cols-1 gap-6">
            {runs.length === 0 && <div className="text-gray-500 dark:text-gray-400 text-center py-8">No runs defined. Add one above.</div>}
            {runs.map(run => (
                <div key={run.id} className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h4 className="text-md font-bold text-gray-800 dark:text-gray-100 flex items-center">
                                {run.barMark} 
                                <span className="ml-2 px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 border dark:border-gray-600">
                                    {run.memberType}
                                </span>
                                <span className={`ml-2 px-2 py-0.5 rounded text-xs ${run.memberType === MemberType.COLUMN ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'}`}>
                                    {run.lapCase}
                                </span>
                            </h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                Dia: <span className="font-medium text-gray-700 dark:text-gray-300">{run.dia}mm</span> | 
                                Qty: <span className="font-medium text-gray-700 dark:text-gray-300">{run.qtyParallel}</span> | 
                                Geo: <span className="font-mono text-xs bg-gray-100 dark:bg-slate-700 px-1 rounded">{run.geometryInput}</span>
                            </p>
                        </div>
                        <button onClick={() => handleDeleteRun(run.id)} className="text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"><Trash2 size={18}/></button>
                    </div>
                    {/* Visualizer showing GROUP 0 (Typical) */}
                    <RunVisualizer run={run} splicePlan={results?.splicePlan.find(sp => sp.runId === run.id && sp.groupId === 0)}/>
                </div>
            ))}
          </div>
      </div>
  );

  const renderDirectPieces = () => (
      <div className="space-y-6">
           <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 transition-colors">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Add Fixed Length Piece</h3>
              <div className="flex flex-wrap items-end gap-4">
                  <div className="flex-1 min-w-[200px]">
                      <label className={labelClass}>Bar Mark</label>
                      <input 
                        className={inputClass}
                        value={newDirect.barMark}
                        placeholder="e.g. B1-Link"
                        onChange={e => setNewDirect({...newDirect, barMark: e.target.value})}
                      />
                  </div>
                  <div className="w-24">
                      <label className={labelClass}>Dia</label>
                      <input type="number" className={inputClass} value={newDirect.dia} onChange={e => setNewDirect({...newDirect, dia: parseInt(e.target.value)})} />
                  </div>
                  <div className="w-32">
                      <label className={labelClass}>Length</label>
                      <input type="number" className={inputClass} value={newDirect.length} onChange={e => setNewDirect({...newDirect, length: parseInt(e.target.value)})} />
                  </div>
                   <div className="w-24">
                      <label className={labelClass}>Qty</label>
                      <input type="number" className={inputClass} value={newDirect.qty} onChange={e => setNewDirect({...newDirect, qty: parseInt(e.target.value)})} />
                  </div>
                  <button onClick={handleAddDirectPiece} className={btnClass}>
                      <Plus size={18} className="mr-2"/> Add
                  </button>
              </div>
           </div>
           <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden transition-colors">
               <div className="overflow-x-auto scrollbar-thin">
                   <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                       <thead className="bg-gray-50 dark:bg-slate-700/50">
                           <tr>
                               <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Bar Mark</th>
                               <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Dia</th>
                               <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Length</th>
                               <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Qty</th>
                               <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase"></th>
                           </tr>
                       </thead>
                       <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                           {directPieces.map((dp) => (
                               <tr key={dp.id}>
                                   <td className="px-6 py-4 text-gray-900 dark:text-gray-100">{dp.barMark}</td>
                                   <td className="px-6 py-4 text-gray-900 dark:text-gray-100">{dp.dia}mm</td>
                                   <td className="px-6 py-4 text-gray-900 dark:text-gray-100">{dp.lengthMm}mm</td>
                                   <td className="px-6 py-4 text-gray-900 dark:text-gray-100">{dp.qty}</td>
                                   <td className="px-6 py-4 text-right"><button onClick={() => handleDeleteDirect(dp.id)} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"><Trash2 size={16}/></button></td>
                               </tr>
                           ))}
                       </tbody>
                   </table>
               </div>
           </div>
      </div>
  );

  const renderOptimizer = () => (
      <div className="flex flex-col items-center justify-center h-96 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 shadow-sm transition-colors">
          <div className="mb-6 text-center max-w-md px-4">
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Ready to Optimize</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                  This will generate splice locations for {runs.length} runs and combine with {directPieces.length} fixed pieces.
              </p>
              {isSolving && <p className="text-blue-500 font-medium animate-pulse">Running advanced optimization algorithms...</p>}
          </div>
          <button 
            onClick={handleSolve}
            disabled={isSolving}
            className={`flex items-center px-8 py-4 rounded-full text-lg font-semibold shadow-lg transition-transform hover:scale-105 active:scale-95 ${
                isSolving ? 'bg-gray-400 cursor-not-allowed dark:bg-slate-600' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white'
            }`}
          >
              {isSolving ? <>Processing...</> : <><PlayCircle size={24} className="mr-3" /> Run Optimizer</>}
          </button>
      </div>
  );

  const renderReports = () => {
      if (!results) return <div className="text-center text-gray-500 dark:text-gray-400 p-10">No results generated yet.</div>;
      
      return (
          <div className="space-y-8">
              {/* WARNINGS SECTION */}
              {results.warnings && results.warnings.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-lg border border-red-200 dark:border-red-800">
                      <div className="flex items-center gap-2 mb-2 text-red-800 dark:text-red-200 font-bold">
                          <AlertTriangle size={20} />
                          <h3>Optimization Warnings</h3>
                      </div>
                      <ul className="list-disc pl-5 text-sm text-red-700 dark:text-red-300 space-y-1">
                          {results.warnings.map((w, i) => (
                              <li key={i}>{w}</li>
                          ))}
                      </ul>
                  </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm border border-l-4 border-l-blue-500 border-gray-200 dark:border-slate-700 dark:border-l-blue-500">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Total Steel Required</p>
                      <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{(results.summary.totalWeight / 1000).toFixed(2)} tons</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm border border-l-4 border-l-green-500 border-gray-200 dark:border-slate-700 dark:border-l-green-500">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Stock Bars Needed</p>
                      <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{results.procurement.reduce((a,b) => a + b.quantity, 0)}</p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm border border-l-4 border-l-red-500 border-gray-200 dark:border-slate-700 dark:border-l-red-500">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Waste Percentage</p>
                      <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{results.summary.wastePercent}%</p>
                  </div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 transition-colors">
                  <div className="flex justify-between mb-6">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Cutting Plan</h3>
                    <button onClick={handleExportPDF} className="flex items-center text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium text-sm">
                        <Download size={16} className="mr-1"/> Export PDF
                    </button>
                  </div>
                  
                  {results.cuttingPlan.map((plan, idx) => (
                      <div key={idx} className="mb-6 p-4 bg-gray-50 dark:bg-slate-700/50 rounded border border-gray-200 dark:border-slate-600">
                          <div className="flex justify-between mb-2 text-sm font-semibold text-gray-900 dark:text-gray-200">
                              <span>
                                  Dia {plan.dia}mm - 
                                  <span className={plan.sourceType === 'EXISTING_INVENTORY' ? 'text-orange-600 dark:text-orange-400 ml-1' : 'ml-1'}>
                                      {plan.sourceType === 'EXISTING_INVENTORY' ? 'Inventory (Offcut)' : 'New Stock'} {plan.stockLength}mm
                                  </span>
                              </span>
                              <span className="text-gray-500 dark:text-gray-400">Qty: {plan.count}</span>
                          </div>
                          <div className="w-full h-12 bg-gray-300 dark:bg-slate-600 rounded relative flex overflow-hidden border border-gray-300 dark:border-slate-500">
                              {plan.cuts.map((cut, cIdx) => {
                                  const widthPercent = (cut / plan.stockLength) * 100;
                                  return (
                                      <div key={cIdx} style={{ width: `${widthPercent}%` }} className="h-full bg-blue-500 border-r border-white/50 flex items-center justify-center text-white text-xs overflow-hidden" title={`${cut}mm`}>
                                          {cut}
                                      </div>
                                  );
                              })}
                              
                              {/* Render Waste or Offcut */}
                              {plan.offcut ? (
                                  <div style={{ width: `${(plan.offcut / plan.stockLength) * 100}%` }} className="h-full bg-green-300 dark:bg-green-900/50 flex items-center justify-center text-green-900 dark:text-green-200 text-xs font-bold border-l border-white/50">
                                      {plan.offcut} (Off)
                                  </div>
                              ) : null}

                              {plan.waste ? (
                                  <div className="flex-1 bg-red-300 dark:bg-red-900/50 h-full flex items-center justify-center text-red-900 dark:text-red-200 text-xs font-bold border-l border-white/50">
                                      {plan.waste}
                                  </div>
                              ) : null}
                          </div>
                          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                              Cuts: {plan.cuts.join(' | ')} 
                              {plan.offcut ? ` ; Offcut: ${plan.offcut}mm` : ''} 
                              {plan.waste ? ` ; Waste: ${plan.waste}mm` : ''}
                          </div>
                      </div>
                  ))}
              </div>

               <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 transition-colors">
                  <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">Procurement List (New Stock Only)</h3>
                  <div className="overflow-x-auto scrollbar-thin">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700 text-sm">
                          <thead className="bg-gray-50 dark:bg-slate-700/50">
                              <tr>
                                  <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-300">Diameter</th>
                                  <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-300">Length</th>
                                  <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-300">Quantity</th>
                                  <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-300">Total Length (m)</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                              {results.procurement.map((item, i) => (
                                  <tr key={i}>
                                      <td className="px-4 py-2 font-medium text-gray-900 dark:text-gray-100">{item.dia}mm</td>
                                      <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{item.stockLength}mm</td>
                                      <td className="px-4 py-2 font-bold text-gray-900 dark:text-gray-100">{item.quantity}</td>
                                      <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{(item.totalLength / 1000).toFixed(1)}m</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'settings' && renderSettings()}
        {activeTab === 'stock' && renderStockAndRules()}
        {activeTab === 'runs' && renderRuns()}
        {activeTab === 'direct' && renderDirectPieces()}
        {activeTab === 'optimizer' && renderOptimizer()}
        {activeTab === 'reports' && renderReports()}
        {activeTab === 'help' && <HelpGuide />}
    </Layout>
  );
};

export default App;
