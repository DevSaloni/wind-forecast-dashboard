import React from 'react';
import {
  LayoutDashboard,
  TableProperties,
  BarChart3,
  ShieldCheck,
  Wind,
  ExternalLink,
  X,
} from 'lucide-react';
import { NavigationPage } from '../types';

interface SidebarProps {
  currentPage: NavigationPage;
  onPageChange: (page: NavigationPage) => void;
  upstreamStatus: string;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onPageChange,
  upstreamStatus,
  isOpen,
  onClose,
}) => {
  const navItems: { id: NavigationPage; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'overview', label: 'Executive Overview', icon: LayoutDashboard },
    { id: 'explorer', label: 'Forecast Explorer', icon: TableProperties },
    { id: 'accuracy', label: 'Accuracy Analysis', icon: BarChart3 },
    { id: 'methodology', label: 'Data Quality & Audit', icon: ShieldCheck },
  ];

  const handleNavClick = (id: NavigationPage) => {
    onPageChange(id);
    onClose();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col justify-between select-none transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Brand Zone */}
          <div className="p-5 lg:p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-800 text-white flex items-center justify-center shadow-xs">
                <Wind className="w-4.5 h-4.5 stroke-[2.2]" />
              </div>
              <div>
                <div className="font-bold text-slate-900 text-base tracking-tight leading-none">
                  WindWise
                </div>
                <div className="text-[11px] text-slate-500 font-medium tracking-tight mt-1">
                  Renewable Forecast Intelligence
                </div>
              </div>
            </div>

            {/* Close button for mobile */}
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 text-slate-400 hover:text-slate-600 rounded-md transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors text-left cursor-pointer ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-900 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* System Context & Upstream Audit Info */}
        <div className="p-4 border-t border-slate-200 space-y-3 bg-slate-50/50">
          <div className="text-xs text-slate-500 space-y-1">
            <div className="font-medium text-slate-700">Data Evaluation Scope</div>
            <div className="text-[11px] text-slate-500">
              January 2026 · UK National Grid
            </div>
            <div className="text-[11px] text-slate-400">
              Elexon BMRS FUELHH / WINDFOR
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
            <span>Elexon Upstream:</span>
            <span className="font-mono text-emerald-700 font-medium">
              {upstreamStatus === 'nominal' ? 'Connected' : upstreamStatus}
            </span>
          </div>

          <a
            href="https://bmrs.elexon.co.uk"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-emerald-700 transition-colors pt-1"
          >
            <span>Elexon Portal</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </aside>
    </>
  );
};
