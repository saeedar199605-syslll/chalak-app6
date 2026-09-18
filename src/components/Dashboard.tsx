/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { calculateFinalScore } from '../utils/formulaEngine';
import { 
  FileSpreadsheet, 
  Briefcase, 
  Users, 
  CheckCircle2, 
  Clock, 
  Activity,
  Award,
  CalendarDays,
  ChevronLeft,
  BookOpen,
  Sparkles,
  ArrowLeft,
  Target,
  Plus,
  Trash2,
  Edit2
} from 'lucide-react';
import { motion } from 'motion/react';
import { Criterion, JobProfile, Employee, Evaluation, CYCLE_STEPS, getGrade, GRADE_DETAILS } from '../types';
import SmartGrowthAnalytics from './SmartGrowthAnalytics';
import RadarChartD3, { CompetencyDimensionData } from './RadarChartD3';
import SupervisorNotificationBell from './SupervisorNotificationBell';
import CalendarWidget from './CalendarWidget';
import { db } from '../utils/db';

interface DashboardProps {
  criteria: Criterion[];
  profiles: JobProfile[];
  employees: Employee[];
  evaluations: Evaluation[];
  onNavigate: (tab: string) => void;
  onSelectEvaluation?: (id: string) => void;
  currentUser: Employee;
  hasCertifiedBadge: boolean;
  theme?: 'dark' | 'light';
}

const staggerContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05
    }
  }
};

const topCardVariants = {
  hidden: { opacity: 0, y: 22, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 250,
      damping: 22
    }
  }
};

