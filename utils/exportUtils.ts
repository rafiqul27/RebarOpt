
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ProjectSettings, StockCatalogItem, LapRule, BarRun, DirectPiece, OptimizationResult, MemberType, LapCase, OffcutInventoryItem } from '../types';

// --- EXCEL HANDLERS ---

export const exportProjectToExcel = (
  settings: ProjectSettings,
  stock: StockCatalogItem[],
  laps: LapRule[],
  runs: BarRun[],
  directPieces: DirectPiece[],
  inventory: OffcutInventoryItem[] = [],
  results: OptimizationResult | null = null
) => {
  const wb = XLSX.utils.book_new();

  // --- INPUT SHEETS (For saving/loading project state) ---

  // 1. Settings
  // Explicitly map valid fields to ensure legacy/unused fields (like maxPercentSplicedAtOneSection) are not exported
  const settingsToExport = {
    projectName: settings.projectName,
    units: settings.units,
    roundingStepMm: settings.roundingStepMm,
    kerfMm: settings.kerfMm,
    minLeftoverMm: settings.minLeftoverMm,
    allowOffcuts: settings.allowOffcuts,
    beamDepthMm: settings.beamDepthMm,
    optimizationLevel: settings.optimizationLevel,
    inventoryStrategy: settings.inventoryStrategy
  };

  const wsSettings = XLSX.utils.json_to_sheet([settingsToExport]);
  XLSX.utils.book_append_sheet(wb, wsSettings, "Settings");

  // 2. Stock
  const flatStock = stock.map(s => ({
      dia: s.dia,
      lengths: s.stockLengths.join(', ')
  }));
  const wsStock = XLSX.utils.json_to_sheet(flatStock);
  XLSX.utils.book_append_sheet(wb, wsStock, "Stock");

  // 3. Inventory
  const wsInventory = XLSX.utils.json_to_sheet(inventory);
  XLSX.utils.book_append_sheet(wb, wsInventory, "Inventory");

  // 4. Rules
  const wsRules = XLSX.utils.json_to_sheet(laps);
  XLSX.utils.book_append_sheet(wb, wsRules, "Rules");

  // 5. Bar Runs
  const flatRuns = runs.map(r => ({
      id: r.id,
      barMark: r.barMark,
      memberType: r.memberType,
      dia: r.dia,
      qty: r.qtyParallel,
      geometry: r.geometryInput
  }));
  const wsRuns = XLSX.utils.json_to_sheet(flatRuns);
  XLSX.utils.book_append_sheet(wb, wsRuns, "BarRuns");

  // 6. Fixed Pieces
  const wsDirect = XLSX.utils.json_to_sheet(directPieces);
  XLSX.utils.book_append_sheet(wb, wsDirect, "FixedPieces");

  // --- RESULT SHEETS (If optimization has been run) ---

  if (results) {
    // 7. Summary & Warnings
    const summaryData = [
        { Metric: "Total Steel Weight (tons)", Value: (results.summary.totalWeight / 1000).toFixed(3) },
        { Metric: "Total Waste (m)", Value: (results.summary.totalWaste / 1000).toFixed(2) },
        { Metric: "Waste Percentage", Value: `${results.summary.wastePercent}%` },
        { Metric: "Total Stock Bars", Value: results.procurement.reduce((a, b) => a + b.quantity, 0) }
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Results_Summary");

    if (results.warnings && results.warnings.length > 0) {
        const wsWarnings = XLSX.utils.json_to_sheet(results.warnings.map(w => ({ Warning: w })));
        XLSX.utils.book_append_sheet(wb, wsWarnings, "Structural_Warnings");
    }

    // 8. Procurement List
    const wsProcurement = XLSX.utils.json_to_sheet(results.procurement.map(p => ({
        Diameter: p.dia,
        StockLength_mm: p.stockLength,
        Quantity: p.quantity,
        TotalMeters: (p.totalLength / 1000).toFixed(2)
    })));
    XLSX.utils.book_append_sheet(wb, wsProcurement, "Procurement");

    // 9. Cutting Plan
    const flatCuttingPlan = results.cuttingPlan.map(c => ({
        Diameter: c.dia,
        Source: c.sourceType === 'EXISTING_INVENTORY' ? 'Inventory' : 'New Stock',
        StockLength: c.stockLength,
        Count: c.count,
        Pattern: c.cuts.join(' + '),
        Offcut: c.offcut || 0,
        Waste: c.waste || 0
    }));
    const wsCutting = XLSX.utils.json_to_sheet(flatCuttingPlan);
    XLSX.utils.book_append_sheet(wb, wsCutting, "Cutting_Plan");

    // 10. Installation Schedule (Splice Plan)
    // Flatten the splice plan so site engineers know where each cut piece goes
    const installRows: any[] = [];
    results.splicePlan.forEach(sp => {
        const run = runs.find(r => r.id === sp.runId);
        if(!run) return;
        
        sp.pieces.forEach((p, idx) => {
            installRows.push({
                BarMark: sp.barMark,
                Member: run.memberType,
                Diameter: run.dia,
                SegmentOrder: idx + 1,
                CutLength_mm: p.lengthMm,
                StartPos_mm: Math.round(p.startMm),
                EndPos_mm: Math.round(p.endMm)
            });
        });
    });
    const wsInstall = XLSX.utils.json_to_sheet(installRows);
    XLSX.utils.book_append_sheet(wb, wsInstall, "Install_Schedule");
  }

  XLSX.writeFile(wb, `${settings.projectName || 'RebarOpt_Project'}.xlsx`);
};

export const importProjectFromExcel = async (
  file: File
): Promise<{ 
    settings?: ProjectSettings, 
    stock?: StockCatalogItem[], 
    laps?: LapRule[], 
    runs?: BarRun[],
    directPieces?: DirectPiece[],
    inventory?: OffcutInventoryItem[]
}> => {
  return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const data = e.target?.result;
              const wb = XLSX.read(data, { type: 'binary' });
              
              const result: any = {};

              // Helper to safely read sheet
              const getSheetData = (name: string) => {
                  return wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name]) : null;
              };

              const settingsRaw = getSheetData("Settings");
              if (settingsRaw && settingsRaw.length > 0) result.settings = settingsRaw[0];

              const stockRaw: any[] = getSheetData("Stock") || [];
              if (stockRaw.length > 0) {
                  result.stock = stockRaw.map(r => ({
                      dia: parseInt(r.dia),
                      stockLengths: r.lengths ? r.lengths.toString().split(',').map((s:string) => parseInt(s.trim())) : [12000]
                  }));
              }

              result.laps = getSheetData("Rules");

              const runsRaw: any[] = getSheetData("BarRuns") || [];
              if (runsRaw.length > 0) {
                  result.runs = runsRaw.map(r => {
                      return {
                        id: r.id || `R${Math.random().toString(36).substr(2,9)}`,
                        barMark: r.barMark,
                        memberType: r.memberType as MemberType,
                        dia: parseInt(r.dia),
                        qtyParallel: parseInt(r.qty),
                        geometryInput: r.geometry,
                        totalLengthMm: 0, 
                        allowedZones: [],
                        lapCase: (r.memberType === 'COLUMN' ? LapCase.COLUMN_VERTICAL : LapCase.BEAM_TOP)
                      }
                  });
              }

              result.directPieces = getSheetData("FixedPieces");
              result.inventory = getSheetData("Inventory");

              resolve(result);
          } catch (err) {
              reject(err);
          }
      };
      reader.readAsBinaryString(file);
  });
};

