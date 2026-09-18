/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, 
  UserCheck, 
  Key, 
  ArrowLeft, 
  Lock, 
  Users, 
  Eye, 
  EyeOff, 
  AlertCircle,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { Employee, UserRole } from '../types';
import InteractiveEyes from './InteractiveEyes';
import { db } from '../utils/db';
import { clearLegacyPasswordPersistence } from '../utils/passwordApi';

interface LoginProps {
  employees: Employee[];
  onLogin: (employee: Employee) => void;
  theme: 'light' | 'dark';
}

export default function Login({ employees, onLogin, theme }: LoginProps) {
  const [activeTab, setActiveTab] = useState<'users' | 'admin'>('users');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [showUserPass, setShowUserPass] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loginLifecycle = useRef(0);
  const clearPasswordInputs = () => {
    setPassword('');
    setAdminPassword('');
    setShowAdminPass(false);
    setShowUserPass(false);
  };

  useEffect(() => {
    clearLegacyPasswordPersistence();
    clearPasswordInputs();
    return () => {
      loginLifecycle.current += 1;
      clearPasswordInputs();
    };
  }, [activeTab]);

  // Anti-Brute-Force Lockout State (Persisted in both localStorage & sessionStorage to prevent refresh bypass)
  const [failedAttempts, setFailedAttempts] = useState(() => {
    const saved = localStorage.getItem('pe_failed_attempts') || sessionStorage.getItem('pe_failed_attempts');
    return saved ? parseInt(saved, 10) || 0 : 0;
  });

  const [lockoutCountdown, setLockoutCountdown] = useState(() => {
    const lockUntil = localStorage.getItem('pe_lockout_until') || sessionStorage.getItem('pe_lockout_until');
    if (lockUntil) {
      const remaining = Math.ceil((parseInt(lockUntil, 10) - Date.now()) / 1000);
      return remaining > 0 ? remaining : 0;
    }
    return 0;
  });

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (lockoutCountdown > 0) {
      timer = setTimeout(() => {
        setLockoutCountdown(prev => {
          const next = prev - 1;
          if (next <= 0) {
            localStorage.removeItem('pe_lockout_until');
            sessionStorage.removeItem('pe_lockout_until');
            localStorage.removeItem('pe_failed_attempts');
            sessionStorage.removeItem('pe_failed_attempts');
            setFailedAttempts(0);
          }
          return next;
        });
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [lockoutCountdown]);

  /**
   * Constant-Time string comparison to prevent side-channel timing attacks
   */
  const timingSafeEqual = (a: string, b: string): boolean => {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    let mismatch = a.length === b.length ? 0 : 1;
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      const charA = i < a.length ? a.charCodeAt(i) : 0;
      const charB = i < b.length ? b.charCodeAt(i) : 0;
      mismatch |= charA ^ charB;
    }
    return mismatch === 0;
  };

  /**
   * Sanitizer against script injection and dangerous characters
   */
  const sanitizeAuthInput = (val: string): string => {
    return val
      .replace(/[<>'"`;()&$]/g, '')
      .trim();
  };

  const logSecurityEvent = (action: string, details: string, type: 'info' | 'warning' | 'success' | 'danger') => {
    try {
      const logs = JSON.parse(localStorage.getItem('pe_system_logs') || '[]');
      const newLog = {
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        timestamp: new Intl.DateTimeFormat('fa-IR', {
          dateStyle: 'short',
          timeStyle: 'medium',
        }).format(new Date()),
        operator: 'دروازه امنیت احراز هویت',
        action,
        details,
        type,
      };
      db.saveMiscData('pe_system_logs', [newLog, ...logs.slice(0, 199)]);
    } catch {
      // Ignore log error
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    clearPasswordInputs();
    const lifecycle = loginLifecycle.current;
    setErrorMsg('');

    if (lockoutCountdown > 0) {
      setErrorMsg(`سیستم به دلیل تلاش‌های ناموفق متوالی موقتاً قفل است. لطفاً ${lockoutCountdown} ثانیه دیگر صبر کنید.`);
      return;
    }

    const submittedUsername = activeTab === 'users' ? username : adminUsername;
    const submittedPassword = activeTab === 'users' ? password : adminPassword;
    if (submittedUsername.trim() && submittedPassword.trim()) {
      setIsSubmitting(true);
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: submittedUsername, password: submittedPassword }),
        });
        if (lifecycle !== loginLifecycle.current) return;
        const contentType = response.headers.get('Content-Type') || '';
        if (contentType.includes('application/json')) {
          const result = await response.json() as { user?: Employee; error?: string };
          if (lifecycle !== loginLifecycle.current) return;
          if (!response.ok || !result.user) {
            triggerFailedAttempt(result.error || 'نام کاربری یا کلمه عبور نامعتبر است.');
            return;
          }
          setFailedAttempts(0);
          localStorage.removeItem('pe_failed_attempts');
          sessionStorage.removeItem('pe_failed_attempts');
          localStorage.removeItem('pe_lockout_until');
          sessionStorage.removeItem('pe_lockout_until');
          logSecurityEvent('ورود موفق ابری', `کاربر ${result.user.name} با نشست امن وارد سیستم شد.`, 'success');
          onLogin(result.user);
          return;
        }
        if (!import.meta.env.DEV || activeTab === 'admin') {
          setErrorMsg('سرویس احراز هویت در دسترس نیست. لطفاً با مدیر سامانه تماس بگیرید.');
          return;
        }
      } catch {
        if (lifecycle !== loginLifecycle.current) return;
        if (!import.meta.env.DEV || activeTab === 'admin') {
          setErrorMsg('ارتباط امن با سرور برقرار نشد. لطفاً دوباره تلاش کنید.');
          return;
        }
        // Vite-only development has no Pages Functions; continue with local demo authentication.
      } finally {
        setIsSubmitting(false);
      }
    }

    if (activeTab === 'users') {
      if (!username.trim()) {
        setErrorMsg('لطفاً نام کاربری یا کد پرسنلی را وارد کنید.');
        return;
      }
      if (!password.trim()) {
        setErrorMsg('لطفاً کلمه عبور را وارد فرمایید.');
        return;
      }

      const cleanUser = sanitizeAuthInput(username).toLowerCase();
      const cleanPass = password.trim();

      // Guard: Admin account must only authenticate through the Admin tab
      if (cleanUser === 'admin') {
        setErrorMsg('حساب کاربری مدیریت ارشد منحصراً از طریق سربرگ «پرتال مدیریت» و با کلمه عبور اختصاصی مدیر قابل دسترسی است.');
        return;
      }

      // Find employee by username or staff code
      const matchedEmp = employees.find(
        emp => emp.username.toLowerCase() === cleanUser || emp.code.toLowerCase() === cleanUser
      );

      if (!matchedEmp) {
        triggerFailedAttempt('نام کاربری یا کلمه عبور وارد شده معتبر نمی‌باشد.');
        return;
      }

      if (matchedEmp.role === 'admin') {
        setErrorMsg('حساب کاربری مدیریت ارشد منحصراً از طریق سربرگ «پرتال مدیریت» و با کلمه عبور اختصاصی مدیر قابل دسترسی است.');
        return;
      }

      // Check if user account is locked by admin
      try {
        const lockedUsers: string[] = JSON.parse(localStorage.getItem('pe_locked_users') || '[]');
        if (lockedUsers.includes(matchedEmp.id) || lockedUsers.includes(matchedEmp.username.toLowerCase())) {
          setErrorMsg('⛔ این حساب کاربری موقتاً توسط مدیریت سیستم مسدود گردیده است. لطفاً به واحد منابع انسانی مراجعه فرمایید.');
          logSecurityEvent('تلاش برای ورود به حساب مسدودشده', `کاربر ${matchedEmp.name} (${matchedEmp.username}) تلاش برای ورود به حساب مسدود داشت.`, 'warning');
          return;
        }
      } catch {
        // Ignore JSON error
      }

      // Local development uses the personnel code as the only initial password.
      if (!timingSafeEqual(cleanPass, matchedEmp.code)) {
        triggerFailedAttempt('نام کاربری یا کلمه عبور وارد شده معتبر نمی‌باشد.');
        return;
      }

      // Login success for employee
      setFailedAttempts(0);
      localStorage.removeItem('pe_failed_attempts');
      sessionStorage.removeItem('pe_failed_attempts');
      localStorage.removeItem('pe_lockout_until');
      sessionStorage.removeItem('pe_lockout_until');
      logSecurityEvent('ورود موفق کاربر', `کاربر ${matchedEmp.name} (${matchedEmp.role}) با موفقیت وارد سیستم شد.`, 'info');
      onLogin(matchedEmp);

    } else {
      setErrorMsg('ورود مدیریت نیازمند سرویس احراز هویت سرور است.');
    }
  };

  const triggerFailedAttempt = (msg: string) => {
    const nextAttempts = failedAttempts + 1;
    setFailedAttempts(nextAttempts);
    localStorage.setItem('pe_failed_attempts', nextAttempts.toString());
    sessionStorage.setItem('pe_failed_attempts', nextAttempts.toString());
    logSecurityEvent('ورود ناموفق به سیستم', `تلاش ناموفق برای احراز هویت (مرتبه ${nextAttempts})`, 'warning');
    
    if (nextAttempts >= 8) {
      const lockSeconds = 300; // 5 minutes lockout
      setLockoutCountdown(lockSeconds);
      const lockUntil = (Date.now() + lockSeconds * 1000).toString();
      localStorage.setItem('pe_lockout_until', lockUntil);
      sessionStorage.setItem('pe_lockout_until', lockUntil);
      setErrorMsg(`⛔ دسترسی موقتاً به دلیل ${nextAttempts} مرتبه تلاش ناموفق به مدت ۵ دقیقه مسدود گردید.`);
    } else if (nextAttempts >= 5) {
      const lockSeconds = 60; // 1 minute lockout
      setLockoutCountdown(lockSeconds);
      const lockUntil = (Date.now() + lockSeconds * 1000).toString();
      localStorage.setItem('pe_lockout_until', lockUntil);
      sessionStorage.setItem('pe_lockout_until', lockUntil);
      setErrorMsg(`⚠️ به دلیل ۵ مرتبه ورود ناموفق، دسترسی موقتاً به مدت ۶۰ ثانیه مسدود گردید.`);
    } else if (nextAttempts >= 3) {
      const lockSeconds = 15; // 15 seconds cooldown
      setLockoutCountdown(lockSeconds);
      const lockUntil = (Date.now() + lockSeconds * 1000).toString();
      localStorage.setItem('pe_lockout_until', lockUntil);
      sessionStorage.setItem('pe_lockout_until', lockUntil);
      setErrorMsg(`⚠️ هشدار امنیتی: ۳ تلاش ناموفق ثبت شد. لطفاً ۱۵ ثانیه تامل فرمایید.`);
    } else {
      setErrorMsg(`${msg} (تلاش‌های ناموفق: ${nextAttempts} از ۵)`);
    }
  };

  const isPasswordVisible = (activeTab === 'users' && showUserPass) || (activeTab === 'admin' && showAdminPass);

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300 text-right relative ${
      theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'
    }`} dir="rtl">
      
      {/* Subtle Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(225,29,72,0.04),transparent_70%)] pointer-events-none" />

      {/* Main Wrapper with Eyes on top of Card */}
      <div className="w-full max-w-md flex flex-col items-center relative z-10">
        
        {/* Animated Interactive Eyes Mascot above the card */}
        <div className="mb-4 transform hover:scale-105 transition-transform duration-200 cursor-default">
          <InteractiveEyes 
            isClosed={isPasswordVisible} 
            theme={theme} 
          />
        </div>

        {/* Login Box */}
        <div className={`w-full rounded-3xl border shadow-2xl p-6 md:p-8 relative overflow-hidden transition-all backdrop-blur-xl ${
          theme === 'dark' ? 'bg-slate-900/95 border-slate-800 shadow-slate-950/60' : 'bg-white/95 border-slate-200 shadow-slate-200'
        }`}>
        
        {/* Brand Header with Attached Company Logo */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-18 h-18 rounded-2xl bg-white border border-slate-200/80 dark:border-slate-800 shadow-xl flex items-center justify-center p-2.5 mb-3 transform hover:scale-105 transition-transform">
            <img 
              src="/logo.svg" 
              alt="لوگوی شرکت اصفهان چالاک" 
              className="w-full h-full object-contain" 
            />
          </div>
          <h1 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">سامانه جامع ارزیابی عملکرد و شایستگی</h1>
          <h2 className="text-sm md:text-base font-black text-red-600 dark:text-red-400 mt-1.5 tracking-wide drop-shadow-sm">
            شرکت اصفهان چالاک
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed font-medium">
            احراز هویت یکپارچه سازمانی پرسنل، سرپرستان خط و مدیران ارزیاب
          </p>
        </div>

        {/* Tab Selection */}
        <div className={`grid grid-cols-2 p-1.5 rounded-2xl border mb-5 ${
          theme === 'dark' ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'
        }`}>
          <button
            type="button"
            onClick={() => { setActiveTab('users'); setErrorMsg(''); }}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'users'
                ? 'bg-red-600 text-white shadow-md font-black'
                : 'text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>ورود همکاران و ارزیابان</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('admin'); setErrorMsg(''); }}
            className={`py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'admin'
                ? 'bg-indigo-600 text-white shadow-md font-black'
                : 'text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>پرتال مدیریت (Admin)</span>
          </button>
        </div>

        {/* Lockout Banner */}
        {lockoutCountdown > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 p-3 rounded-2xl text-xs font-bold mb-4 flex items-center gap-2.5 animate-pulse">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>قفل امنیتی فعال است: {lockoutCountdown} ثانیه باقی‌مانده...</span>
          </div>
        )}

        {/* Error Feedback */}
        {errorMsg && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3.5 rounded-2xl text-xs font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {/* Secure Form */}
        <form onSubmit={handleFormSubmit} className="space-y-4">
          {activeTab === 'users' ? (
            <>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">نام کاربری یا کد پرسنلی</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    disabled={lockoutCountdown > 0}
                    placeholder="کد پرسنلی (مثال: EMP-1001 یا ali)"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={`w-full border rounded-xl py-3 pr-4 pl-10 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600' : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 shadow-sm'
                    }`}
                  />
                  <UserCheck className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">کلمه عبور</label>
                  <span className="text-[10px] text-slate-500 font-semibold">رمز عبور یا کد پرسنلی</span>
                </div>
                <div className="relative">
                  <input
                    type={showUserPass ? "text" : "password"}
                    required
                    disabled={lockoutCountdown > 0}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`w-full border rounded-xl py-3 pr-4 pl-10 text-xs font-mono transition-all focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600' : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 shadow-sm'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowUserPass(!showUserPass)}
                    className="text-slate-500 hover:text-slate-300 absolute left-3 top-1/2 -translate-y-1/2 p-1 cursor-pointer"
                  >
                    {showUserPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={lockoutCountdown > 0 || isSubmitting}
                className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:opacity-50 text-white font-black py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-600/30 cursor-pointer mt-3"
              >
                <span>ورود امن به سامانه</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">نام کاربری مدیر ارشد</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    disabled={lockoutCountdown > 0}
                    placeholder="نام کاربری مدیر ارشد"
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    className={`w-full border rounded-xl py-3 pr-4 pl-10 text-xs font-mono font-medium transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600' : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 shadow-sm'
                    }`}
                  />
                  <Key className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">کلمه عبور مدیریت ارشد</label>
                  <span className="text-[10px] text-indigo-400 font-bold flex items-center gap-1">
                    <Lock className="w-3 h-3" /> احراز هویت امن
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showAdminPass ? "text" : "password"}
                    required
                    disabled={lockoutCountdown > 0}
                    placeholder="••••••••"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className={`w-full border rounded-xl py-3 pr-4 pl-10 text-xs font-mono transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 ${
                      theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600' : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 shadow-sm'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPass(!showAdminPass)}
                    className="text-slate-500 hover:text-slate-300 absolute left-3 top-1/2 -translate-y-1/2 p-1 cursor-pointer"
                  >
                    {showAdminPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={lockoutCountdown > 0 || isSubmitting}
                className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 text-white font-black py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/30 cursor-pointer mt-3"
              >
                <span>ورود امن به پرتال مدیریت ارشد</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            </>
          )}
        </form>

        {/* Security & System Info Footer with AES-256 Badge */}
        <div className="mt-6 pt-4 border-t border-slate-800/60 flex flex-col items-center gap-2 text-center">
          <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>پروتکل امنیتی فعال: رمزنگاری نشست، حفاظت Brute-Force و ثبت لاگ وقایع</span>
          </div>
          <div className="text-[10px] text-slate-500 leading-relaxed font-medium">
            سامانه جامع مدیریت عملکرد و ارزیابی شایستگی‌های شغلی شرکت اصفهان چالاک
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
