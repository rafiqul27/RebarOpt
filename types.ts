
export enum MemberType {
  COLUMN = 'COLUMN',
  BEAM = 'BEAM',
  SLAB = 'SLAB',
  WALL = 'WALL',
  OTHER = 'OTHER'
}

export enum LapCase {
  COLUMN_VERTICAL = 'COLUMN_VERTICAL',
  BEAM_TOP = 'BEAM_TOP',
  BEAM_BOTTOM = 'BEAM_BOTTOM',
  SLAB_TOP = 'SLAB_TOP',
  SLAB_BOTTOM = 'SLAB_BOTTOM',
  OTHER = 'OTHER'
}

export interface ProjectSettings {
  projectName: string;
  units: 'mm';
  roundingStepMm: number;
  kerfMm: number;
  minLeftoverMm: number;
  allowOffcuts: boolean;
  maxDistinctPatterns?: number;
  beamDepthMm: number; 
  optimizationLevel: 'FAST' | 'BALANCED' | 'DEEP';
  inventoryStrategy: 'SEQUENTIAL' | 'MIXED';
}

export interface StockCatalogItem {
  dia: number;
  stockLengths: number[];
  maxTransportLength?: number;
}

export interface OffcutInventoryItem {
  id: string;
  dia: number;
  lengthMm: number;
  quantity: number;
}

export interface LapRule {
  dia: number;
  lapCase: LapCase;
  lengthMm: number;
}

export interface SpliceZone {
  startMm: number;
  endMm: number;
}

export interface BarRun {
  id: string;
  barMark: string;
  memberType: MemberType;
  dia: number;
  qtyParallel: number;
  totalLengthMm: number;
  lapCase: LapCase;
  geometryInput: string;
  allowedZones: SpliceZone[];
}

export interface DirectPiece {
  id: string;
  barMark: string;
  dia: number;
  lengthMm: number;
  qty: number;
}

export interface OptimizationResult {
  splicePlan: SplicePlanItem[];
  cuttingPlan: CuttingPlanItem[];
  procurement: ProcurementItem[];
  summary: {
    totalWeight: number;
    totalWaste: number;
    wastePercent: number;
  };
  warnings: string[]; // New field for Structural Warnings
}

export interface SplicePlanItem {
  runId: string;
  barMark: string;
  groupId: number;
  pieces: {
    lengthMm: number;
    startMm: number;
    endMm: number;
    isStock?: boolean;
  }[];
}

export interface CuttingPlanItem {
  dia: number;
  stockLength: number;
  count: number;
  cuts: number[];
  waste: number;
  offcut?: number;
  sourceType: 'NEW_STOCK' | 'EXISTING_INVENTORY'; 
}

export interface ProcurementItem {
  dia: number;
  stockLength: number;
  quantity: number;
  totalLength: number;
}
