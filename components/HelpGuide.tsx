
import React from 'react';
import { Database, Route, Scissors, FileText, Ruler, AlertTriangle } from 'lucide-react';

export const HelpGuide: React.FC = () => {
  return (
    <div className="bg-white dark:bg-slate-800 p-8 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 max-w-4xl mx-auto transition-colors">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 border-b dark:border-slate-700 pb-4">
          How to Use RebarOpt
      </h2>

      <div className="space-y-8">
        
        <section>
          <div className="flex items-center gap-3 mb-3">
             <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded text-blue-600 dark:text-blue-400">
                 <Database size={24} />
             </div>
             <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Step 1: Project Setup & Stock</h3>
          </div>
          <div className="pl-12 text-gray-600 dark:text-gray-400">
            <p className="mb-3">
                Configure your project settings (Units, Kerf, Rounding) in the <strong>Project Setup</strong> tab.
            </p>
            <ul className="list-disc pl-5 space-y-2">
                <li>
                    <strong>New Stock Catalog:</strong> Define the standard rebar lengths you buy from the market (e.g., 12000mm).
                </li>
                <li>
                    <strong>Existing Inventory:</strong> If you have leftover scraps or offcuts in your yard, add them here.
                </li>
                <li>
                    <strong>Inventory Strategy:</strong> Select "Sequential" to use up old inventory first, or "Mixed" to combine it with new stock for the absolute lowest waste.
                </li>
                <li>
                    <strong>Lap Rules:</strong> Define overlap lengths for different diameters and member types (e.g., Column laps are often 50d).
                </li>
            </ul>
          </div>
        </section>

        <section>
          <div className="flex items-center gap-3 mb-3">
             <div className="bg-purple-100 dark:bg-purple-900/50 p-2 rounded text-purple-600 dark:text-purple-400">
                 <Route size={24} />
             </div>
             <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Step 2: Define Bar Runs</h3>
          </div>
          <div className="pl-12 text-gray-600 dark:text-gray-400">
            <p className="mb-2">Enter continuous bar runs that require splicing (e.g., a vertical column bar spanning multiple floors).</p>
            <ul className="list-disc pl-5 space-y-1">
                <li><strong>Bar Mark:</strong> Unique identifier from your drawings (e.g., C1-V1).</li>
                <li><strong>Member Type:</strong> Select the member type (Column, Beam). This determines where splices are allowed.</li>
                <li><strong>Geometry:</strong> Enter lengths as comma-separated values. 
                    <br/><em className="text-sm">Example for a column: 3000, 3200, 3200 (Storey heights).</em>
                </li>
            </ul>
          </div>
        </section>

        <section>
            <div className="flex items-center gap-3 mb-3">
                <div className="bg-teal-100 dark:bg-teal-900/50 p-2 rounded text-teal-600 dark:text-teal-400">
                    <Ruler size={24} />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Step 3: Fixed Lengths (Optional)</h3>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-2 pl-12">
                Use the <strong>Fixed Lengths</strong> tab for pieces that are already detailed and don't need splice optimization (e.g., stirrups, links, or short bars). 
                The optimizer will simply pack these into the stock bars.
            </p>
        </section>

        <section>
            <div className="flex items-center gap-3 mb-3">
                <div className="bg-orange-100 dark:bg-orange-900/50 p-2 rounded text-orange-600 dark:text-orange-400">
                    <Scissors size={24} />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Step 4: Optimization</h3>
            </div>
            <div className="pl-12 text-gray-600 dark:text-gray-400 mb-2">
                <p>Click <strong>Run Optimizer</strong>. The algorithm will:</p>
                <ol className="list-decimal pl-5 space-y-1 mt-2">
                    <li>Find valid splice zones (e.g., middle half for columns, L/3 for beam top).</li>
                    <li>Apply <strong>Class B (100% Splice)</strong> logic, meaning all parallel bars are spliced at the same location.</li>
                    <li>Calculate the most efficient cutting plan to minimize waste using Monte Carlo simulation.</li>
                </ol>
            </div>
        </section>

        <section>
            <div className="flex items-center gap-3 mb-3">
                <div className="bg-green-100 dark:bg-green-900/50 p-2 rounded text-green-600 dark:text-green-400">
                    <FileText size={24} />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Step 5: Review & Export</h3>
            </div>
             <p className="text-gray-600 dark:text-gray-400 mb-2 pl-12">
                View the <strong>Cutting Plan</strong> to see exactly how to cut every stock bar. 
                Check the <strong>Procurement List</strong> to order materials.
                Export to <strong>PDF</strong> for site teams or <strong>Excel</strong> for further analysis.
            </p>
        </section>

        <section>
            <div className="flex items-center gap-3 mb-3">
                <div className="bg-red-100 dark:bg-red-900/50 p-2 rounded text-red-600 dark:text-red-400">
                    <AlertTriangle size={24} />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Structural Warnings</h3>
            </div>
             <p className="text-gray-600 dark:text-gray-400 mb-2 pl-12">
                If the optimizer cannot find a valid splice zone due to geometry constraints (e.g., stock length is too short to reach the next zone), it will force a splice to maintain continuity but will flag it as a <strong>Structural Warning</strong> in the Report tab. Please review these locations carefully with the design engineer.
            </p>
        </section>
      </div>
    </div>
  );
};
