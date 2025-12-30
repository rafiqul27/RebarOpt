
import { BarRun, ProjectSettings, StockCatalogItem, LapRule, OptimizationResult, SplicePlanItem, CuttingPlanItem, ProcurementItem, DirectPiece, OffcutInventoryItem } from '../types';

// --- HELPERS ---

const getLapLength = (dia: number, lapCase: string, rules: LapRule[]): number => {
  const rule = rules.find(r => r.dia === dia && r.lapCase === lapCase);
  return rule ? rule.lengthMm : 50 * dia; // Fallback 50d if rule missing
};

const getStockOptions = (dia: number, catalog: StockCatalogItem[]): number[] => {
  const item = catalog.find(i => i.dia === dia);
  if (!item || item.stockLengths.length === 0) return [12000];
  return [...item.stockLengths].sort((a, b) => b - a);
};

// --- PHASE 1: SPLICE PLANNING ---

const generateSplicePlan = (
  runs: BarRun[],
  rules: LapRule[],
  catalog: StockCatalogItem[],
  settings: ProjectSettings
): { plan: SplicePlanItem[], warnings: string[] } => {
  const plan: SplicePlanItem[] = [];
  const warnings: string[] = [];

  runs.forEach(run => {
    const lap = getLapLength(run.dia, run.lapCase, rules);
    const stockOptions = getStockOptions(run.dia, catalog);
    const maxStock = stockOptions[0]; 
    
    // SAFETY CHECK: Impossible logic
    if (lap >= maxStock) {
        throw new Error(`Critical Error: Lap length (${lap}mm) is greater than or equal to available stock length (${maxStock}mm) for Dia ${run.dia}. Optimization impossible.`);
    }

    const effectiveStock = maxStock;

    // CLASS B SPLICE: 100% splice permitted. Single group.
    const groupPieces: { lengthMm: number; startMm: number; endMm: number }[] = [];
    let currentAbsPos = 0;
    let remainingTotal = run.totalLengthMm;
    
    while (remainingTotal > 0) {
        let targetLength = effectiveStock;

        if (remainingTotal <= targetLength) {
            // FINISH
            groupPieces.push({ 
                lengthMm: remainingTotal, 
                startMm: currentAbsPos, 
                endMm: currentAbsPos + remainingTotal 
            });
            remainingTotal = 0;
            currentAbsPos += remainingTotal;
        } else {
            // CONTINUE
            let proposedCutLen = targetLength;
            const spliceCenterTarget = currentAbsPos + proposedCutLen - (lap/2);
            
            // Find best allowed zone
            let bestZone = run.allowedZones.find(z => 
                z.startMm <= spliceCenterTarget && z.endMm >= spliceCenterTarget
            );

            // If strict fit fails, try to find the closest valid zone BEFORE the max stock limit
            if (!bestZone) {
                // Look for any zone where we can end the bar within the stock length limit
                const validZones = run.allowedZones.filter(z => z.endMm < (currentAbsPos + effectiveStock));
                
                if (validZones.length > 0) {
                    // Pick the furthest possible zone to maximize bar usage
                    bestZone = validZones.reduce((prev, curr) => {
                        return (curr.endMm > prev.endMm) ? curr : prev;
                    });
                }
            }

            let actualCutLen = proposedCutLen;
            let violation = false;

            if (bestZone) {
                const zoneMid = (bestZone.startMm + bestZone.endMm) / 2;
                // We attempt to center the splice in the zone, but we must respect stock length
                let proposedSpliceCenter = zoneMid;
                
                // If zone is very long, try to go as far as possible
                if (bestZone.endMm - bestZone.startMm > 1000) {
                    proposedSpliceCenter = bestZone.endMm - (lap/2) - 100; // Buffer
                }

                // Check if this splice point is reachable
                if (proposedSpliceCenter + (lap/2) - currentAbsPos > effectiveStock) {
                    proposedSpliceCenter = currentAbsPos + effectiveStock - (lap/2);
                }

                actualCutLen = (proposedSpliceCenter + (lap/2)) - currentAbsPos;
            } else {
                // VIOLATION: No valid zone found within reach. Force cut at max stock.
                actualCutLen = effectiveStock;
                violation = true;
            }

            actualCutLen = Math.floor(actualCutLen / settings.roundingStepMm) * settings.roundingStepMm;
            if (actualCutLen < 1000) actualCutLen = 1000; 

            // Double check validation to log warning
            if (violation) {
                const spliceLoc = currentAbsPos + actualCutLen - (lap/2);
                warnings.push(`STRUCTURAL WARNING [${run.barMark}]: Forced splice at ${Math.round(spliceLoc)}mm. No allowed zone was reachable with stock length ${effectiveStock}mm.`);
            }

            groupPieces.push({
                lengthMm: actualCutLen,
                startMm: currentAbsPos,
                endMm: currentAbsPos + actualCutLen
            });

            const advanceBy = actualCutLen - lap;
            
            // Infinite loop protection
            if (advanceBy <= 0) {
                 throw new Error(`Infinite loop detected for ${run.barMark}. Cut Length (${actualCutLen}) <= Lap Length (${lap}).`);
            }

            remainingTotal -= advanceBy;
            currentAbsPos += advanceBy;
        }
    }

    plan.push({
        runId: run.id,
        barMark: run.barMark,
        groupId: 0,
        pieces: groupPieces
    });
  });

  return { plan, warnings };
};

