/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Streamlined & Modern Sidebar Navigation
 * Clean, uncluttered, role-aware, and highly responsive.
 */

import React from 'react';
import { LifeBuoy, LayoutDashboard, 
  FileSpreadsheet, 
  Briefcase, 
  Users, 
  ClipboardCheck, 
  Scale, 
  TrendingUp, 
  ShieldCheck,
  Sun,
  Moon,
  LogOut,
  Award,
  BookOpen,
  HelpCircle,
  X,
  LockKeyhole,
  GitFork,
  Calculator,
  Target,
  Monitor,
  Printer,
  FileText
} from 'lucide-react';
import { Employee, UserRole } from '../types';
import { canAccessTab } from '../utils/accessControl';

interface SidebarProps {
  currentTab: string;
  onChangeTab: (tab: string) => void;
  currentUser: Employee;
  onLogout: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  hasCertifiedBadge: boolean;
  onStartTour: () => void;
  onOpenManual?: () => void;
  canDownloadManual?: boolean;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export default function Sidebar({ 
  currentTab, 
  onChangeTab, 
  currentUser, 
  onLogout, 
  theme, 
  onToggleTheme, 
  hasCertifiedBadge,
  onStartTour,
  onOpenManual,
  canDownloadManual = true,
  isMobileOpen = false,
  onCloseMobile
}: SidebarProps) {
  
  // Streamlined and clear navigation groups
  type MenuItem = { id: string, label: string, icon: any, roles?: string[], permission?: string };
  type MenuGroup = { title: string, items: MenuItem[] };
  
  const menuGroups: MenuGroup[] = [
    {
      title: 'میز کار و ارزیابی',
      items: [
        { id: 'dashboard', label: 'داشبورد ارزیابی', icon: LayoutDashboard, roles: ['admin', 'supervisor'] },
        { id: 'my-evaluation', label: 'کارنامه و خودارزیابی من', icon: ShieldCheck, roles: ['employee'] },
        { id: 'evaluations', label: 'کارنامه‌های عملکرد', icon: ClipboardCheck, roles: ['admin', 'supervisor'] },
        { id: 'workflow', label: 'گردش کار و تاییدات', icon: GitFork, roles: ['admin', 'supervisor', 'employee'] },
      ]
    },
    {
      title: 'اهداف و پایش عملکرد پیوسته',
      items: [
        { id: 'lattice-hub', label: 'اهداف OKR، جلسات ۱به۱ و تمجید', icon: Target, roles: ['admin', 'supervisor', 'employee'] },
        { id: 'kickidler-hub', label: 'پایش زمان و بهره‌وری کارکرد', icon: Monitor, roles: ['admin', 'supervisor'] },
      ]
    },
    {
      title: 'شایستگی‌ها و شاخص‌ها',
      items: [
        { id: 'criteria', label: 'بانک شاخص‌ها و فرمول‌های KPI', icon: Calculator, roles: ['admin', 'supervisor', 'employee'], permission: 'manage_criteria' },
        { id: 'profiles', label: 'پروفایل‌های شغلی', icon: Briefcase, roles: ['admin'] },
        { id: 'employees', label: 'مدیریت کارکنان', icon: Users, roles: ['admin', 'supervisor', 'employee'], permission: 'manage_users' },
      ]
    },
    {
      title: 'تحلیل، آموزش و تنظیمات',
      items: [
        { id: 'calibration', label: 'کالیبراسیون نمرات', icon: Scale, roles: ['admin'] },
        { id: 'reports', label: 'تحلیل‌ها و ماتریس ۹-Box', icon: TrendingUp, roles: ['admin', 'supervisor', 'employee'], permission: 'view_all_reports' },
        { id: 'rewards', label: 'محاسبات ریالی پاداش', icon: Calculator, roles: ['admin'] },
        { id: 'settings', label: 'مرکز مدیریت و امنیت', icon: LockKeyhole, roles: ['admin'] },
        { id: 'onboarding', label: 'آموزش بدو ورود', icon: BookOpen, roles: ['admin', 'supervisor', 'employee'] },
      ]
    },
    {
      title: 'پشتیبانی',
      items: [
        { id: 'support', label: currentUser.role === 'admin' ? 'مدیریت تیکت‌ها' : 'پشتیبانی و ارتباط با مدیر', icon: LifeBuoy, roles: ['admin', 'supervisor', 'employee'] }
      ]
    }
  ];

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'admin': return 'مدیر منابع انسانی';
      case 'supervisor': return 'سرپرست خط';
      case 'employee': return 'اپراتور کارگاه';
    }
  };

  const handleTabClick = (tabId: string) => {
    onChangeTab(tabId);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div 
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden animate-in fade-in"
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed inset-y-0 right-0 z-50 md:static md:z-auto
        w-72 border-l flex flex-col justify-between h-screen shrink-0 select-none
        transition-all duration-300 ease-in-out
        ${isMobileOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full md:translate-x-0'}
        ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800 shadow-md'}
      `}>
        
        {/* Top Header & Navigation Links */}
        <div className="p-4 flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">
          
          {/* Clean Brand Header */}
          <div className="flex items-center justify-between pb-1 border-b border-slate-800/40">
            <div 
              onClick={() => handleTabClick(currentUser.role === 'employee' ? 'my-evaluation' : 'dashboard')}
              className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition-all"
              title="صفحه اصلی"
            >
              <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 dark:border-slate-800 flex items-center justify-center p-1 shadow-sm shrink-0">
                <img src="/logo.svg" alt="لوگو چالاک" className="w-full h-full object-contain" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xs font-black tracking-tight truncate">اصفهان چالاک</h1>
                <p className="text-[10px] text-teal-500 font-bold truncate">سامانه نوین ارزیابی عملکرد</p>
              </div>
            </div>

            {/* Mobile Close Button */}
            {onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                className="md:hidden p-1.5 rounded-lg bg-slate-800/40 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Clean Active User Badge */}
          <div className={`px-3 py-2 rounded-xl border text-right flex items-center justify-between ${
            theme === 'dark' ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <div className="min-w-0">
                <span className="text-xs font-black truncate block">
                  {currentUser.name}
                </span>
                <span className="text-[9px] text-slate-400 truncate block">
                  {getRoleLabel(currentUser.role)}
                </span>
              </div>
            </div>
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20 shrink-0">
              {currentUser.code}
            </span>
          </div>

          {/* Navigation Menu */}
          <nav className="flex flex-col gap-3">
            {menuGroups.map((group, gIdx) => {
              const visibleItems = group.items.filter(item => {
              return canAccessTab(currentUser, item.id);
            });
              if (visibleItems.length === 0) return null;

              return (
                <div key={gIdx} className="space-y-0.5">
                  <span className="text-[10px] font-black text-slate-500 px-2 py-1 block">
                    {group.title}
                  </span>
                  <div className="space-y-0.5">
                    {visibleItems.map(item => {
                      const Icon = item.icon;
                      const isActive = currentTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleTabClick(item.id)}
                          title={item.label}
                          className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-right text-xs font-bold transition-all cursor-pointer ${
                            isActive 
                              ? theme === 'dark'
                                ? 'bg-emerald-500/15 text-emerald-300 font-black border-r-3 border-emerald-500 shadow-sm'
                                : 'bg-emerald-50 text-emerald-700 font-black border-r-3 border-emerald-600 shadow-sm'
                              : theme === 'dark'
                                ? 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                            <span className="truncate">{item.label}</span>
                          </div>
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>

        </div>

        {/* Footer: Streamlined Controls */}
        <div className={`p-3 border-t flex flex-col gap-2 shrink-0 ${
          theme === 'dark' ? 'border-slate-800 bg-slate-950/70' : 'border-slate-200 bg-slate-50'
        }`}>
          {/* Comprehensive PDF Manual button */}
          {onOpenManual && (
            <button
              type="button"
              onClick={onOpenManual}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-bold transition-all shadow-md shadow-teal-600/20 cursor-pointer"
              title={canDownloadManual ? "مشاهده و دریافت کتابچه راهنمای جامع PDF" : "مشاهده آنلاین کتابچه راهنمای جامع سامانه"}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{canDownloadManual ? "دانلود کتابچه راهنما (PDF)" : "مشاهده کتابچه راهنما (آنلاین)"}</span>
            </button>
          )}

          {/* Interactive Tour link */}
          <button
            type="button"
            onClick={onStartTour}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/20 text-[11px] font-bold transition-all cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>راهنمای تعاملی سامانه</span>
          </button>

          {/* Theme & Logout */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={onToggleTheme}
              className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold ${
                theme === 'dark' ? 'hover:bg-slate-800 text-amber-400' : 'hover:bg-slate-200 text-indigo-600'
              }`}
              title={theme === 'dark' ? 'حالت روز' : 'حالت شب'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span className="text-[10px] text-slate-400">{theme === 'dark' ? 'روز' : 'شب'}</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="p-1.5 rounded-lg transition-all cursor-pointer text-rose-400 hover:bg-rose-500/10 flex items-center gap-1 text-[11px] font-bold"
              title="خروج از حساب"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج</span>
            </button>
          </div>

        </div>

      </aside>
    </>
  );
}
