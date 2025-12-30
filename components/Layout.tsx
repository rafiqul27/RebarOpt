
import React, { useState, useEffect } from 'react';
import { Settings, Database, Route, Scissors, FileText, Ruler, Menu, X, Sun, Moon, HelpCircle } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const NAV_ITEMS = [
  { id: 'settings', label: 'Project Setup', icon: Settings },
  { id: 'stock', label: 'Stock & Rules', icon: Database },
  { id: 'runs', label: 'Bar Runs', icon: Route },
  { id: 'direct', label: 'Fixed Lengths', icon: Ruler },
  { id: 'optimizer', label: 'Optimization', icon: Scissors },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'help', label: 'Help Guide', icon: HelpCircle },
];

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleNavClick = (id: string) => {
    onTabChange(id);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-900 text-gray-800 dark:text-gray-100 transition-colors duration-200">
      
      <div className="md:hidden fixed top-0 w-full bg-slate-900 text-white z-50 flex items-center justify-between px-4 h-16 shadow-md">
        <div className="flex items-center space-x-2">
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-1">
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <span className="font-bold text-lg tracking-wider text-blue-400">RebarOpt</span>
        </div>
        <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-slate-800">
          {isDarkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-slate-300" />}
        </button>
      </div>

      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out shadow-xl flex flex-col
        md:translate-x-0 md:static md:flex
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 border-b border-slate-700 hidden md:block">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold tracking-wider text-blue-400">RebarOpt</h1>
              <p className="text-xs text-slate-400 mt-1">Site Engineering Tool</p>
            </div>
            <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-slate-800 transition-colors">
              {isDarkMode ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} className="text-slate-400" />}
            </button>
          </div>
        </div>

        <nav className="flex-1 py-6 space-y-2 px-3 overflow-y-auto mt-16 md:mt-0">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                  isActive 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon size={20} />
                <span className="font-medium text-left">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-700 text-center text-xs text-slate-500">
          v1.2.0 | Md. Rafiqul Islam
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden pt-16 md:pt-0 w-full relative">
        <header className="h-16 bg-white dark:bg-slate-800 shadow-sm flex items-center px-8 border-b border-gray-200 dark:border-slate-700 hidden md:flex">
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">
            {NAV_ITEMS.find(n => n.id === activeTab)?.label}
          </h2>
        </header>
        
        <div className="md:hidden bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-4 py-3 shadow-sm sticky top-0 z-30">
             <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">
                {NAV_ITEMS.find(n => n.id === activeTab)?.label}
             </h2>
        </div>

        <div className="flex-1 overflow-auto p-4 md:p-8">
            <div className="max-w-7xl mx-auto pb-10">
                {children}
            </div>
        </div>
      </main>

      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
};