// --- PHASE 2: CUTTING OPTIMIZATION ---

interface CutReq { 
    dia: number; 
    len: number; 
    source: string;
    id: string; 
}

interface Bin {
    stockLength: number;
    remaining: number;
    cuts: number[];
    isInventory: boolean;
}

interface AvailableStockOption {
    len: number;
    isInventory: boolean;
    id?: string; // For inventory items tracking
}

/**
 * Universal Packing Pass that considers a specific list of available stock items (New + Inventory)
 */
const packingPass = (
    requests: CutReq[], 
    stockOptions: AvailableStockOption[], 
    kerf: number
): { bins: Bin[], stockCount: number, usedInventoryIds: Set<string> } => {
    
    const bins: Bin[] = [];
    const usedInventoryIds = new Set<string>();

    for (const req of requests) {
        const needed = req.len + kerf;
        
        // 1. Try to fit in existing OPEN bin (Best Fit)
        let bestBinIndex = -1;
        let minRem = Number.MAX_VALUE;

        for (let i = 0; i < bins.length; i++) {
            const rem = bins[i].remaining - needed;
            if (rem >= 0 && rem < minRem) {
                minRem = rem;
                bestBinIndex = i;
            }
        }

        if (bestBinIndex !== -1) {
            bins[bestBinIndex].remaining -= needed;
            bins[bestBinIndex].cuts.push(req.len);
        } else {
            // 2. Open NEW bin from Available Stock Options (Best Fit Strategy)
            let bestStockOpt: AvailableStockOption | null = null;
            let bestStockRem = Number.MAX_VALUE;

            for (const opt of stockOptions) {
                if (opt.isInventory && opt.id && usedInventoryIds.has(opt.id)) continue; // Skip used inventory

                const potentialRem = opt.len - needed;
                // We prefer tightest fit. 
                // If mixed strategy, this effectively compares new stock vs inventory for best fit
                if (potentialRem >= 0 && potentialRem < bestStockRem) {
                    bestStockRem = potentialRem;
                    bestStockOpt = opt;
                }
            }

            // Fallback: If nothing fits (rare, piece larger than largest stock), force largest new stock
            if (!bestStockOpt) {
                const newStockOpts = stockOptions.filter(o => !o.isInventory).sort((a,b) => b.len - a.len);
                if (newStockOpts.length > 0) {
                     bestStockOpt = newStockOpts[0];
                }
            }

            if (bestStockOpt) {
                bins.push({
                    stockLength: bestStockOpt.len,
                    remaining: bestStockOpt.len - needed,
                    cuts: [req.len],
                    isInventory: bestStockOpt.isInventory
                });
                if (bestStockOpt.isInventory && bestStockOpt.id) {
                    usedInventoryIds.add(bestStockOpt.id);
                }
            }
        }
    }

    // Calculate quality metric (waste)
    const totalWaste = bins.reduce((sum, b) => sum + Math.max(0, b.remaining), 0);
    return { bins, stockCount: bins.length, usedInventoryIds };
};