export default function Dashboard({ 
  criteria, 
  profiles, 
  employees, 
  evaluations, 
  onNavigate,
  onSelectEvaluation,
  currentUser,
  hasCertifiedBadge,
  theme = 'light'
}: DashboardProps) {
  const [selectedCycleStep, setSelectedCycleStep] = useState<number>(4); // Default to supervisor assessment or calibration

  // Workshop Targets and Coaching state
  interface WorkshopTarget {
    id: string;
    empId: string;
    title: string;
    targetValue: string;
    deadline: string;
    coachingNote: string;
    status: 'pending' | 'achieved';
  }

  const [targets, setTargets] = useState<WorkshopTarget[]>(() => {
    const saved = localStorage.getItem('pe_workshop_targets');
    if (saved) return JSON.parse(saved);
    return [
      {
        id: 'tgt-1',
        empId: 'emp-2',
        title: 'کاهش نرخ خطای بازرسی QC',
        targetValue: 'کمتر از ۰.۵ درصد ضایعات عبوری',
        deadline: '۱۴۰۵/۰۶/۳۰',
        coachingNote: 'ارتقای دقت با به کارگیری چک‌لیست دوطرفه و کالیبراسیون لنزهای چشمی لوپ.',
        status: 'pending'
      },
      {
        id: 'tgt-2',
        empId: 'emp-3',
        title: 'بهینه‌سازی زمان راه‌اندازی (SMED)',
        targetValue: 'کاهش زمان تعویض قالب به زیر ۱۵ دقیقه',
        deadline: '۱۴۰۵/۰۷/۱۵',
        coachingNote: 'مشاهده فیلم‌های آموزشی مهندسی صنایع و استانداردسازی ابزارآلات راه‌اندازی سریع.',
        status: 'achieved'
      }
    ];
  });

  // Sync targets with real-time db updates
  React.useEffect(() => {
    db.saveWorkshopTargets(targets);
  }, [targets]);

  React.useEffect(() => {
    const unsub = db.subscribe((key, data) => {
      if (key === 'pe_workshop_targets' && Array.isArray(data)) {
        setTargets(prev => {
          if (JSON.stringify(prev) === JSON.stringify(data)) return prev;
          return data;
        });
      }
    });
    return unsub;
  }, []);

  // Target Form states
  const [newTargetEmpId, setNewTargetEmpId] = useState<string>('');
  const [newTargetTitle, setNewTargetTitle] = useState<string>('');
  const [newTargetValue, setNewTargetValue] = useState<string>('');
  const [newTargetDeadline, setNewTargetDeadline] = useState<string>('');
  const [newTargetCoachingNote, setNewTargetCoachingNote] = useState<string>('');
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);

  const handleAddTarget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTargetEmpId || !newTargetTitle || !newTargetValue || !newTargetDeadline) return;

    const newTgt: WorkshopTarget = {
      id: `tgt-${Math.random().toString(36).substring(2, 9)}`,
      empId: newTargetEmpId,
      title: newTargetTitle,
      targetValue: newTargetValue,
      deadline: newTargetDeadline,
      coachingNote: newTargetCoachingNote,
      status: 'pending'
    };

    setTargets(editingTargetId
      ? targets.map(target => target.id === editingTargetId
        ? { ...newTgt, id: editingTargetId, status: target.status }
        : target)
      : [...targets, newTgt]);
    setEditingTargetId(null);
    setNewTargetEmpId('');
    setNewTargetTitle('');
    setNewTargetValue('');
    setNewTargetDeadline('');
    setNewTargetCoachingNote('');
  };

  const handleToggleTargetStatus = (id: string) => {
    setTargets(targets.map(t => t.id === id ? { ...t, status: t.status === 'pending' ? 'achieved' : 'pending' } : t));
  };

  const handleDeleteTarget = (id: string) => {
    setTargets(targets.filter(t => t.id !== id));
  };

  const handleEditTarget = (target: WorkshopTarget) => {
    setEditingTargetId(target.id);
    setNewTargetEmpId(target.empId);
    setNewTargetTitle(target.title);
    setNewTargetValue(target.targetValue);
    setNewTargetDeadline(target.deadline);
    setNewTargetCoachingNote(target.coachingNote);
  };

  // Check if onboarding completed for this user
  const isOnboarded = localStorage.getItem(`pe_onboarded_${currentUser.id}`) === 'true';

  // Calculations
  const totalCriteria = criteria.length;
  const totalProfiles = profiles.length;
  const totalEmployees = employees.length;

  const completedEvals = evaluations.filter(e => e.status === 'locked');
  const calibratedEvals = evaluations.filter(e => e.status === 'calibrated');
  const draftEvals = evaluations.filter(e => e.status === 'draft');

  // Calculate overall performance score for locked/calibrated evals (or scored evals if none locked yet)
  
  const scoredEvals = evaluations.filter(e => calculateFinalScore(e) > 0);
  const finalEvals = evaluations.filter(e => e.status === 'locked' || e.status === 'calibrated');
  const statsEvals = finalEvals.length > 0 ? finalEvals : scoredEvals;

  const avgPerformance = statsEvals.length
    ? Math.round(statsEvals.reduce((sum, e) => sum + calculateFinalScore(e), 0) / statsEvals.length * 10) / 10
    : 0;

  const [radarEmpId, setRadarEmpId] = useState<string>('all');

  const getCompetencyRadarData = (): CompetencyDimensionData[] => {
    const relevantEvals = radarEmpId === 'all' 
      ? evaluations 
      : evaluations.filter(e => e.empId === radarEmpId);

    const dims: {
      key: 'K' | 'Q' | 'B' | 'S' | 'L';
      label: string;
      shortLabel: string;
      count: number;
      sum: number;
      selfSum: number;
      selfCount: number;
      target: number;
    }[] = [
      { key: 'K', label: 'اهداف کمی و خروجی', shortLabel: 'K - کمی', count: 0, sum: 0, selfSum: 0, selfCount: 0, target: 4.2 },
      { key: 'Q', label: 'کیفیت و انطباق استانداردها', shortLabel: 'Q - کیفی', count: 0, sum: 0, selfSum: 0, selfCount: 0, target: 4.5 },
      { key: 'B', label: 'رفتارهای سازمانی و اخلاق حرفه‌ای', shortLabel: 'B - رفتاری', count: 0, sum: 0, selfSum: 0, selfCount: 0, target: 4.0 },
      { key: 'S', label: 'ایمنی، بهداشت و ۵S کارگاهی', shortLabel: 'S - ایمنی', count: 0, sum: 0, selfSum: 0, selfCount: 0, target: 4.8 },
      { key: 'L', label: 'رهبری، مربیگری و کار تیمی', shortLabel: 'L - رهبری', count: 0, sum: 0, selfSum: 0, selfCount: 0, target: 4.1 },
    ];

    relevantEvals.forEach(ev => {
      (ev.scores || []).forEach(s => {
        const crit = criteria.find(c => c.id === s.cid || c.code === s.cid);
        if (crit) {
          const cat = crit.cat || 'K';
          const dim = dims.find(d => d.key === cat) || dims[0];
          const rawVal = s.value || 0;
          const val5 = rawVal > 5 ? Math.min(5, rawVal / 20) : rawVal;
          if (val5 > 0) {
            dim.sum += val5;
            dim.count += 1;
          }
          if (s.self && s.self > 0) {
            const rawSelf = s.self;
            const selfVal5 = rawSelf > 5 ? Math.min(5, rawSelf / 20) : rawSelf;
            dim.selfSum += selfVal5;
            dim.selfCount += 1;
          }
        }
      });
    });

    return dims.map(d => ({
      key: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      actual: d.count > 0 ? Math.round((d.sum / d.count) * 10) / 10 : (radarEmpId === 'all' ? 3.8 : 3.5),
      target: d.target,
      self: d.selfCount > 0 ? Math.round((d.selfSum / d.selfCount) * 10) / 10 : undefined,
      description: d.label
    }));
  };

  // Grade Distribution
  const distribution = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  statsEvals.forEach(ev => {
    const score = calculateFinalScore(ev, profiles);
    if (score > 0) {
      const grade = getGrade(score);
      distribution[grade]++;
    }
  });

  const maxDist = Math.max(1, ...Object.values(distribution));

  return (
    <div className="space-y-6 text-right" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 tracking-tight">داشبورد ارزیابی عملکرد</h1>
          <p className="text-sm text-slate-400 mt-1">نمای مدیریتی یکپارچه عملکرد، شایستگی‌ها و مربیگری هوشمند سازمان</p>
        </div>
        <div className="flex items-center gap-3">
          <SupervisorNotificationBell
            evaluations={evaluations}
            employees={employees}
            currentUser={currentUser}
            onNavigate={onNavigate}
            theme={theme}
          />
          <div className="text-[10px] font-bold text-teal-400 bg-teal-500/10 border border-teal-500/20 px-3 py-1.5 rounded-full flex items-center gap-1.5">
            <span>واحد ارزیابی عملکرد اصفهان چالاک</span>
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Onboarding Clean Banner */}
      {(!isOnboarded || (!hasCertifiedBadge && currentUser.role !== 'employee')) && (
        <div className="bg-gradient-to-r from-teal-500/15 via-indigo-500/5 to-transparent border border-teal-500/25 rounded-2xl p-5 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
          <div className="space-y-1.5 relative z-10 max-w-2xl">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-400 animate-bounce" />
              <h3 className="text-sm font-black text-slate-100">
                {currentUser.role !== 'employee' 
                  ? 'کسب نشان صلاحیت طلایی ارزیابی اصفهان چالاک' 
                  : 'آموزش بدو ورود و نحوه خودارزیابی هوشمند'
                }
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {currentUser.role !== 'employee'
                ? 'همکار گرامی، جهت تایید و قفل نهایی نمرات کارگاهی پرسنل خود و جلوگیری از سوگیری، لطفاً راهنمای آموزشی ۳ دقیقه‌ای را گذرانده و نشان افتخار ارزیاب ذیصلاح را دریافت کنید.'
                : 'به خانواده اصفهان چالاک خوش آمدید! جهت آشنایی با فرآیند خودارزیابی، درک فرمول‌های شایستگی و مشاهده نحوه مربیگری هوش مصنوعی، لطفاً راهنمای تعاملی بدو ورود را بگذرانید.'
              }
            </p>
          </div>
          <button
            onClick={() => onNavigate('onboarding')}
            className="shrink-0 bg-teal-500 hover:bg-teal-600 text-slate-950 font-extrabold px-4.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-lg shadow-teal-500/20 hover:scale-[1.02] cursor-pointer relative z-10 self-start md:self-auto"
          >
            <BookOpen className="w-4 h-4" />
            <span>شروع آموزش بدو ورود</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <div className="absolute -right-4 -bottom-4 w-28 h-28 bg-teal-500/5 rounded-full blur-2xl pointer-events-none" />
        </div>
      )}

      {/* Top Cards Grid with Sequential Framer Motion Animation */}
      <motion.div 
        variants={staggerContainerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {/* Card 1 */}
        <motion.div 
          variants={topCardVariants}
          whileHover={{ y: -4, transition: { duration: 0.2 } }}
          className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 relative overflow-hidden group hover:border-teal-500/30 transition-all duration-300"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400">بانک مرکزی معیارها</p>
              <p className="text-3xl font-black text-slate-100 mt-2">{totalCriteria}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-3">شاخص‌های کمی (KPI) و شایستگی‌های رفتاری مصوب</p>
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-teal-500/5 to-transparent rounded-bl-full pointer-events-none" />
        </motion.div>

        {/* Card 2 */}
        <motion.div 
          variants={topCardVariants}
          whileHover={{ y: -4, transition: { duration: 0.2 } }}
          className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 relative overflow-hidden group hover:border-indigo-500/30 transition-all duration-300"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400">پروفایل‌های شایستگی</p>
              <p className="text-3xl font-black text-slate-100 mt-2">{totalProfiles}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Briefcase className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-3">الگوهای متمایز ارزیابی متناسب با خانواده‌های شغلی</p>
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-indigo-500/5 to-transparent rounded-bl-full pointer-events-none" />
        </motion.div>

        {/* Card 3 */}
        <motion.div 
          variants={topCardVariants}
          whileHover={{ y: -4, transition: { duration: 0.2 } }}
          className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 relative overflow-hidden group hover:border-sky-500/30 transition-all duration-300"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400">کل پرسنل ثبت شده</p>
              <p className="text-3xl font-black text-slate-100 mt-2">{totalEmployees}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-3">پرسنل تخصیص یافته به واحدهای عملیاتی و آزمایشگاهی</p>
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-sky-500/5 to-transparent rounded-bl-full pointer-events-none" />
        </motion.div>

        {/* Card 4 */}
        <motion.div 
          variants={topCardVariants}
          whileHover={{ y: -4, transition: { duration: 0.2 } }}
          className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-300"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400">میانگین امتیاز نهایی سازمان</p>
              <p className="text-3xl font-black text-slate-100 mt-2">
                {avgPerformance > 0 ? `${avgPerformance}٪` : '—'}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Award className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-3">محاسبه بر اساس نتایج کالیبره و نهایی شده (از ۱۰۰)</p>
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-emerald-500/5 to-transparent rounded-bl-full pointer-events-none" />
        </motion.div>
      </motion.div>

      {/* ==========================================================================
         Smart Competency Growth & Multi-Period Predictive AI Analytics
         ========================================================================== */}
      <SmartGrowthAnalytics 
        evaluations={evaluations}
        employees={employees}
        profiles={profiles}
        criteria={criteria}
        onSelectEvaluation={onSelectEvaluation}
      />

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column - 1/3 (Grade distribution & HR status) */}
        <div className="lg:col-span-1 space-y-6">
          {/* Status Progress */}
          <div className="bg-slate-800/30 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-200">وضعیت پیشرفت دوره‌ای ارزیابی‌ها</h3>
            
            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between mb-1.5 text-slate-400">
                  <span>پیش‌نویس / در دست ارزیابی ({draftEvals.length} مورد)</span>
                  <span className="font-semibold text-slate-300">{evaluations.length ? Math.round((draftEvals.length / evaluations.length) * 100) : 0}٪</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-500" style={{ width: `${evaluations.length ? (draftEvals.length / evaluations.length) * 100 : 0}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1.5 text-slate-400">
                  <span>کالیبره شده / در انتظار تایید ({calibratedEvals.length} مورد)</span>
                  <span className="font-semibold text-slate-300">{evaluations.length ? Math.round((calibratedEvals.length / evaluations.length) * 100) : 0}٪</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500" style={{ width: `${evaluations.length ? (calibratedEvals.length / evaluations.length) * 100 : 0}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1.5 text-slate-400">
                  <span>نهایی و قفل شده ({completedEvals.length} مورد)</span>
                  <span className="font-semibold text-slate-300">{evaluations.length ? Math.round((completedEvals.length / evaluations.length) * 100) : 0}٪</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500" style={{ width: `${evaluations.length ? (completedEvals.length / evaluations.length) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Competency 5-Dimension D3 Radar Chart */}
          <div className="bg-slate-800/30 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-bold text-slate-200">نمودار عنکبوتی ۵ بُعد شایستگی (D3)</h3>
              </div>
              
              <select
                value={radarEmpId}
                onChange={(e) => setRadarEmpId(e.target.value)}
                className="text-[11px] font-bold bg-slate-900 border border-slate-700 text-teal-300 px-2.5 py-1 rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="all">🏢 میانگین کل سازمان (اصفهان چالاک)</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>👤 {emp.name} ({emp.unit})</option>
                ))}
              </select>
            </div>

            <div className="flex justify-center py-2">
              <RadarChartD3 
                data={getCompetencyRadarData()}
                width={320}
                height={290}
                theme="dark"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
              <div className="flex items-center gap-1.5 text-teal-400 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                <span>عملکرد واقعی ارزیابی‌شده</span>
              </div>
              <div className="flex items-center gap-1.5 text-indigo-400 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span>تارگت و استاندارد هدف</span>
              </div>
            </div>
          </div>

          {/* Performance Grade Distribution Chart */}
          <div className="bg-slate-800/30 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-200">پراکندگی طبقات نمرات سازمان</h3>
              <span className="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-400 font-mono">N = {finalEvals.length}</span>
            </div>

            <div className="space-y-3.5">
              {(Object.keys(distribution) as Array<keyof typeof distribution>).map((grade) => {
                const count = distribution[grade];
                const percentage = finalEvals.length ? Math.round((count / finalEvals.length) * 100) : 0;
                const config = GRADE_DETAILS[grade];
                
                return (
                  <div key={grade} className="text-xs">
                    <div className="flex justify-between items-center mb-1 text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-slate-900 bg-${config.color}-400 text-[11px]`}>
                          {grade}
                        </span>
                        <span className="text-slate-300 font-medium">{config.label}</span>
                      </div>
                      <span className="font-semibold text-slate-300">{count} نفر ({percentage}٪)</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-800/60 rounded-full overflow-hidden">
                      <div 
                        className={`h-full bg-${config.color}-500/80 rounded-full transition-all duration-500`}
                        style={{ width: `${(count / maxDist) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-[10px] text-slate-500 text-center leading-relaxed">
              توزیع امتیازات باید تا حد امکان متناظر با منحنی نرمال باشد. انباشتگی نمرات در طبقه A نشانه احتمالی تورم نمرات است.
            </p>
          </div>
        </div>

        {/* Right Column - 2/3 (6-step cycle overview and quick actions) */}
        <div className="lg:col-span-2 space-y-6">
          {/* 6-step performance cycle interactive chart */}
          <div className="bg-slate-800/30 border border-slate-800 rounded-2xl p-5 space-y-5">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-teal-400" />
              <h3 className="text-sm font-bold text-slate-200">چرخه یکپارچه مدیریت عملکرد شایستگی‌محور (۶ماهه)</h3>
            </div>

            {/* Steps interactive timeline */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {CYCLE_STEPS.map((step) => {
                const isSelected = selectedCycleStep === step.step;
                return (
                  <button
                    key={step.step}
                    onClick={() => setSelectedCycleStep(step.step)}
                    className={`flex flex-col items-center p-3 rounded-xl border text-center transition-all ${
                      isSelected 
                        ? 'bg-gradient-to-b from-teal-500/10 to-indigo-500/5 border-teal-500/60 text-teal-300' 
                        : 'bg-slate-900/40 border-slate-800/80 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[11px] mb-2 ${
                      isSelected ? 'bg-teal-400 text-slate-900' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {step.step}
                    </span>
                    <span className="text-[10px] font-bold leading-tight line-clamp-2">{step.title}</span>
                  </button>
                );
              })}
            </div>

            {/* Selected step details */}
            {selectedCycleStep && (
              <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-4 text-xs leading-relaxed text-slate-300">
                <div className="flex items-center gap-2 mb-2 text-teal-300 font-bold">
                  <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                  <span>هدف و کارکرد گام {selectedCycleStep}: {CYCLE_STEPS[selectedCycleStep-1].title}</span>
                </div>
                <p className="text-slate-400 mb-3">{CYCLE_STEPS[selectedCycleStep-1].desc}</p>
                <p className="text-slate-500 text-[11px]">
                  {selectedCycleStep === 1 && '• در این گام اوزان و اهداف مصوب پروفایل شغلی به پرسنل تخصیص می‌یابد تا انتظارات کاملا شفاف و روشن باشد.'}
                  {selectedCycleStep === 2 && '• سرپرستان موظفند در طول دوره رفتارهای پرسنل را پایش کرده و بازخوردهای هدایت‌گر جهت اصلاح مسیر ارائه دهند.'}
                  {selectedCycleStep === 3 && '• کارمند با ارزشیابی کارکرد خود، پیش‌نیاز گفت‌وگوی دوطرفه را فراهم ساخته و حس مشارکت و بلوغ سازمانی را ارتقا می‌دهد.'}
                  {selectedCycleStep === 4 && '• سرپرست با ارزیابی دقیق نمرات ۱ تا ۵ و ثبت مستندات توجیهی برای نمرات خاص (۱، ۲ و ۵) مانع از اعمال سوگیری شخصی می‌شود.'}
                  {selectedCycleStep === 5 && '• کمیته تخصصی کالیبراسیون با مقایسه توزیع نمرات در تمام واحدها، استانداردهای نمره‌دهی سرپرستان مختلف را هم‌تراز می‌کند.'}
                  {selectedCycleStep === 6 && '• رتبه کالیبره شده نهایی به کارمند ابلاغ شده و گفت‌وگوی سازنده با محوریت نقاط قوت، توسعه و برنامه توسعه هوشمند (AI) شکل می‌گیرد.'}
                </p>
              </div>
            )}
          </div>

          {/* Recent Evaluations Table */}
          <div className="bg-slate-800/30 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-200">سوابق ارزیابی‌های اخیر</h3>
              <button 
                onClick={() => onNavigate('evaluations')} 
                className="text-xs font-bold text-teal-400 hover:text-teal-300 flex items-center gap-1"
              >
                <span>مشاهده همه ارزیابی‌ها</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            {evaluations.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300" dir="rtl">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 font-bold">
                      <th className="pb-3 text-right">پرسنل</th>
                      <th className="pb-3 text-right">عنوان شغلی</th>
                      <th className="pb-3 text-center">دوره</th>
                      <th className="pb-3 text-center">نمره نهایی</th>
                      <th className="pb-3 text-center">رتبه</th>
                      <th className="pb-3 text-center">وضعیت سند</th>
                      <th className="pb-3 text-left">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {evaluations.slice(-5).reverse().map((ev) => {
                      const emp = employees.find(e => e.id === ev.empId);
                      const prof = profiles.find(p => p.id === ev.profileId);
                      const finalScore = calculateFinalScore(ev, profiles);
                      const grade = finalScore > 0 ? getGrade(finalScore) : null;
                      const gradeConfig = grade ? GRADE_DETAILS[grade] : null;

                      return (
                        <tr key={ev.id} className="hover:bg-slate-800/10 transition-colors">
                          <td className="py-3 font-semibold text-slate-200">{emp?.name || 'نامشخص'}</td>
                          <td className="py-3 text-slate-400">{prof?.title || 'نامشخص'}</td>
                          <td className="py-3 text-center text-slate-400 font-mono">{ev.period}</td>
                          <td className="py-3 text-center font-bold text-slate-200">
                            {finalScore > 0 ? `${finalScore}٪` : '—'}
                          </td>
                          <td className="py-3 text-center">
                            {grade && gradeConfig ? (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold bg-${gradeConfig.color}-500/10 text-${gradeConfig.color}-300 border border-${gradeConfig.color}-500/20`}>
                                {grade} ({gradeConfig.label})
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="py-3 text-center">
                            {ev.status === 'locked' ? (
                              <span className="text-teal-400 font-bold">🔒 نهایی و قفل</span>
                            ) : ev.status === 'calibrated' ? (
                              <span className="text-indigo-400 font-bold">⚖️ کالیبره شده</span>
                            ) : (
                              <span className="text-slate-500">✏️ پیش‌نویس</span>
                            )}
                          </td>
                          <td className="py-3 text-left">
                            <button
                              onClick={() => {
                                if (onSelectEvaluation) {
                                  onSelectEvaluation(ev.id);
                                } else {
                                  onNavigate('evaluations');
                                }
                              }}
                              className="text-teal-400 hover:text-teal-300 font-bold hover:underline"
                            >
                              مشاهده
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500">
                <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p>هیچ ارزیابی فعالی ثبت نشده است.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ==========================================================================
         Supervisor & Leadership Operations Calendar Widget
         ========================================================================== */}
      {(currentUser.role === 'supervisor' || currentUser.role === 'admin') && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="mt-6"
        >
          <CalendarWidget
            currentUser={currentUser}
            evaluations={evaluations}
            onNavigate={onNavigate}
            theme={theme}
          />
        </motion.div>
      )}

      {/* ==========================================================================
         KPI & Coaching targets Planner
         ========================================================================== */}
      <div className="bg-slate-800/30 border border-slate-800 rounded-2xl p-5 space-y-6 mt-6">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-teal-400 animate-pulse" />
            <div>
              <h3 className="text-sm font-bold text-slate-200">سامانه هوشمند پایش اهداف کارگاهی و مربیگری (KPIs)</h3>
              <p className="text-[11px] text-slate-400">ثبت تارگت‌های عملیاتی، اهداف کارگاهی و یادداشت‌های مربیگری به تفکیک پرسنل</p>
            </div>
          </div>
          <span className="text-[10px] bg-teal-500/10 text-teal-400 px-2.5 py-1 rounded-full font-bold">پایش بیست‌و‌چهار ساعته خط</span>
        </div>

        {/* Target Form (Only for Admin & Supervisor) */}
        {currentUser.role !== 'employee' && (
          <form onSubmit={handleAddTarget} className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 text-right">
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400">انتخاب همکار</label>
              <select
                value={newTargetEmpId}
                onChange={(e) => setNewTargetEmpId(e.target.value)}
                required
                className="w-full text-xs p-2.5 rounded-lg border bg-slate-950 border-slate-800 text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">-- انتخاب همکار کارگاه --</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name} ({emp.unit})</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400">عنوان هدف عملیاتی</label>
              <input
                type="text"
                placeholder="مثال: کاهش ضایعات قالب‌گیری"
                value={newTargetTitle}
                onChange={(e) => setNewTargetTitle(e.target.value)}
                required
                className="w-full text-xs p-2.5 rounded-lg border bg-slate-950 border-slate-800 text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400">تارگت عددی / سنجه کیفی</label>
              <input
                type="text"
                placeholder="مثال: زیر ۱.۲٪ در ماه"
                value={newTargetValue}
                onChange={(e) => setNewTargetValue(e.target.value)}
                required
                className="w-full text-xs p-2.5 rounded-lg border bg-slate-950 border-slate-800 text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-slate-400">مهلت تحقق (ددلاین)</label>
              <input
                type="text"
                placeholder="مثال: ۱۴۰۵/۰۷/۳۰"
                value={newTargetDeadline}
                onChange={(e) => setNewTargetDeadline(e.target.value)}
                required
                className="w-full text-xs p-2.5 rounded-lg border bg-slate-950 border-slate-800 text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono text-center"
              />
            </div>

            <div className="space-y-1 lg:col-span-1 flex flex-col justify-end">
              <button
                type="submit"
                className="w-full bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold py-2.5 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-teal-500/10"
              >
                {editingTargetId ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                <span>{editingTargetId ? 'ذخیره ویرایش هدف' : 'ثبت هدف و اقدام'}</span>
              </button>
            </div>

            <div className="space-y-1 md:col-span-2 lg:col-span-5">
              <label className="block text-[10px] font-bold text-slate-400">توصیه توسعه‌ای و یادداشت مربیگری سرپرست (Coaching Note)</label>
              <textarea
                placeholder="مثال: گذراندن دوره SOP ماشین‌کاری و ثبت روزانه خطاهای فیکسچر در چک‌لیست..."
                rows={2}
                value={newTargetCoachingNote}
                onChange={(e) => setNewTargetCoachingNote(e.target.value)}
                className="w-full text-xs p-2.5 rounded-lg border bg-slate-950 border-slate-800 text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
              />
            </div>
          </form>
        )}

        {/* Grid List of Targets */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {targets.map(tgt => {
            const emp = employees.find(e => e.id === tgt.empId);
            const isCompleted = tgt.status === 'achieved';
            return (
              <div 
                key={tgt.id} 
                className={`border rounded-xl p-4.5 text-right flex flex-col justify-between gap-3 transition-all relative ${
                  isCompleted 
                    ? 'bg-teal-500/[0.02] border-teal-500/20' 
                    : 'bg-slate-900/20 border-slate-800'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{tgt.title}</h4>
                      <p className="text-[10px] text-slate-400 mt-1">همکار: <strong className="text-slate-300">{emp?.name || 'نامشخص'}</strong> ({emp?.unit})</p>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                      isCompleted 
                        ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' 
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}>
                      {isCompleted ? '🎯 تحقق یافته' : '⚙️ در حال اجرا'}
                    </span>
                  </div>

                  <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/40">
                    <div className="text-[10px] text-slate-500">شاخص هدف عملیاتی:</div>
                    <div className="text-xs font-extrabold text-teal-300 mt-0.5">{tgt.targetValue}</div>
                  </div>

                  {tgt.coachingNote && (
                    <div className="text-[10px] text-slate-400 leading-relaxed bg-slate-900/10 p-2 border-r-2 border-slate-700">
                      <strong>توصیه مربیگری:</strong> {tgt.coachingNote}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-800/40">
                  <span className="text-[10px] text-slate-500 font-mono">ددلاین: {tgt.deadline}</span>
                  <div className="flex items-center gap-1.5">
                    {currentUser.role !== 'employee' && (
                      <>
                        <button
                          onClick={() => handleToggleTargetStatus(tgt.id)}
                          title="تغییر وضعیت هدف"
                          className={`text-[10px] font-extrabold px-2 py-1 rounded transition-colors cursor-pointer ${
                            isCompleted 
                              ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' 
                              : 'bg-teal-500 text-slate-950 hover:bg-teal-600'
                          }`}
                        >
                          {isCompleted ? 'تغییر به جاری' : 'اتمام هدف'}
                        </button>
                        {currentUser.role === 'admin' && (
                          <button
                            onClick={() => handleEditTarget(tgt)}
                            title="ویرایش هدف"
                            className="text-indigo-400 hover:bg-indigo-500/10 p-1 rounded transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteTarget(tgt.id)}
                          title="حذف هدف"
                          className="text-red-400 hover:bg-red-500/10 p-1 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {targets.length === 0 && (
            <div className="col-span-full py-8 text-center text-slate-500">
              <Target className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs">هیچ هدف عملیاتی فعالی تعریف نشده است.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