// --- PDF HANDLERS ---

export const generatePDFReport = (
    results: OptimizationResult, 
    projectName: string
) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // --- HEADER ---
    doc.setFontSize(18);
    doc.text(`Rebar Optimization Report`, 14, 15);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Project: ${projectName}`, 14, 22);
    doc.text(`Date: ${new Date().toLocaleDateString()} | Time: ${new Date().toLocaleTimeString()}`, 14, 27);
    doc.setTextColor(0);

    let finalY = 30;

    // --- WARNINGS SECTION ---
    if (results.warnings && results.warnings.length > 0) {
        doc.setFontSize(12);
        doc.setTextColor(220, 53, 69); // Red
        doc.text("CRITICAL STRUCTURAL WARNINGS", 14, finalY + 10);
        doc.setTextColor(0);
        
        const warningData = results.warnings.map(w => [w]);
        
        autoTable(doc, {
            startY: finalY + 12,
            body: warningData,
            theme: 'plain',
            styles: { textColor: [220, 53, 69], fontSize: 9 },
        });
        finalY = (doc as any).lastAutoTable.finalY + 5;
    }

    // --- SUMMARY ---
    doc.setFontSize(14);
    doc.text("Executive Summary", 14, finalY + 10);
    
    const summaryData = [
        ["Total Steel Required", `${(results.summary.totalWeight / 1000).toFixed(3)} tons`],
        ["Total Stock Bars", `${results.procurement.reduce((a,b) => a+b.quantity, 0)} pcs`],
        ["Total Waste", `${(results.summary.totalWaste / 1000).toFixed(2)} m`],
        ["Efficiency", `${(100 - results.summary.wastePercent).toFixed(2)}%`]
    ];
    
    autoTable(doc, {
        startY: finalY + 15,
        head: [['Metric', 'Value']],
        body: summaryData,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
        styles: { fontSize: 10 }
    });
    
    finalY = (doc as any).lastAutoTable.finalY + 10;

    // --- PROCUREMENT ---
    doc.text("Procurement List", 14, finalY + 10);
    
    const procurementData = results.procurement.map(p => [
        `${p.dia} mm`,
        `${p.stockLength} mm`,
        p.quantity,
        (p.totalLength / 1000).toFixed(1)
    ]);

    autoTable(doc, {
        startY: finalY + 15,
        head: [['Dia', 'Stock Length', 'Quantity', 'Total Meter']],
        body: procurementData,
        headStyles: { fillColor: [39, 174, 96] } // Green
    });

    finalY = (doc as any).lastAutoTable.finalY + 15;

    // --- INSTALLATION SCHEDULE (NEW) ---
    doc.addPage();
    doc.text("Installation Schedule (Splice Plan)", 14, 15);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text("Use this schedule to identify where to place each cut piece in the structure.", 14, 20);
    doc.setTextColor(0);

    const installData: any[] = [];
    results.splicePlan.forEach(sp => {
        sp.pieces.forEach((p, idx) => {
            installData.push([
                sp.barMark,
                idx + 1,
                `${p.lengthMm} mm`,
                `${Math.round(p.startMm)}`,
                `${Math.round(p.endMm)}`
            ]);
        });
    });

    autoTable(doc, {
        startY: 25,
        head: [['Bar Mark', 'Seq', 'Cut Length', 'Start (mm)', 'End (mm)']],
        body: installData,
        headStyles: { fillColor: [142, 68, 173] }, // Purple
        styles: { fontSize: 9 }
    });

    // --- DETAILED CUTTING PLAN ---
    doc.addPage();
    doc.setFontSize(14);
    doc.text("Detailed Cutting Plan", 14, 15);
    
    const cutData = results.cuttingPlan.map(c => {
        let remnantDisplay = '-';
        if (c.offcut && c.offcut > 0) {
            remnantDisplay = `${c.offcut} (Off)`;
        } else if (c.waste && c.waste > 0) {
            remnantDisplay = `${c.waste} (Wst)`;
        }

        return [
            `${c.dia}mm`,
            c.sourceType === 'EXISTING_INVENTORY' ? 'Inv' : 'New',
            c.stockLength,
            c.count,
            c.cuts.join(' | '),
            remnantDisplay
        ];
    });

    autoTable(doc, {
        startY: 20,
        head: [['Dia', 'Src', 'Len', 'Qty', 'Cut Pattern', 'Remnant']],
        body: cutData,
        styles: { fontSize: 8 },
        columnStyles: { 4: { cellWidth: 80 } },
        headStyles: { fillColor: [52, 73, 94] } // Dark Blue/Grey
    });

    doc.save(`${projectName}_OptimizationReport.pdf`);
};