/**
 * Consumes inventory strictly first (SEQUENTIAL strategy)
 */
const consumeInventorySequential = (
    requests: CutReq[],
    inventory: OffcutInventoryItem[],
    settings: ProjectSettings
): { inventoryBins: Bin[], remainingRequests: CutReq[] } => {
    
    // Flatten inventory to individual items
    let availableOffcuts: { len: number, id: string }[] = [];
    inventory.forEach(inv => {
        for(let i=0; i<inv.quantity; i++) {
            availableOffcuts.push({ len: inv.lengthMm, id: `${inv.id}-${i}` });
        }
    });
    // Sort inventory Ascending (smallest usable first)
    availableOffcuts.sort((a,b) => a.len - b.len);

    const inventoryBins: Bin[] = [];
    // Sort requests Descending (BFD)
    const sortedRequests = [...requests].sort((a,b) => b.len - a.len);
    const remainingRequests: CutReq[] = [];
    const usedOffcutIndices = new Set<number>();

    for (const req of sortedRequests) {
        const needed = req.len + settings.kerfMm;
        
        // 1. Try existing inventory bins
        let bestBinIdx = -1;
        let minBinRem = Number.MAX_VALUE;
        for(let b=0; b<inventoryBins.length; b++) {
            const rem = inventoryBins[b].remaining - needed;
            if (rem >= 0 && rem < minBinRem) {
                minBinRem = rem;
                bestBinIdx = b;
            }
        }

        if (bestBinIdx !== -1) {
            inventoryBins[bestBinIdx].remaining -= needed;
            inventoryBins[bestBinIdx].cuts.push(req.len);
            continue;
        }

        // 2. Try new inventory item
        let bestOffcutIndex = -1;
        let minRem = Number.MAX_VALUE;
        for(let i=0; i<availableOffcuts.length; i++) {
            if (usedOffcutIndices.has(i)) continue;
            const rem = availableOffcuts[i].len - needed;
            if (rem >= 0 && rem < minRem) {
                minRem = rem;
                bestOffcutIndex = i;
            }
        }

        if (bestOffcutIndex !== -1) {
            usedOffcutIndices.add(bestOffcutIndex);
            inventoryBins.push({
                stockLength: availableOffcuts[bestOffcutIndex].len,
                remaining: minRem,
                cuts: [req.len],
                isInventory: true
            });
        } else {
            remainingRequests.push(req);
        }
    }

    return { inventoryBins, remainingRequests };
};

const optimizeDiaGroup = (
    requests: CutReq[],
    stockOptions: number[],
    settings: ProjectSettings,
    inventory: OffcutInventoryItem[]
): Bin[] => {
    
    // Prepare Stock Options
    // SEQUENTIAL: Inventory used first, then new stock.
    // MIXED: Inventory and New Stock combined in one pool.

    if (settings.inventoryStrategy === 'SEQUENTIAL' || !settings.inventoryStrategy) {
        const { inventoryBins, remainingRequests } = consumeInventorySequential(requests, inventory, settings);
        
        if (remainingRequests.length === 0) return inventoryBins;

        // Optimize remaining with New Stock only
        const newStockOpts: AvailableStockOption[] = stockOptions.map(s => ({ len: s, isInventory: false }));
        // Just use packing pass with new stock
        const res = performMonteCarlo(remainingRequests, newStockOpts, settings);
        return [...inventoryBins, ...res.bins];
    } 
    else {
        // MIXED STRATEGY
        // Flatten inventory
        const combinedOptions: AvailableStockOption[] = [];
        
        // Add New Stock (Available generally)
        stockOptions.forEach(s => combinedOptions.push({ len: s, isInventory: false }));

        // Add Inventory (Specific Items)
        inventory.forEach(inv => {
            for(let i=0; i<inv.quantity; i++) {
                combinedOptions.push({ len: inv.lengthMm, isInventory: true, id: `${inv.id}-${i}` });
            }
        });

        // Run Monte Carlo on the Combined Pool
        const res = performMonteCarlo(requests, combinedOptions, settings);
        return res.bins;
    }
};

