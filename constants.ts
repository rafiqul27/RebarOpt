
import { ProjectSettings, StockCatalogItem, LapRule, BarRun } from './types';

export const DEFAULT_SETTINGS: ProjectSettings = {
  projectName: "New Project",
  units: 'mm',
  roundingStepMm: 1, 
  kerfMm: 5,
  minLeftoverMm: 0, 
  allowOffcuts: true,
  beamDepthMm: 600, 
  optimizationLevel: 'BALANCED',
  inventoryStrategy: 'SEQUENTIAL'
};

export const INITIAL_STOCK: StockCatalogItem[] = [];

export const INITIAL_LAP_RULES: LapRule[] = [];

export const SAMPLE_RUNS: BarRun[] = [];