const performMonteCarlo = (
    requests: CutReq[], 
    stockOptions: AvailableStockOption[], 
    settings: ProjectSettings
): { bins: Bin[] } => {
    
    let iterations = 1;
    if (settings.optimizationLevel === 'BALANCED') iterations = 50;
    if (settings.optimizationLevel === 'DEEP') iterations = 200;

    let bestBins: Bin[] = [];
    let minWaste = Number.MAX_VALUE;

    // Initial Pass (Sorted Descending)
    const sortedReqs = [...requests].sort((a,b) => b.len - a.len);
    const initialRes = packingPass(sortedReqs, stockOptions, settings.kerfMm);
    const initialWaste = initialRes.bins.reduce((sum, b) => sum + b.remaining, 0); // Simplified metric

    bestBins = initialRes.bins;
    minWaste = initialWaste;

    for (let i = 0; i < iterations; i++) {
        const shuffled = [...requests];
        // Fisher-Yates
        for (let k = shuffled.length - 1; k > 0; k--) {
            const j = Math.floor(Math.random() * (k + 1));
            [shuffled[k], shuffled[j]] = [shuffled[j], shuffled[k]];
        }
        
        const res = packingPass(shuffled, stockOptions, settings.kerfMm);
        const waste = res.bins.reduce((sum, b) => sum + b.remaining, 0);

        if (waste < minWaste) {
            minWaste = waste;
            bestBins = res.bins;
        }
    }

    return { bins: bestBins };
};


const optimizeCutting = (
  splicePlan: SplicePlanItem[],
  directPieces: DirectPiece[],
  runs: BarRun[],
  catalog: StockCatalogItem[],
  settings: ProjectSettings,
  inventory: OffcutInventoryItem[]
): { cuttingPlan: CuttingPlanItem[]; procurement: ProcurementItem[]; totalUsedWeight: number; totalWaste: number; wastePercent: number } => {
  
  const allRequests: CutReq[] = [];

  // Flatten Splice Plan
  splicePlan.forEach(sp => {
     const run = runs.find(r => r.id === sp.runId);
     if (!run) return;
     
     // 100% Splice logic (Class B)
     const countForThisGroup = run.qtyParallel;

     if (countForThisGroup > 0) {
         sp.pieces.forEach((p, idx) => {
             for(let i=0; i<countForThisGroup; i++) {
                 allRequests.push({ 
                     dia: run.dia, 
                     len: p.lengthMm, 
                     source: `${run.barMark}`,
                     id: `${sp.runId}-G${sp.groupId}-P${idx}-${i}`
                 });
             }
         });
     }
  });

  // Flatten Direct Pieces
  directPieces.forEach((dp, idx) => {
      for(let i=0; i<dp.qty; i++) {
          allRequests.push({ 
              dia: dp.dia, 
              len: dp.lengthMm,
              source: dp.barMark,
              id: `D${idx}-${i}`
          });
      }
  });

  const cuttingPlan: CuttingPlanItem[] = [];
  const procurement: ProcurementItem[] = [];
  
  let globalTotalInputLength = 0; // Sum of all New Stock Lengths + Used Inventory Lengths
  let globalTotalPartsLength = 0; // Sum of all actual cut pieces needed
  let globalTotalWeight = 0;

  const uniqueDias = Array.from(new Set(allRequests.map(r => r.dia))).sort((a,b) => a-b);

  uniqueDias.forEach(dia => {
      const stockOptions = getStockOptions(dia, catalog);
      const requests = allRequests.filter(r => r.dia === dia);
      const relevantInventory = inventory.filter(i => i.dia === dia);

      const bins = optimizeDiaGroup(requests, stockOptions, settings, relevantInventory);

      // Aggregates for Reporting
      bins.forEach(b => {
          // Weight
          const wPerM = (dia * dia) / 162;
          globalTotalWeight += (wPerM * (b.stockLength / 1000));
          
          // Waste Calculation
          globalTotalInputLength += b.stockLength;
          b.cuts.forEach(c => globalTotalPartsLength += c);
      });

      // Map to Cutting Plan Display
      const patternMap = new Map<string, { count: number, cuts: number[], remaining: number, stock: number, isInventory: boolean }>();

      bins.forEach(b => {
          const sortedCuts = [...b.cuts].sort((x,y) => y-x); 
          const key = `${b.isInventory ? 'INV' : 'NEW'}|${b.stockLength}|${sortedCuts.join('-')}`;
          
          if (patternMap.has(key)) {
              patternMap.get(key)!.count++;
          } else {
              patternMap.set(key, { 
                  count: 1, 
                  cuts: sortedCuts, 
                  remaining: Math.max(0, b.remaining),
                  stock: b.stockLength,
                  isInventory: b.isInventory
              });
          }
      });

      patternMap.forEach((val) => {
          const isOffcut = val.remaining >= settings.minLeftoverMm;
          cuttingPlan.push({
              dia,
              stockLength: val.stock,
              count: val.count,
              cuts: val.cuts,
              waste: isOffcut ? 0 : val.remaining,
              offcut: isOffcut ? val.remaining : 0,
              sourceType: val.isInventory ? 'EXISTING_INVENTORY' : 'NEW_STOCK'
          });
      });

      // Map to Procurement (New Stock Only)
      const stockLenGroups = new Map<number, number>();
      bins.forEach(b => {
          if (!b.isInventory) {
              stockLenGroups.set(b.stockLength, (stockLenGroups.get(b.stockLength) || 0) + 1);
          }
      });

      stockLenGroups.forEach((qty, len) => {
          procurement.push({
              dia,
              stockLength: len,
              quantity: qty,
              totalLength: qty * len
          });
      });
  });

  const totalWaste = globalTotalInputLength - globalTotalPartsLength;
  const wastePercent = globalTotalInputLength > 0 ? (totalWaste / globalTotalInputLength) * 100 : 0;

  return { 
      cuttingPlan, 
      procurement,
      totalUsedWeight: globalTotalWeight,
      totalWaste,
      wastePercent
  };
};

export const runSolver = async (
  runs: BarRun[],
  directPieces: DirectPiece[],
  settings: ProjectSettings,
  stock: StockCatalogItem[],
  laps: LapRule[],
  inventory: OffcutInventoryItem[] = []
): Promise<OptimizationResult> => {
    
    if (!stock || stock.length === 0) {
        throw new Error("Stock catalog is empty.");
    }

    const { plan: splicePlan, warnings } = generateSplicePlan(runs, laps, stock, settings);
    
    const { cuttingPlan, procurement, totalUsedWeight, totalWaste, wastePercent } = optimizeCutting(
        splicePlan, 
        directPieces, 
        runs, 
        stock, 
        settings, 
        inventory
    );

    return {
        splicePlan,
        cuttingPlan,
        procurement,
        summary: {
            totalWeight: Math.round(totalUsedWeight * 100) / 100,
            totalWaste: Math.round(totalWaste),
            wastePercent: Math.round(wastePercent * 100) / 100
        },
        warnings
    };
};
