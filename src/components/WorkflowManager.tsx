/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { calculateFinalScore } from '../utils/formulaEngine';
import { createPortal } from 'react-dom';
import {
  GitFork,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Clock,
  Send,
  RotateCcw,
  CheckCheck,
  FileText,
  UserCheck,
  ShieldCheck,
  Scale,
  Users,
  Settings,
  Filter,
  Search,
  ChevronDown,
  ChevronUp,
  History,
  MessageSquare,
  Sparkles,
  Info,
  LockKeyhole,
  Check,
  CornerDownLeft,
  HelpCircle,
  TrendingUp,
  Award,
  Compass,
  Bell,
  UserPlus,
  X,
  ExternalLink,
  Layers,
  Flame,
  Zap,
  BookOpen,
  Target,
  Grid3X3,
  Sliders,
  UserX,
  Calendar,
  CheckSquare,
  Square,
  Trash2
} from 'lucide-react';
import { downloadWorkflowCalendarICS, DEFAULT_WORKFLOW_DEADLINES } from '../utils/calendarExport';
import { db } from '../utils/db';
import {
  Employee,
  Evaluation,
  JobProfile,
  Criterion,
  WorkflowStageKey,
  WorkflowTransitionLog,
  EvaluationRouteRule,
  IDPItem,
  GrievanceAppeal,
  WORKFLOW_STAGES,
  DEFAULT_ROUTE_RULES,
  NINE_BOX_MATRIX,
  UserRole,
  getGrade,
  GRADE_DETAILS
} from '../types';

interface WorkflowManagerProps {
  currentUser: Employee;
  evaluations: Evaluation[];
  employees: Employee[];
  profiles: JobProfile[];
  criteria: Criterion[];
  onUpdateEvaluation: (id: string, updatedEv: Evaluation) => void;
  onBulkUpdateEvaluations?: (updatedEvaluations: Evaluation[]) => void;
  onUpdateEmployees?: (updatedEmployees: Employee[]) => void;
  onSelectEvaluation?: (id: string) => void;
  onDeleteEvaluation?: (id: string) => void;
  onBulkDeleteEvaluations?: (ids: string[]) => void;
  theme: 'dark' | 'light';
}

export default function WorkflowManager({
  currentUser,
  evaluations,
  employees,
  profiles,
  criteria,
  onUpdateEvaluation,
  onBulkUpdateEvaluations,
  onUpdateEmployees,
  onSelectEvaluation,
  onDeleteEvaluation,
  onBulkDeleteEvaluations,
  theme
}: WorkflowManagerProps) {
  // Navigation Tabs:
  // 1. my_tasks: کارتابل اقدامات من
  // 2. all_workflows: ماتریس و زنجیره گردش کار کل پرسنل
  // 3. nine_box: ماتریس ۹ خانه‌ای استعداد و عملکرد
  // 4. idp_center: برنامه‌های توانمندسازی و توسعه فردی (IDP)
  // 5. appeals_center: سامانه تجدیدنظر و فرجام‌خواهی
  // 6. route_config: پیکربندی تفکیک مراحل و انتساب ارزیابان
  // 7. history_audit: ردپای گردش کار و لاگ تغییرات
  const [activeTab, setActiveTab] = useState<'my_tasks' | 'all_workflows' | 'nine_box' | 'idp_center' | 'appeals_center' | 'route_config' | 'history_audit'>('my_tasks');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('نیمه اول ۱۴۰۵');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<string>('all');
  const [nineBoxCategoryFilter, setNineBoxCategoryFilter] = useState<string>('all');

  // Optimistic local state for immediate reconciliation without full page reload
  const [localEvaluations, setLocalEvaluations] = useState<Evaluation[]>(evaluations);
  useEffect(() => {
    setLocalEvaluations(evaluations);
  }, [evaluations]);

  // Multi-select state for bulk actions
  const [selectedEvalIds, setSelectedEvalIds] = useState<string[]>([]);

  // Route rules state
  const [routeRules, setRouteRules] = useState<EvaluationRouteRule[]>(() => {
    const saved = localStorage.getItem('pe_route_rules');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_ROUTE_RULES;
      }
    }
    return DEFAULT_ROUTE_RULES;
  });

  // Modal / Action states
  const [selectedEvalForVisualModal, setSelectedEvalForVisualModal] = useState<Evaluation | null>(null);
  const [selectedEvalForAction, setSelectedEvalForAction] = useState<Evaluation | null>(null);
  const [actionType, setActionType] = useState<'advance' | 'reject' | 'override' | 'reassign' | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [overrideStage, setOverrideStage] = useState<WorkflowStageKey>('supervisor_review');
  const [reassignTargetId, setReassignTargetId] = useState<string>('');

  // IDP modal
  const [idpModalEval, setIdpModalEval] = useState<Evaluation | null>(null);
  const [newIdpArea, setNewIdpArea] = useState('');
  const [newIdpTitle, setNewIdpTitle] = useState('');
  const [newIdpType, setNewIdpType] = useState<IDPItem['actionType']>('training_course');
  const [newIdpDate, setNewIdpDate] = useState('۱۴۰۵/۰۸/۳۰');
  const [newIdpMentor, setNewIdpMentor] = useState('');

  // Appeal modal
  const [appealModalEval, setAppealModalEval] = useState<Evaluation | null>(null);
  const [appealReason, setAppealReason] = useState('');
  const [appealCriteriaIds, setAppealCriteriaIds] = useState<string[]>([]);
  const [reviewAppealVerdict, setReviewAppealVerdict] = useState<'accepted' | 'rejected'>('accepted');
  const [reviewAppealScoreDelta, setReviewAppealScoreDelta] = useState<number>(5);
  const [reviewAppealNotes, setReviewAppealNotes] = useState('');

  // Batch config state
  const [batchAssignUnit, setBatchAssignUnit] = useState('all');
  const [batchSupervisorId, setBatchSupervisorId] = useState('');
  const [batchApproverId, setBatchApproverId] = useState('');

  // Success Toast & Reminders
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'info' | 'warning' } | null>(null);

  const displayToast = (message: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setShowToast({ message, type });
    setTimeout(() => setShowToast(null), 4500);
  };

  // Deletion and Stage Redirection states
  const [evalToDelete, setEvalToDelete] = useState<Evaluation | null>(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
  const [isBulkRedirectModalOpen, setIsBulkRedirectModalOpen] = useState(false);
  const [bulkRedirectTargetStage, setBulkRedirectTargetStage] = useState<WorkflowStageKey>('calibration_review');
  const [bulkRedirectComment, setBulkRedirectComment] = useState('');

  const handleConfirmDeleteSingle = (ev: Evaluation) => {
    if (onDeleteEvaluation) {
      onDeleteEvaluation(ev.id);
    } else {
      const nextLocal = localEvaluations.filter(e => e.id !== ev.id);
      setLocalEvaluations(nextLocal);
      db.saveEvaluations(nextLocal);
      db.syncToCloudNow();
    }
    displayToast('پرونده ارزیابی با موفقیت حذف گردید.', 'success');
    setEvalToDelete(null);
  };

  const handleConfirmDeleteBulk = () => {
    if (selectedEvalIds.length === 0) return;
    if (onBulkDeleteEvaluations) {
      onBulkDeleteEvaluations(selectedEvalIds);
    } else if (onDeleteEvaluation) {
      selectedEvalIds.forEach(id => onDeleteEvaluation(id));
    } else {
      const nextLocal = localEvaluations.filter(e => !selectedEvalIds.includes(e.id));
      setLocalEvaluations(nextLocal);
      db.saveEvaluations(nextLocal);
      db.syncToCloudNow();
    }
    displayToast(`${selectedEvalIds.length} پرونده با موفقیت از سیستم حذف گردید.`, 'success');
    setSelectedEvalIds([]);
    setIsBulkDeleteModalOpen(false);
  };

  const handleConfirmBulkRedirect = () => {
    if (selectedEvalIds.length === 0) return;
    const timestamp = new Intl.DateTimeFormat('fa-IR', {
      dateStyle: 'short',
      timeStyle: 'medium'
    }).format(new Date());

    const updatedEvals: Evaluation[] = [];
    const nextLocalEvaluations = localEvaluations.map(ev => {
      if (!selectedEvalIds.includes(ev.id)) return ev;

      const fromStage = ev.stage;
      const logEntry: WorkflowTransitionLog = {
        id: `trans-bulk-redir-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        fromStage,
        toStage: bulkRedirectTargetStage,
        actorId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        action: 'admin_override',
        comment: bulkRedirectComment || 'هدایت گروهی به مرحله توسط مدیر سیستم',
        timestamp
      };

      let newStatus = ev.status;
      if (bulkRedirectTargetStage === 'completed') newStatus = 'locked';
      else if (bulkRedirectTargetStage === 'hr_approval' || bulkRedirectTargetStage === 'calibration_review') newStatus = 'calibrated';
      else newStatus = 'draft';

      const emp = employees.find(e => e.id === ev.empId);
      const resolvedAssignee = resolveCurrentAssignee({ ...ev, stage: bulkRedirectTargetStage }, emp);

      const updated: Evaluation = {
        ...ev,
        stage: bulkRedirectTargetStage,
        status: newStatus,
        currentAssigneeId: resolvedAssignee.id,
        currentAssigneeName: resolvedAssignee.name,
        currentAssigneeRole: resolvedAssignee.role,
        history: [logEntry, ...(ev.history || [])]
      };
      updatedEvals.push(updated);
      return updated;
    });

    setLocalEvaluations(nextLocalEvaluations);
    db.saveEvaluations(nextLocalEvaluations);
    db.syncToCloudNow();

    if (onBulkUpdateEvaluations && updatedEvals.length > 0) {
      onBulkUpdateEvaluations(updatedEvals);
    } else {
      updatedEvals.forEach(ue => onUpdateEvaluation(ue.id, ue));
    }

    displayToast(`${selectedEvalIds.length} پرونده با موفقیت به مرحله «${WORKFLOW_STAGES[bulkRedirectTargetStage]?.label}» هدایت گردیدند.`, 'success');
    setSelectedEvalIds([]);
    setIsBulkRedirectModalOpen(false);
    setBulkRedirectComment('');
  };

  // Unique units
  const availableUnits = useMemo(() => {
    const set = new Set<string>();
    employees.forEach(e => { if (e.unit) set.add(e.unit); });
    return Array.from(set);
  }, [employees]);

  // Score Calculator Helper
  
  // Helper to dynamically resolve EXACT current assignee for any evaluation
  const resolveCurrentAssignee = (ev: Evaluation, emp: Employee | undefined): {
    id: string;
    name: string;
    role: UserRole;
    code: string;
    unit: string;
    title: string;
  } => {
    if (!emp) {
      return { id: 'unknown', name: 'نامشخص', role: 'admin', code: '---', unit: '---', title: '---' };
    }

    const stage = ev.stage || 'self_review';

    if (stage === 'self_review') {
      return {
        id: emp.id,
        name: emp.name,
        role: emp.role,
        code: emp.code,
        unit: emp.unit,
        title: 'شاغل (ثبت خودارزیابی)'
      };
    }

    if (stage === 'supervisor_review') {
      const sup = employees.find(e => e.id === emp.supervisorId);
      if (sup) {
        return {
          id: sup.id,
          name: sup.name,
          role: sup.role,
          code: sup.code,
          unit: sup.unit,
          title: 'سرپرست مستقیم ارزیاب'
        };
      }
      // Fallback to unit supervisor or admin
      const unitSup = employees.find(e => e.unit === emp.unit && e.role === 'supervisor' && e.id !== emp.id);
      if (unitSup) {
        return { id: unitSup.id, name: unitSup.name, role: unitSup.role, code: unitSup.code, unit: unitSup.unit, title: 'سرپرست واحد' };
      }
      const admin = employees.find(e => e.role === 'admin') || employees[0];
      return { id: admin.id, name: admin.name, role: admin.role, code: admin.code, unit: 'منابع انسانی', title: 'مدیر ارشد (جانشین سرپرست)' };
    }

    if (stage === 'peer_review') {
      const peer = employees.find(e => e.id === emp.peerReviewerId);
      if (peer) {
        return { id: peer.id, name: peer.name, role: peer.role, code: peer.code, unit: peer.unit, title: 'ارزیاب همتا / ۳۶۰' };
      }
      const defaultPeer = employees.find(e => e.unit === emp.unit && e.id !== emp.id);
      if (defaultPeer) {
        return { id: defaultPeer.id, name: defaultPeer.name, role: defaultPeer.role, code: defaultPeer.code, unit: defaultPeer.unit, title: 'همکار هم‌واحد' };
      }
      return { id: 'peer-auto', name: 'کمیته بازخورد همتایان', role: 'supervisor', code: 'PEER', unit: emp.unit, title: 'ارزیاب ۳۶۰ درجه' };
    }

    if (stage === 'calibration_review') {
      const calib = employees.find(e => e.id === emp.calibrationLeadId) || employees.find(e => e.role === 'admin');
      return {
        id: calib?.id || 'calib-lead',
        name: calib?.name || 'کمیته کالیبراسیون و انطباق',
        role: 'admin',
        code: calib?.code || 'CAL-01',
        unit: 'تعالی سازمانی',
        title: 'عضو کمیته کالیبراسیون'
      };
    }

    if (stage === 'hr_approval') {
      const approver = employees.find(e => e.id === emp.approverId) || employees.find(e => e.role === 'admin');
      return {
        id: approver?.id || 'hr-lead',
        name: approver?.name || 'مدیر ارشد منابع انسانی',
        role: 'admin',
        code: approver?.code || 'HR-01',
        unit: 'معاونت سرمایه انسانی',
        title: 'تاییدکننده نهایی HR'
      };
    }

    if (stage === 'feedback_meeting') {
      const sup = employees.find(e => e.id === emp.supervisorId) || employees.find(e => e.role === 'supervisor');
      return {
        id: sup?.id || emp.id,
        name: `${sup?.name || 'سرپرست'} و ${emp.name}`,
        role: 'supervisor',
        code: sup?.code || emp.code,
        unit: emp.unit,
        title: 'جلسه بازخورد و تنظیم IDP'
      };
    }

    if (stage === 'appealed') {
      const admin = employees.find(e => e.role === 'admin') || employees[0];
      return {
        id: admin.id,
        name: 'کمیته تجدیدنظر و رسیدگی به فرجام‌خواهی',
        role: 'admin',
        code: admin.code,
        unit: 'مدیریت ارشد',
        title: 'داور رسیدگی به اعتراض'
      };
    }

    if (stage === 'rejected') {
      // Goes back to supervisor or employee
      const sup = employees.find(e => e.id === emp.supervisorId);
      return {
        id: sup?.id || emp.id,
        name: sup?.name || emp.name,
        role: sup?.role || 'employee',
        code: sup?.code || emp.code,
        unit: emp.unit,
        title: 'نیازمند اصلاح مستندات'
      };
    }

    return {
      id: 'completed',
      name: 'فرآیند تکمیل و بایگانی شده',
      role: 'admin',
      code: 'DONE',
      unit: 'سوابق پرسنلی',
      title: 'مختومه'
    };
  };

  // Normalize evaluations with stages and resolved assignees
  const normalizedEvaluations = useMemo(() => {
    return localEvaluations.map(ev => {
      const emp = employees.find(e => e.id === ev.empId);
      let stage: WorkflowStageKey = ev.stage || 'self_review';
      if (!ev.stage) {
        if (ev.status === 'locked') stage = 'completed';
        else if (ev.status === 'calibrated') stage = 'hr_approval';
        else {
          const hasSelf = ev.scores.some(s => s.self > 0);
          const hasScores = ev.scores.some(s => s.value > 0);
          if (hasScores) stage = 'calibration_review';
          else if (hasSelf) stage = 'supervisor_review';
          else stage = 'self_review';
        }
      }

      const assignee = resolveCurrentAssignee({ ...ev, stage }, emp);
      const score = calculateFinalScore(ev, profiles);
      const potential = ev.potentialScore || 3.5;

      // 9-Box classification
      const perfLevel: 'low' | 'medium' | 'high' = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';
      const potLevel: 'low' | 'medium' | 'high' = potential >= 4 ? 'high' : potential >= 2.5 ? 'medium' : 'low';
      const matrixKey = `${perfLevel}_${potLevel}` as keyof typeof NINE_BOX_MATRIX;
      const matrixDef = NINE_BOX_MATRIX[matrixKey] || NINE_BOX_MATRIX.med_med;

      return {
        ...ev,
        stage,
        currentAssigneeId: assignee.id,
        currentAssigneeName: assignee.name,
        currentAssigneeRole: assignee.role,
        potentialScore: potential,
        nineBoxPlacement: {
          performance: perfLevel,
          potential: potLevel,
          boxTitle: matrixDef.title,
          boxCategory: matrixDef.category
        }
      };
    });
  }, [localEvaluations, employees]);

  // SLA days calculator (mock dynamic based on creation/history)
  const calculateSlaDays = (ev: Evaluation) => {
    const lastLog = ev.history && ev.history.length > 0 ? ev.history[0] : null;
    if (!lastLog) return { days: 2, isBreached: false };
    // Estimate days
    const pseudoDays = Math.abs(ev.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 6) + 1;
    return {
      days: pseudoDays,
      isBreached: pseudoDays >= 5 && ev.stage !== 'completed'
    };
  };

  // Filter for "My Tasks"
  const myTaskEvaluations = useMemo(() => {
    return normalizedEvaluations.filter(ev => {
      if (ev.period !== selectedPeriod) return false;
      const emp = employees.find(e => e.id === ev.empId);
      if (!emp) return false;

      // Admin has access to committee, HR approvals, appeals and any overdue items
      if (currentUser.role === 'admin') {
        if (stageFilter !== 'all' && ev.stage !== stageFilter) return false;
        return ev.stage === 'calibration_review' || ev.stage === 'hr_approval' || ev.stage === 'appealed' || ev.stage === 'rejected';
      }

      // Supervisor tasks
      if (currentUser.role === 'supervisor') {
        const isMyDirectSubordinate = emp.supervisorId === currentUser.id || (!emp.supervisorId && emp.unit === currentUser.unit);
        const isAssignedToMe = ev.currentAssigneeId === currentUser.id;
        if ((isMyDirectSubordinate || isAssignedToMe) && (ev.stage === 'supervisor_review' || ev.stage === 'feedback_meeting' || ev.stage === 'peer_review' || ev.stage === 'rejected')) {
          if (stageFilter !== 'all' && ev.stage !== stageFilter) return false;
          return true;
        }
        return false;
      }

      // Employee tasks
      if (currentUser.role === 'employee') {
        return ev.empId === currentUser.id && (ev.stage === 'self_review' || ev.stage === 'feedback_meeting' || ev.stage === 'appealed');
      }

      return false;
    });
  }, [normalizedEvaluations, selectedPeriod, currentUser, employees, stageFilter]);

  // Filter for "All Workflows"
  const allFilteredEvaluations = useMemo(() => {
    return normalizedEvaluations.filter(ev => {
      if (ev.period !== selectedPeriod) return false;
      if (stageFilter !== 'all' && ev.stage !== stageFilter) return false;
      const emp = employees.find(e => e.id === ev.empId);
      if (!emp) return false;
      if (selectedUnit !== 'all' && emp.unit !== selectedUnit) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = emp.name.toLowerCase().includes(q);
        const matchesCode = emp.code.toLowerCase().includes(q);
        const matchesUnit = emp.unit.toLowerCase().includes(q);
        const matchesAssignee = (ev.currentAssigneeName || '').toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesUnit && !matchesAssignee) return false;
      }
      return true;
    });
  }, [normalizedEvaluations, selectedPeriod, stageFilter, selectedUnit, searchQuery, employees]);

  // Workflow statistics summary
  const workflowStats = useMemo(() => {
    const periodEvals = normalizedEvaluations.filter(e => e.period === selectedPeriod);
    const counts: Record<WorkflowStageKey, number> = {
      self_review: 0,
      supervisor_review: 0,
      peer_review: 0,
      calibration_review: 0,
      hr_approval: 0,
      feedback_meeting: 0,
      completed: 0,
      rejected: 0,
      appealed: 0
    };
    periodEvals.forEach(e => {
      if (counts[e.stage] !== undefined) {
        counts[e.stage]++;
      }
    });
    return {
      total: periodEvals.length,
      counts
    };
  }, [normalizedEvaluations, selectedPeriod]);

  // Execute stage transition
  const executeStageTransition = (
    evalItem: Evaluation,
    targetStage: WorkflowStageKey,
    act: WorkflowTransitionLog['action'],
    comment: string,
    targetAssigneeName?: string
  ) => {
    const newLog: WorkflowTransitionLog = {
      id: `trans-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      fromStage: evalItem.stage || 'self_review',
      toStage: targetStage,
      actorId: currentUser.id,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      action: act,
      comment: comment.trim() || undefined,
      targetAssigneeName,
      timestamp: new Intl.DateTimeFormat('fa-IR', {
        dateStyle: 'short',
        timeStyle: 'medium'
      }).format(new Date())
    };

    const currentHistory = evalItem.history || [];
    const updatedHistory = [newLog, ...currentHistory];

    let newStatus = evalItem.status;
    if (targetStage === 'completed') {
      newStatus = 'locked';
    } else if (targetStage === 'hr_approval' || targetStage === 'calibration_review') {
      newStatus = 'calibrated';
    } else {
      newStatus = 'draft';
    }

    const emp = employees.find(e => e.id === evalItem.empId);
    const resolvedNextAssignee = resolveCurrentAssignee({ ...evalItem, stage: targetStage }, emp);

    const updatedEval: Evaluation = {
      ...evalItem,
      stage: targetStage,
      status: newStatus,
      currentAssigneeId: resolvedNextAssignee.id,
      currentAssigneeName: resolvedNextAssignee.name,
      currentAssigneeRole: resolvedNextAssignee.role,
      rejectionReason: targetStage === 'rejected' ? comment : undefined,
      history: updatedHistory
    };

    // Optimistic local state update + persistent save
    const nextLocal = localEvaluations.map(e => e.id === evalItem.id ? updatedEval : e);
    setLocalEvaluations(nextLocal);
    db.saveEvaluations(nextLocal);
    db.syncToCloudNow();

    onUpdateEvaluation(evalItem.id, updatedEval);
    displayToast(`پرونده با موفقیت به مرحله «${WORKFLOW_STAGES[targetStage]?.label}» و کارتابل «${resolvedNextAssignee.name}» منتقل شد.`, 'success');

    setSelectedEvalForAction(null);
    setActionType(null);
    setActionComment('');
  };

  // Next standard step resolution
  const getNextStandardStage = (currentStage: WorkflowStageKey): WorkflowStageKey => {
    switch (currentStage) {
      case 'self_review': return 'supervisor_review';
      case 'supervisor_review': return 'calibration_review';
      case 'peer_review': return 'calibration_review';
      case 'calibration_review': return 'hr_approval';
      case 'hr_approval': return 'feedback_meeting';
      case 'feedback_meeting': return 'completed';
      case 'rejected': return 'supervisor_review';
      case 'appealed': return 'feedback_meeting';
      default: return 'completed';
    }
  };

  // Optimistic Apply Grouped Advance for selected items (No page reload)
  const handleApplyGroupedAdvance = () => {
    if (selectedEvalIds.length === 0) return;

    const timestamp = new Intl.DateTimeFormat('fa-IR', {
      dateStyle: 'short',
      timeStyle: 'medium'
    }).format(new Date());

    const updatedEvals: Evaluation[] = [];
    const nextLocalEvaluations = localEvaluations.map(ev => {
      if (!selectedEvalIds.includes(ev.id)) return ev;
      if (ev.stage === 'completed') return ev;

      const targetStage = getNextStandardStage(ev.stage);
      const stageInfo = WORKFLOW_STAGES[targetStage];
      const fromStage = ev.stage;
      const logEntry: WorkflowTransitionLog = {
        id: `trans-bulk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        fromStage,
        toStage: targetStage,
        actorId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        action: 'advance',
        timestamp,
        comment: `اعمال گروهی (Batch Action): انتقال به ${stageInfo?.label || targetStage}`
      };

      const emp = employees.find(e => e.id === ev.empId);
      const resolvedNextAssignee = resolveCurrentAssignee({ ...ev, stage: targetStage }, emp);

      let newStatus = ev.status;
      if (targetStage === 'completed') {
        newStatus = 'locked';
      } else if (targetStage === 'hr_approval' || targetStage === 'calibration_review') {
        newStatus = 'calibrated';
      } else {
        newStatus = 'draft';
      }

      const updated: Evaluation = {
        ...ev,
        stage: targetStage,
        status: newStatus,
        currentAssigneeId: resolvedNextAssignee.id,
        currentAssigneeName: resolvedNextAssignee.name,
        currentAssigneeRole: resolvedNextAssignee.role,
        history: [logEntry, ...(ev.history || [])]
      };

      updatedEvals.push(updated);
      return updated;
    });

    const affectedCount = updatedEvals.length;
    if (affectedCount === 0) {
      displayToast('هیچ پرونده واجد شرایطی جهت انتقال به گام بعد انتخاب نشده است.', 'warning');
      return;
    }

    // 1. Immediate optimistic UI reconciliation: component stays mounted and interactive without page re-render
    setLocalEvaluations(nextLocalEvaluations);
    setSelectedEvalIds([]);

    // 2. Persist to storage & cloud immediately
    db.saveEvaluations(nextLocalEvaluations);
    db.syncToCloudNow();

    // 3. Notify parent
    if (onBulkUpdateEvaluations) {
      onBulkUpdateEvaluations(nextLocalEvaluations);
    } else {
      updatedEvals.forEach(e => onUpdateEvaluation(e.id, e));
    }

    displayToast(`انتقال گروهی گام بعد بر روی ${affectedCount} پرونده با موفقیت و به‌صورت زنده اعمال گردید.`, 'success');
  };

  // Optimistic Apply Grouped for target stage
  const handleApplyGroupedStage = (targetStage: WorkflowStageKey, actionTitle: string) => {
    if (selectedEvalIds.length === 0) return;

    const timestamp = new Intl.DateTimeFormat('fa-IR', {
      dateStyle: 'short',
      timeStyle: 'medium'
    }).format(new Date());

    const updatedEvals: Evaluation[] = [];
    const nextLocalEvaluations = localEvaluations.map(ev => {
      if (!selectedEvalIds.includes(ev.id)) return ev;

      const stageInfo = WORKFLOW_STAGES[targetStage];
      const fromStage = ev.stage;
      const logEntry: WorkflowTransitionLog = {
        id: `trans-bulk-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        fromStage,
        toStage: targetStage,
        actorId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        action: 'advance',
        timestamp,
        comment: `اعمال گروهی (Batch Action): انتقال از ${WORKFLOW_STAGES[fromStage]?.label || fromStage} به ${stageInfo?.label || targetStage}`
      };

      const emp = employees.find(e => e.id === ev.empId);
      const resolvedNextAssignee = resolveCurrentAssignee({ ...ev, stage: targetStage }, emp);

      let newStatus = ev.status;
      if (targetStage === 'completed') {
        newStatus = 'locked';
      } else if (targetStage === 'hr_approval' || targetStage === 'calibration_review') {
        newStatus = 'calibrated';
      } else {
        newStatus = 'draft';
      }

      const updated: Evaluation = {
        ...ev,
        stage: targetStage,
        status: newStatus,
        currentAssigneeId: resolvedNextAssignee.id,
        currentAssigneeName: resolvedNextAssignee.name,
        currentAssigneeRole: resolvedNextAssignee.role,
        history: [logEntry, ...(ev.history || [])]
      };

      updatedEvals.push(updated);
      return updated;
    });

    const affectedCount = updatedEvals.length;

    // 1. Immediate optimistic UI reconciliation
    setLocalEvaluations(nextLocalEvaluations);
    setSelectedEvalIds([]);

    // 2. Persist to storage & cloud immediately
    db.saveEvaluations(nextLocalEvaluations);
    db.syncToCloudNow();

    // 3. Notify parent
    if (onBulkUpdateEvaluations) {
      onBulkUpdateEvaluations(nextLocalEvaluations);
    } else {
      updatedEvals.forEach(e => onUpdateEvaluation(e.id, e));
    }

    displayToast(`عملیات گروهی «${actionTitle}» بر روی ${affectedCount} پرونده با موفقیت و به‌صورت زنده اعمال گردید.`, 'success');
  };

  // Quick Action Handler
  const handleQuickAdvance = (ev: Evaluation) => {
    const nextStage = getNextStandardStage(ev.stage);
    let actionTypeLabel: WorkflowTransitionLog['action'] = 'submit_supervisor';
    if (ev.stage === 'self_review') actionTypeLabel = 'submit_self';
    else if (ev.stage === 'supervisor_review') actionTypeLabel = 'submit_supervisor';
    else if (ev.stage === 'peer_review') actionTypeLabel = 'submit_peer';
    else if (ev.stage === 'calibration_review') actionTypeLabel = 'approve_calibration';
    else if (ev.stage === 'hr_approval') actionTypeLabel = 'approve_hr';
    else if (ev.stage === 'feedback_meeting') actionTypeLabel = 'complete_feedback';

    executeStageTransition(ev, nextStage, actionTypeLabel, 'تایید و انتقال به مرحله بعدی از طریق کارتابل هوشمند');
  };

  // Send Smart Reminder Ping
  const handleSendReminderPing = (ev: Evaluation) => {
    const emp = employees.find(e => e.id === ev.empId);
    const assignee = resolveCurrentAssignee(ev, emp);
    displayToast(`پیام یادآور و اعلان اضطراری مهلت اقدام برای «${assignee.name}» ارسال گردید.`, 'info');
  };

  // Reassign Task Handler
  const handleExecuteReassign = () => {
    if (!selectedEvalForAction || !reassignTargetId) return;
    const targetEmp = employees.find(e => e.id === reassignTargetId);
    if (!targetEmp) return;

    const newLog: WorkflowTransitionLog = {
      id: `reassign-${Date.now()}`,
      fromStage: selectedEvalForAction.stage || 'supervisor_review',
      toStage: selectedEvalForAction.stage || 'supervisor_review',
      actorId: currentUser.id,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      action: 'reassign_assignee',
      comment: `ارجاع و تفویض پرونده به ${targetEmp.name}: ${actionComment || 'تغییر مسئول رسیدگی توسط مدیر سیستم'}`,
      targetAssigneeName: targetEmp.name,
      timestamp: new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date())
    };

    const updatedEval: Evaluation = {
      ...selectedEvalForAction,
      currentAssigneeId: targetEmp.id,
      currentAssigneeName: targetEmp.name,
      currentAssigneeRole: targetEmp.role,
      history: [newLog, ...(selectedEvalForAction.history || [])]
    };

    onUpdateEvaluation(selectedEvalForAction.id, updatedEval);
    displayToast(`پرونده با موفقیت به کارتابل «${targetEmp.name}» ارجاع گردید.`, 'success');
    setSelectedEvalForAction(null);
    setActionType(null);
    setActionComment('');
    setReassignTargetId('');
  };

  // Add IDP action handler
  const handleAddIdpItem = () => {
    if (!idpModalEval || !newIdpTitle.trim()) return;

    const newItem: IDPItem = {
      id: `idp-${Date.now()}`,
      competencyArea: newIdpArea || 'شایستگی‌های عمومی و عملکردی',
      actionType: newIdpType,
      title: newIdpTitle.trim(),
      description: `برنامه توانمندسازی اختصاصی جهت ارتقای سطح عملکرد در ${selectedPeriod}`,
      targetDate: newIdpDate,
      mentorName: newIdpMentor || currentUser.name,
      status: 'planned'
    };

    const existingIdps = idpModalEval.idpItems || [];
    const updatedEval: Evaluation = {
      ...idpModalEval,
      idpItems: [...existingIdps, newItem]
    };

    onUpdateEvaluation(idpModalEval.id, updatedEval);
    setIdpModalEval(updatedEval);
    setNewIdpTitle('');
    setNewIdpArea('');
    displayToast('برنامه بهبود و اقدام توانمندسازی با موفقیت ثبت شد.', 'success');
  };

  // Submit Appeal Handler (Employee)
  const handleSubmitAppeal = () => {
    if (!appealModalEval || !appealReason.trim()) return;

    const newAppeal: GrievanceAppeal = {
      id: `appeal-${Date.now()}`,
      evalId: appealModalEval.id,
      empId: appealModalEval.empId,
      period: appealModalEval.period,
      appealedCriteriaIds: appealCriteriaIds,
      reason: appealReason.trim(),
      status: 'submitted',
      submittedAt: new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date())
    };

    executeStageTransition(
      appealModalEval,
      'appealed',
      'submit_appeal',
      `ثبت اعتراض رسمی شاغل نسبت به نتایج ارزیابی: ${appealReason}`
    );

    const updatedEval: Evaluation = {
      ...appealModalEval,
      stage: 'appealed',
      appeal: newAppeal
    };
    onUpdateEvaluation(appealModalEval.id, updatedEval);
    setAppealModalEval(null);
    setAppealReason('');
    setAppealCriteriaIds([]);
  };

  // Review Appeal Handler (HR / Committee)
  const handleReviewAppeal = () => {
    if (!appealModalEval || !appealModalEval.appeal) return;

    const isAccepted = reviewAppealVerdict === 'accepted';
    const updatedAppeal: GrievanceAppeal = {
      ...appealModalEval.appeal,
      status: isAccepted ? 'accepted_modified' : 'rejected_upheld',
      reviewedAt: new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date()),
      reviewerName: currentUser.name,
      committeeDecision: reviewAppealNotes || (isAccepted ? 'اعتراض موجه تشخیص داده شد و نمرات تعدیل گردید.' : 'پس از بازبینی مستندات، نمرات قبلی مورد تایید قرار گرفت.'),
      adjustedScoreDelta: isAccepted ? reviewAppealScoreDelta : 0
    };

    executeStageTransition(
      appealModalEval,
      'feedback_meeting',
      'resolve_appeal',
      `رسیدگی به فرجام‌خواهی توسط کمیته (${isAccepted ? 'پذیرش و اصلاح' : 'رد اعتراض و تایید نهایی'}): ${reviewAppealNotes}`
    );

    const updatedEval: Evaluation = {
      ...appealModalEval,
      stage: 'feedback_meeting',
      appeal: updatedAppeal
    };
    onUpdateEvaluation(appealModalEval.id, updatedEval);
    setAppealModalEval(null);
    setReviewAppealNotes('');
  };

  // Batch Assign Supervisor / Approver Handler
  const handleExecuteBatchAssign = () => {
    if (!batchSupervisorId && !batchApproverId) {
      displayToast('لطفاً حداقل یک سرپرست یا تاییدکننده نهایی را انتخاب کنید.', 'warning');
      return;
    }

    const stored = JSON.parse(localStorage.getItem('pe_employees') || '[]');
    const updatedList = stored.map((item: Employee) => {
      if (batchAssignUnit === 'all' || item.unit === batchAssignUnit) {
        return {
          ...item,
          supervisorId: batchSupervisorId ? batchSupervisorId : item.supervisorId,
          approverId: batchApproverId ? batchApproverId : item.approverId
        };
      }
      return item;
    });

    db.saveEmployees(updatedList);
    if (onUpdateEmployees) {
      onUpdateEmployees(updatedList);
    }
    displayToast(`ماتریس انتساب سرپرستان و تاییدکنندگان برای پرسنل واحد ${batchAssignUnit === 'all' ? 'کل سازمان' : batchAssignUnit} با موفقیت به‌روزرسانی شد.`, 'success');
  };

  return (
    <div className="space-y-6 text-right pb-20 font-sans" dir="rtl">
      {/* --- TOP BANNER & STATS --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-6 rounded-3xl shadow-2xl backdrop-blur-2xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center shrink-0 shadow-inner">
            <GitFork className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black text-slate-100 tracking-tight">سامانه جامع گردش کار و مدیریت عملکرد سازمانی</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                Enterprise PMS
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              پایش لحظه‌ای موقعیت پرونده‌ها، ماتریس تفکیک سرپرستان، ماتریس ۹ خانه‌ای استعداد، برنامه‌های IDP و کارتابل رسیدگی به اعتراضات
            </p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => downloadWorkflowCalendarICS(DEFAULT_WORKFLOW_DEADLINES)}
            className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3.5 py-2 rounded-2xl flex items-center gap-2 text-xs font-bold transition-all cursor-pointer shadow-sm"
            title="دانلود تقویم سررسید ارزیابی (.ics) جهت ثبت در Google Calendar و Outlook"
          >
            <Calendar className="w-4 h-4 text-indigo-400" />
            <span>خروجی تقویم مهلت‌ها (.ics)</span>
          </button>

          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-2xl">
            <Clock className="w-4 h-4 text-teal-400" />
            <span className="text-xs text-slate-400 font-medium">دوره ارزیابی:</span>
            <select
              value={selectedPeriod}
              onChange={e => setSelectedPeriod(e.target.value)}
              className="bg-transparent text-xs font-bold text-teal-300 focus:outline-none cursor-pointer"
            >
              <option value="نیمه اول ۱۴۰۵" className="bg-slate-900">نیمه اول ۱۴۰۵</option>
              <option value="نیمه دوم ۱۴۰۴" className="bg-slate-900">نیمه دوم ۱۴۰۴</option>
              <option value="نیمه اول ۱۴۰۴" className="bg-slate-900">نیمه اول ۱۴۰۴</option>
            </select>
          </div>

          <div className="bg-indigo-500/10 border border-indigo-500/30 px-3.5 py-2 rounded-2xl flex items-center gap-2 text-indigo-300">
            <UserCheck className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-bold">
              کاربر فعال: <span className="text-white">{currentUser.name}</span> ({currentUser.role === 'admin' ? 'مدیر سیستم' : currentUser.role === 'supervisor' ? 'سرپرست مستقیم' : 'کارمند'})
            </span>
          </div>
        </div>
      </div>

      {/* --- TOAST ALERT NOTIFICATION --- */}
      {showToast && (
        <div className={`p-4 rounded-2xl border flex items-center justify-between animate-fade-in shadow-xl ${
          showToast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' :
          showToast.type === 'warning' ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' :
          'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
        }`}>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span className="text-xs font-bold">{showToast.message}</span>
          </div>
          <button onClick={() => setShowToast(null)} className="text-xs opacity-70 hover:opacity-100 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* --- WORKFLOW STAGE PIPELINE SUMMARY --- */}
      <div className="bg-slate-900/60 border border-slate-800/80 p-5 rounded-3xl overflow-x-auto shadow-md">
        <div className="flex items-center justify-between min-w-[900px] relative">
          <div className="absolute top-1/2 left-8 right-8 h-1 bg-slate-800 -translate-y-1/2 z-0"></div>

          {(['self_review', 'supervisor_review', 'peer_review', 'calibration_review', 'hr_approval', 'feedback_meeting', 'completed'] as WorkflowStageKey[]).map((stKey) => {
            const st = WORKFLOW_STAGES[stKey];
            const count = workflowStats.counts[stKey] || 0;

            return (
              <button
                key={stKey}
                onClick={() => setStageFilter(stageFilter === stKey ? 'all' : stKey)}
                className={`relative z-10 flex flex-col items-center group transition-all text-center p-2.5 rounded-2xl ${
                  stageFilter === stKey ? 'bg-slate-800 border-2 border-teal-500 shadow-xl scale-105' : 'hover:bg-slate-800/50'
                }`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm transition-all shadow-md ${
                  count > 0 ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 ring-4 ring-teal-500/10' : 'bg-slate-800 text-slate-500 border border-slate-700'
                }`}>
                  {count}
                </div>
                <span className="text-xs font-bold text-slate-200 mt-2 whitespace-nowrap">{st.label}</span>
                <span className="text-[10px] text-slate-400 mt-0.5">{st.responsibleLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Special Alerts for Rejected or Appealed */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {workflowStats.counts.rejected > 0 && (
              <button
                onClick={() => setStageFilter('rejected')}
                className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1.5 hover:bg-rose-500/20 transition"
              >
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <span>{workflowStats.counts.rejected} پرونده عودت داده‌شده جهت اصلاح</span>
              </button>
            )}

            {workflowStats.counts.appealed > 0 && (
              <button
                onClick={() => { setActiveTab('appeals_center'); }}
                className="px-3 py-1.5 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-300 text-xs font-bold flex items-center gap-1.5 hover:bg-orange-500/20 transition"
              >
                <Flame className="w-4 h-4 text-orange-400" />
                <span>{workflowStats.counts.appealed} اعتراض جدید در حال رسیدگی فرجام‌خواهی</span>
              </button>
            )}
          </div>

          {stageFilter !== 'all' && (
            <button
              onClick={() => setStageFilter('all')}
              className="text-xs text-teal-400 hover:text-teal-300 font-bold flex items-center gap-1"
            >
              <span>نمایش همه مراحل ({normalizedEvaluations.length})</span>
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* --- NAVIGATION TABS --- */}
      <div className="sticky top-0 z-30 flex border-b border-slate-800 gap-2 p-2 overflow-x-auto bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-xl">
        <button
          onClick={() => setActiveTab('my_tasks')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs transition-all shrink-0 ${
            activeTab === 'my_tasks'
              ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>کارتابل اقدامات من</span>
          {myTaskEvaluations.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'my_tasks' ? 'bg-slate-950 text-teal-400' : 'bg-teal-500 text-slate-950'
            }`}>
              {myTaskEvaluations.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('all_workflows')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs transition-all shrink-0 ${
            activeTab === 'all_workflows'
              ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <GitFork className="w-4 h-4" />
          <span>زنجیره گردش کار کل پرسنل</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
            {allFilteredEvaluations.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('nine_box')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs transition-all shrink-0 ${
            activeTab === 'nine_box'
              ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Grid3X3 className="w-4 h-4" />
          <span>ماتریس ۹ خانه‌ای استعداد (9-Box Grid)</span>
        </button>

        <button
          onClick={() => setActiveTab('idp_center')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs transition-all shrink-0 ${
            activeTab === 'idp_center'
              ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Target className="w-4 h-4" />
          <span>برنامه‌های توانمندسازی و IDP</span>
        </button>

        <button
          onClick={() => setActiveTab('appeals_center')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs transition-all shrink-0 ${
            activeTab === 'appeals_center'
              ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>سامانه فرجام‌خواهی و اعتراضات</span>
          {workflowStats.counts.appealed > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-500 text-white">
              {workflowStats.counts.appealed}
            </span>
          )}
        </button>

        {currentUser.role === 'admin' && (
          <button
            onClick={() => setActiveTab('route_config')}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs transition-all shrink-0 ${
              activeTab === 'route_config'
                ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>پیکربندی مسیرها و انتساب ارزیابان</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('history_audit')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs transition-all shrink-0 ${
            activeTab === 'history_audit'
              ? 'bg-teal-500 text-slate-950 shadow-lg shadow-teal-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <History className="w-4 h-4" />
          <span>ردپای گردش کار و لاگ رویدادها</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MY TASKS (کارتابل اقدامات من) */}
      {/* ========================================================================= */}
      {activeTab === 'my_tasks' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/70 p-4 rounded-3xl border border-slate-800">
            <div className="text-xs text-slate-300 font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
              <span>
                اقدامات نیازمند بررسی توسط <strong>{currentUser.name}</strong> در دوره {selectedPeriod} ({myTaskEvaluations.length} پرونده)
              </span>
            </div>

            {myTaskEvaluations.length > 0 && currentUser.role === 'admin' && (
              <button
                onClick={() => {
                  myTaskEvaluations.forEach(ev => handleQuickAdvance(ev));
                }}
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-md shadow-indigo-500/20"
              >
                <CheckCheck className="w-4 h-4" />
                <span>تایید دسته‌ای تمامی موارد کارتابل من</span>
              </button>
            )}
          </div>

          {myTaskEvaluations.length === 0 ? (
            <div className="p-16 text-center bg-slate-900/40 border border-slate-800/60 rounded-3xl">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                <CheckCheck className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-200">کارتابل شما خالی است</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                تمامی ارزیابی‌های مربوط به مرحله مسئولیت شما برای دوره {selectedPeriod} انجام یا تایید شده‌اند.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {myTaskEvaluations.map(ev => {
                const emp = employees.find(e => e.id === ev.empId);
                const prof = profiles.find(p => p.id === ev.profileId);
                const stageInfo = WORKFLOW_STAGES[ev.stage];
                const score = calculateFinalScore(ev, profiles);
                const grade = getGrade(score);
                const sla = calculateSlaDays(ev);

                return (
                  <div
                    key={ev.id}
                    className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl hover:border-slate-700 transition flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Header Badges */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black border ${
                          ev.stage === 'self_review' ? 'bg-blue-500/10 text-blue-300 border-blue-500/30' :
                          ev.stage === 'supervisor_review' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                          ev.stage === 'peer_review' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' :
                          ev.stage === 'calibration_review' ? 'bg-purple-500/10 text-purple-300 border-purple-500/30' :
                          ev.stage === 'hr_approval' ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30' :
                          ev.stage === 'feedback_meeting' ? 'bg-teal-500/10 text-teal-300 border-teal-500/30' :
                          ev.stage === 'appealed' ? 'bg-orange-500/10 text-orange-300 border-orange-500/30' :
                          ev.stage === 'rejected' ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' :
                          'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        }`}>
                          مرحله: {stageInfo.label}
                        </span>

                        <span className={`text-[10px] px-2 py-0.5 rounded-lg font-mono font-bold ${
                          sla.isBreached ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse' : 'bg-slate-950 text-slate-400'
                        }`}>
                          {sla.days} روز در کارتابل
                        </span>
                      </div>

                      {/* Employee Info */}
                      <h3 className="text-base font-bold text-slate-100">{emp?.name}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{prof?.title} • {emp?.unit}</p>

                      {/* Current Assignee Card */}
                      <div className="mt-3 p-2.5 rounded-2xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center text-xs font-black">
                            {ev.currentAssigneeName?.slice(0, 1) || '؟'}
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-400">در کارتابل:</div>
                            <div className="text-xs font-bold text-teal-300">{ev.currentAssigneeName}</div>
                          </div>
                        </div>

                        <button
                          onClick={() => setSelectedEvalForVisualModal(ev)}
                          className="text-[10px] text-slate-400 hover:text-teal-300 underline font-medium"
                        >
                          مشاهده مسیر
                        </button>
                      </div>

                      {/* Score Summary */}
                      <div className="mt-3 p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400">نمره عملکرد:</span>
                          <p className="text-sm font-black text-teal-400 mt-0.5">{score} از ۱۰۰</p>
                        </div>
                        <div className="text-left">
                          <span className="text-[10px] text-slate-400">رتبه شایستگی:</span>
                          <p className="text-sm font-black text-indigo-400 mt-0.5">سطح {grade}</p>
                        </div>
                      </div>

                      {/* Rejection Note */}
                      {ev.rejectionReason && (
                        <div className="mt-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                          <div className="font-bold flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                            علت عودت:
                          </div>
                          <p className="mt-1 text-[11px] text-rose-200">{ev.rejectionReason}</p>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="mt-5 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => handleQuickAdvance(ev)}
                        className="flex-1 py-2 px-3 bg-teal-500 hover:bg-teal-400 text-slate-950 font-black rounded-xl text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-teal-500/20"
                      >
                        <Check className="w-4 h-4" />
                        <span>تایید و ارسال به مرحله بعد</span>
                      </button>

                      {currentUser.role !== 'employee' && (
                        <button
                          onClick={() => {
                            setSelectedEvalForAction(ev);
                            setActionType('reject');
                            setActionComment('');
                          }}
                          className="p-2 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/30 rounded-xl text-xs transition cursor-pointer"
                          title="عودت پرونده جهت اصلاح"
                        >
                          <CornerDownLeft className="w-4 h-4" />
                        </button>
                      )}

                      {/* Admin Override Stage & Delete in My Tasks */}
                      {currentUser.role === 'admin' && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedEvalForAction(ev);
                              setActionType('override');
                              setOverrideStage(ev.stage);
                            }}
                            className="p-2 bg-slate-800 hover:bg-purple-600 text-slate-300 hover:text-white rounded-xl text-xs transition cursor-pointer"
                            title="تغییر مستقیم مرحله (ادمین)"
                          >
                            <Settings className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setEvalToDelete(ev)}
                            className="p-2 bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white rounded-xl text-xs transition cursor-pointer"
                            title="حذف این پرونده ارزیابی"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}

                      <button
                        onClick={() => setSelectedEvalForVisualModal(ev)}
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition cursor-pointer"
                        title="مشاهده جزئیات چرخه و لاگ"
                      >
                        <GitFork className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ALL WORKFLOWS (ماتریس و زنجیره گردش کار کل سازمان) */}
      {/* ========================================================================= */}
      {activeTab === 'all_workflows' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="sticky top-16 z-20 bg-slate-900/95 backdrop-blur-xl border border-slate-800 p-4 rounded-3xl flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="جستجوی همکار، کد، سرپرست یا کارتابل..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs text-slate-200 pr-9 pl-4 py-2 rounded-xl focus:border-teal-500 focus:outline-none w-72"
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">مرحله:</span>
                <select
                  value={stageFilter}
                  onChange={e => setStageFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs text-slate-200 px-3 py-2 rounded-xl focus:border-teal-500 focus:outline-none"
                >
                  <option value="all">همه مراحل ({normalizedEvaluations.length})</option>
                  {Object.entries(WORKFLOW_STAGES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">واحد:</span>
                <select
                  value={selectedUnit}
                  onChange={e => setSelectedUnit(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs text-slate-200 px-3 py-2 rounded-xl focus:border-teal-500 focus:outline-none"
                >
                  <option value="all">همه واحدها</option>
                  {availableUnits.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-xs text-slate-400">
              نمایش {allFilteredEvaluations.length} از {normalizedEvaluations.length} پرونده ارزیابی
            </div>
          </div>

          {/* Sticky Grouped Action Bar for Batch Operations */}
          {selectedEvalIds.length > 0 && (
            <div className="sticky top-32 z-25 bg-slate-900/95 backdrop-blur-xl border-2 border-teal-500/60 shadow-2xl rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 text-slate-100 my-2 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center font-bold text-sm font-mono border border-teal-500/40">
                  {selectedEvalIds.length}
                </span>
                <div>
                  <div className="font-bold text-xs text-slate-100 flex items-center gap-1.5">
                    <span>پرونده ارزیابی انتخاب‌شده جهت اقدام گروهی</span>
                    <span className="px-2 py-0.5 bg-teal-500/20 text-teal-300 rounded-full text-[10px] font-bold">مدیریت گروهی</span>
                  </div>
                  <div className="text-[11px] text-slate-400">تغییر وضعیت، انتقال به مرحله دلخواه یا حذف دسته‌جمعی</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Apply Grouped: Advance to Next Stage */}
                <button
                  type="button"
                  onClick={handleApplyGroupedAdvance}
                  className="px-3.5 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-black rounded-xl text-xs transition flex items-center gap-1.5 shadow-lg shadow-teal-500/20 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>انتقال به گام بعد</span>
                </button>

                {/* Admin Bulk Stage Redirection */}
                {currentUser.role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => setIsBulkRedirectModalOpen(true)}
                    className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-lg shadow-purple-600/20 cursor-pointer"
                  >
                    <Settings className="w-4 h-4" />
                    <span>هدایت گروهی به مرحله دلخواه</span>
                  </button>
                )}

                {/* Apply Grouped: Move to Calibration */}
                <button
                  type="button"
                  onClick={() => handleApplyGroupedStage('calibration_review', 'ارسال به کالیبراسیون')}
                  className="px-3.5 py-2 bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white border border-purple-500/40 font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Scale className="w-4 h-4" />
                  <span>ارسال به کالیبراسیون</span>
                </button>

                {/* Apply Grouped: HR Final Approval */}
                <button
                  type="button"
                  onClick={() => handleApplyGroupedStage('completed', 'تصویب و تکمیل نهایی')}
                  className="px-3.5 py-2 bg-emerald-600/30 hover:bg-emerald-600 text-emerald-200 hover:text-white border border-emerald-500/40 font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCheck className="w-4 h-4" />
                  <span>تصویب نهایی</span>
                </button>

                {/* Admin Bulk Delete */}
                {currentUser.role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => setIsBulkDeleteModalOpen(true)}
                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-lg shadow-rose-600/20 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>حذف گروهی ({selectedEvalIds.length})</span>
                  </button>
                )}

                {/* Deselect All */}
                <button
                  type="button"
                  onClick={() => setSelectedEvalIds([])}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-xl text-xs transition cursor-pointer"
                >
                  لغو انتخاب
                </button>
              </div>
            </div>
          )}

          {/* Full Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-md">
                  <tr className="text-slate-400 border-b border-slate-800 font-bold">
                    <th className="py-3.5 px-3 w-10 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedEvalIds.length === allFilteredEvaluations.length) {
                            setSelectedEvalIds([]);
                          } else {
                            setSelectedEvalIds(allFilteredEvaluations.map(e => e.id));
                          }
                        }}
                        className="text-slate-400 hover:text-teal-400 p-1 transition cursor-pointer"
                        title="انتخاب همه پرونده‌های این لیست"
                      >
                        {selectedEvalIds.length > 0 && selectedEvalIds.length === allFilteredEvaluations.length ? (
                          <CheckSquare className="w-4 h-4 text-teal-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500" />
                        )}
                      </button>
                    </th>
                    <th className="py-3.5 px-4">همکار و کد پرسنلی</th>
                    <th className="py-3.5 px-4">عنوان شغلی و واحد</th>
                    <th className="py-3.5 px-4">سرپرست مستقیم ارزیاب</th>
                    <th className="py-3.5 px-4">مرحله فعلی</th>
                    <th className="py-3.5 px-4">در انتظار اقدام (کارتابل چه کسی است؟)</th>
                    <th className="py-3.5 px-4">نمره و رتبه</th>
                    <th className="py-3.5 px-4">مهلت و SLA</th>
                    <th className="py-3.5 px-4 text-center">عملیات و مدیریت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {allFilteredEvaluations.map(ev => {
                    const emp = employees.find(e => e.id === ev.empId);
                    const prof = profiles.find(p => p.id === ev.profileId);
                    const supervisor = employees.find(e => e.id === emp?.supervisorId);
                    const stageInfo = WORKFLOW_STAGES[ev.stage];
                    const score = calculateFinalScore(ev, profiles);
                    const grade = getGrade(score);
                    const sla = calculateSlaDays(ev);

                    return (
                      <tr key={ev.id} className={`hover:bg-slate-800/30 transition-colors ${selectedEvalIds.includes(ev.id) ? 'bg-teal-500/5' : ''}`}>
                        <td className="py-3.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedEvalIds(prev =>
                                prev.includes(ev.id) ? prev.filter(x => x !== ev.id) : [...prev, ev.id]
                              );
                            }}
                            className="text-slate-400 hover:text-teal-400 p-1 transition cursor-pointer"
                          >
                            {selectedEvalIds.includes(ev.id) ? (
                              <CheckSquare className="w-4 h-4 text-teal-400" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-600" />
                            )}
                          </button>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-100">{emp?.name || 'نامشخص'}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{emp?.code}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="text-slate-200">{prof?.title || '-'}</div>
                          <div className="text-[10px] text-slate-400">{emp?.unit}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="text-slate-300 font-medium">
                            {supervisor ? supervisor.name : <span className="text-slate-500 italic">تعریف‌نشده</span>}
                          </div>
                          <div className="text-[10px] text-slate-500">{supervisor?.unit || 'پیش‌فرض واحد'}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black border ${
                            ev.stage === 'self_review' ? 'bg-blue-500/10 text-blue-300 border-blue-500/30' :
                            ev.stage === 'supervisor_review' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                            ev.stage === 'peer_review' ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' :
                            ev.stage === 'calibration_review' ? 'bg-purple-500/10 text-purple-300 border-purple-500/30' :
                            ev.stage === 'hr_approval' ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30' :
                            ev.stage === 'feedback_meeting' ? 'bg-teal-500/10 text-teal-300 border-teal-500/30' :
                            ev.stage === 'appealed' ? 'bg-orange-500/10 text-orange-300 border-orange-500/30' :
                            ev.stage === 'rejected' ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' :
                            'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          }`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                            {stageInfo.label}
                          </span>
                        </td>

                        {/* Exact Current Assignee */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-teal-500/20 text-teal-300 flex items-center justify-center font-bold text-[10px]">
                              {ev.currentAssigneeName?.slice(0, 1)}
                            </div>
                            <div>
                              <div className="font-bold text-slate-100">{ev.currentAssigneeName}</div>
                              <div className="text-[10px] text-slate-400">
                                {ev.currentAssigneeRole === 'admin' ? 'مدیریت ارشد HR' : ev.currentAssigneeRole === 'supervisor' ? 'سرپرست مستقیم' : 'شاغل'}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-mono font-bold text-teal-400">{score}</span>
                          <span className="text-slate-400 text-[10px] mx-1">({grade})</span>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[11px] font-mono font-bold ${
                              sla.isBreached ? 'text-rose-400' : 'text-slate-300'
                            }`}>
                              {sla.days} روز
                            </span>
                            {sla.isBreached && (
                              <button
                                onClick={() => handleSendReminderPing(ev)}
                                className="p-1 bg-rose-500/10 text-rose-400 hover:bg-rose-500 hover:text-white rounded-lg transition"
                                title="ارسال پیام یادآور اضطراری"
                              >
                                <Bell className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Fast Step Button */}
                            {ev.stage !== 'completed' && (
                              <button
                                onClick={() => handleQuickAdvance(ev)}
                                className="px-2.5 py-1 bg-teal-500/20 hover:bg-teal-500 text-teal-300 hover:text-slate-950 border border-teal-500/40 rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                                title="تایید و انتقال به گام بعدی"
                              >
                                <ArrowLeft className="w-3.5 h-3.5" />
                                <span>گام بعد</span>
                              </button>
                            )}

                            {/* Visual Canvas Modal */}
                            <button
                              onClick={() => setSelectedEvalForVisualModal(ev)}
                              className="p-1.5 bg-slate-800 hover:bg-teal-600 text-slate-300 hover:text-white rounded-lg transition"
                              title="مشاهده مسیر و موقعیت پرونده"
                            >
                              <GitFork className="w-3.5 h-3.5" />
                            </button>

                            {/* Admin Stage Override / Reassign */}
                            {currentUser.role === 'admin' && (
                              <>
                                <button
                                  onClick={() => {
                                    setSelectedEvalForAction(ev);
                                    setActionType('reassign');
                                    setReassignTargetId('');
                                  }}
                                  className="p-1.5 bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-lg transition"
                                  title="ارجاع پرونده به شخص دیگر (Reassign)"
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => {
                                    setSelectedEvalForAction(ev);
                                    setActionType('override');
                                    setOverrideStage(ev.stage);
                                  }}
                                  className="p-1.5 bg-slate-800 hover:bg-purple-600 text-slate-300 hover:text-white rounded-lg transition cursor-pointer"
                                  title="تغییر مستقیم مرحله (ادمین)"
                                >
                                  <Settings className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setEvalToDelete(ev)}
                                  className="p-1.5 bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                                  title="حذف این پرونده ارزیابی"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: 9-BOX TALENT GRID (ماتریس ۹ خانه‌ای استعداد و جانشین‌پروری) */}
      {/* ========================================================================= */}
      {activeTab === 'nine_box' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-base font-black text-slate-100 flex items-center gap-2">
                  <Grid3X3 className="w-5 h-5 text-teal-400" />
                  <span>ماتریس ۹ خانه‌ای استعداد و جانشین‌پروری (9-Box Talent Review)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  ترکیب نمره عملکرد ارزیابی (محور افقی X) با شاخص پتانسیل رشد و یادگیری (محور عمودی Y) جهت شناسایی نخبگان و تدوین برنامه‌های جانشین‌پروری
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">فیلتر دسته:</span>
                <select
                  value={nineBoxCategoryFilter}
                  onChange={e => setNineBoxCategoryFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs text-teal-300 px-3 py-1.5 rounded-xl focus:outline-none"
                >
                  <option value="all">همه استعدادها</option>
                  <option value="star">ستارگان آینده‌ساز (Stars)</option>
                  <option value="high_performer">پیشرانان و متخصصان (High Performers)</option>
                  <option value="core_player">ستون‌های استوار (Core Players)</option>
                  <option value="talent_risk">ریسک‌های عملکردی (Talent Risk)</option>
                </select>
              </div>
            </div>

            {/* 9-Box Grid Visual Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Row 1: High Potential (Y: High) */}
              {[
                { key: 'low_high', title: 'معمای سازمانی (Enigma)', pot: 'پتانسیل بالا', perf: 'عملکرد پایین', color: 'border-purple-500/40 bg-purple-500/10' },
                { key: 'med_high', title: 'استعداد نوظهور (Emerging Talent)', pot: 'پتانسیل بالا', perf: 'عملکرد متوسط', color: 'border-cyan-500/40 bg-cyan-500/10' },
                { key: 'high_high', title: 'ستاره آینده‌ساز (Future Star)', pot: 'پتانسیل بالا', perf: 'عملکرد عالی', color: 'border-emerald-500/50 bg-emerald-500/15 ring-2 ring-emerald-500/20' }
              ].map(cell => {
                const matchedEvals = normalizedEvaluations.filter(e => {
                  const p = e.nineBoxPlacement;
                  const [perf, pot] = cell.key.split('_');
                  return p?.performance === perf && p?.potential === pot;
                });

                return (
                  <div key={cell.key} className={`p-4 rounded-3xl border ${cell.color} flex flex-col justify-between min-h-[160px]`}>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <h4 className="text-xs font-black text-slate-100">{cell.title}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900/80 text-teal-300 font-bold">
                          {matchedEvals.length} نفر
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">{cell.perf} • {cell.pot}</p>

                      <div className="mt-3 space-y-1.5">
                        {matchedEvals.slice(0, 3).map(ev => {
                          const emp = employees.find(e => e.id === ev.empId);
                          return (
                            <div key={ev.id} className="p-1.5 bg-slate-950/70 rounded-xl flex items-center justify-between text-[11px]">
                              <span className="font-bold text-slate-200">{emp?.name}</span>
                              <span className="font-mono text-teal-400">{calculateFinalScore(ev, profiles)} نمره</span>
                            </div>
                          );
                        })}
                        {matchedEvals.length > 3 && (
                          <div className="text-[10px] text-slate-400 text-center">+{matchedEvals.length - 3} همکار دیگر</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Row 2: Med Potential (Y: Medium) */}
              {[
                { key: 'low_med', title: 'نیازمند توانمندسازی (Dilemma)', pot: 'پتانسیل متوسط', perf: 'عملکرد پایین', color: 'border-orange-500/40 bg-orange-500/10' },
                { key: 'med_med', title: 'ستون استوار (Core Performer)', pot: 'پتانسیل متوسط', perf: 'عملکرد متوسط', color: 'border-indigo-500/40 bg-indigo-500/10' },
                { key: 'high_med', title: 'پیشران رشد (Growth Driver)', pot: 'پتانسیل متوسط', perf: 'عملکرد عالی', color: 'border-teal-500/40 bg-teal-500/10' }
              ].map(cell => {
                const matchedEvals = normalizedEvaluations.filter(e => {
                  const p = e.nineBoxPlacement;
                  const [perf, pot] = cell.key.split('_');
                  return p?.performance === perf && p?.potential === pot;
                });

                return (
                  <div key={cell.key} className={`p-4 rounded-3xl border ${cell.color} flex flex-col justify-between min-h-[160px]`}>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <h4 className="text-xs font-black text-slate-100">{cell.title}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900/80 text-teal-300 font-bold">
                          {matchedEvals.length} نفر
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">{cell.perf} • {cell.pot}</p>

                      <div className="mt-3 space-y-1.5">
                        {matchedEvals.slice(0, 3).map(ev => {
                          const emp = employees.find(e => e.id === ev.empId);
                          return (
                            <div key={ev.id} className="p-1.5 bg-slate-950/70 rounded-xl flex items-center justify-between text-[11px]">
                              <span className="font-bold text-slate-200">{emp?.name}</span>
                              <span className="font-mono text-teal-400">{calculateFinalScore(ev, profiles)} نمره</span>
                            </div>
                          );
                        })}
                        {matchedEvals.length > 3 && (
                          <div className="text-[10px] text-slate-400 text-center">+{matchedEvals.length - 3} همکار دیگر</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Row 3: Low Potential (Y: Low) */}
              {[
                { key: 'low_low', title: 'ریسک عملکردی (Underperformer)', pot: 'پتانسیل پایین', perf: 'عملکرد پایین', color: 'border-rose-500/40 bg-rose-500/10' },
                { key: 'med_low', title: 'شاغل موثر (Effective Contributor)', pot: 'پتانسیل پایین', perf: 'عملکرد متوسط', color: 'border-amber-500/40 bg-amber-500/10' },
                { key: 'high_low', title: 'متخصص مجرب (Core Specialist)', pot: 'پتانسیل پایین', perf: 'عملکرد عالی', color: 'border-blue-500/40 bg-blue-500/10' }
              ].map(cell => {
                const matchedEvals = normalizedEvaluations.filter(e => {
                  const p = e.nineBoxPlacement;
                  const [perf, pot] = cell.key.split('_');
                  return p?.performance === perf && p?.potential === pot;
                });

                return (
                  <div key={cell.key} className={`p-4 rounded-3xl border ${cell.color} flex flex-col justify-between min-h-[160px]`}>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <h4 className="text-xs font-black text-slate-100">{cell.title}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900/80 text-teal-300 font-bold">
                          {matchedEvals.length} نفر
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">{cell.perf} • {cell.pot}</p>

                      <div className="mt-3 space-y-1.5">
                        {matchedEvals.slice(0, 3).map(ev => {
                          const emp = employees.find(e => e.id === ev.empId);
                          return (
                            <div key={ev.id} className="p-1.5 bg-slate-950/70 rounded-xl flex items-center justify-between text-[11px]">
                              <span className="font-bold text-slate-200">{emp?.name}</span>
                              <span className="font-mono text-teal-400">{calculateFinalScore(ev, profiles)} نمره</span>
                            </div>
                          );
                        })}
                        {matchedEvals.length > 3 && (
                          <div className="text-[10px] text-slate-400 text-center">+{matchedEvals.length - 3} همکار دیگر</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: IDP CENTER (برنامه‌های توسعه فردی و توانمندسازی) */}
      {/* ========================================================================= */}
      {activeTab === 'idp_center' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-base font-black text-slate-100 flex items-center gap-2">
                  <Target className="w-5 h-5 text-teal-400" />
                  <span>سامانه برنامه‌های توسعه فردی (Individual Development Plans - IDP)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  استخراج خودکار نقاط قابل بهبود از ارزیابی، انتساب منتور و ثبت دوره‌های آموزشی و مهارتی جهت رشد سازمانی
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {normalizedEvaluations.map(ev => {
                const emp = employees.find(e => e.id === ev.empId);
                const prof = profiles.find(p => p.id === ev.profileId);
                const idpCount = (ev.idpItems || []).length;
                const score = calculateFinalScore(ev, profiles);

                return (
                  <div key={ev.id} className="bg-slate-950 border border-slate-800 rounded-3xl p-5 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-100">{emp?.name}</span>
                        <span className="text-[10px] font-mono text-teal-400">{score} نمره</span>
                      </div>
                      <p className="text-[11px] text-slate-400">{prof?.title} • {emp?.unit}</p>

                      <div className="mt-4 space-y-2">
                        <div className="text-[11px] text-slate-400 font-medium">برنامه‌های توسعه ثبت‌شده:</div>
                        {(ev.idpItems || []).length === 0 ? (
                          <div className="text-[11px] text-slate-500 italic p-2 bg-slate-900 rounded-xl">
                            هنوز برنامه IDP اختصاصی برای این دوره ثبت نشده است.
                          </div>
                        ) : (
                          (ev.idpItems || []).map(item => (
                            <div key={item.id} className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-teal-300">{item.title}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                  {item.actionType === 'training_course' ? 'دوره آموزشی' : item.actionType === 'mentorship' ? 'منتورینگ' : 'کارگاهی'}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-1">مهلت: {item.targetDate} • منتور: {item.mentorName}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setIdpModalEval(ev);
                        setNewIdpTitle('');
                      }}
                      className="mt-5 py-2 px-3 bg-slate-800 hover:bg-teal-500 hover:text-slate-950 text-teal-300 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>تدوین و افزودن برنامه IDP جدید</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: APPEALS CENTER (سامانه فرجام‌خواهی و رسیدگی به اعتراضات) */}
      {/* ========================================================================= */}
      {activeTab === 'appeals_center' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-base font-black text-slate-100 flex items-center gap-2">
                  <Scale className="w-5 h-5 text-orange-400" />
                  <span>سامانه فرجام‌خواهی، ثبت اعتراض و رسیدگی کمیته تجدیدنظر</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  تضمین شفافیت و عدالت ارزیابی با امکان ثبت رسمی فرجام‌خواهی توسط شاغل و رسیدگی در کمیته تجدیدنظر
                </p>
              </div>

              {/* Employee can lodge appeal if in completed or feedback stage */}
              {currentUser.role === 'employee' && (
                <button
                  onClick={() => {
                    const myEval = normalizedEvaluations.find(e => e.empId === currentUser.id);
                    if (myEval) setAppealModalEval(myEval);
                  }}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-orange-500/20"
                >
                  <Flame className="w-4 h-4" />
                  <span>ثبت اعتراض و فرجام‌خواهی رسمی برای کارنامه من</span>
                </button>
              )}
            </div>

            {/* List of Appeals */}
            <div className="space-y-4">
              {normalizedEvaluations.filter(e => e.appeal || e.stage === 'appealed').length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs bg-slate-950 rounded-2xl">
                  در حال حاضر هیچ اعتراضی برای دوره {selectedPeriod} ثبت نشده است.
                </div>
              ) : (
                normalizedEvaluations
                  .filter(e => e.appeal || e.stage === 'appealed')
                  .map(ev => {
                    const emp = employees.find(e => e.id === ev.empId);
                    const appeal = ev.appeal;

                    return (
                      <div key={ev.id} className="p-5 rounded-3xl bg-slate-950 border border-orange-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-100 text-sm">{emp?.name}</span>
                            <span className="text-xs text-slate-400">({emp?.unit})</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-bold border border-orange-500/40">
                              {appeal?.status === 'submitted' ? 'در انتظار بررسی کمیته' : appeal?.status === 'accepted_modified' ? 'پذیرش و اصلاح نمره' : 'تایید نمرات قبلی'}
                            </span>
                          </div>

                          <p className="text-xs text-slate-300 bg-slate-900 p-3 rounded-2xl border border-slate-800">
                            <strong>علت اعتراض شاغل:</strong> {appeal?.reason || 'درخواست بازنگری در شواهد و نمرات'}
                          </p>

                          {appeal?.committeeDecision && (
                            <p className="text-xs text-emerald-300 bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/30">
                              <strong>رای کمیته تجدیدنظر ({appeal.reviewerName}):</strong> {appeal.committeeDecision}
                            </p>
                          )}
                        </div>

                        {currentUser.role === 'admin' && appeal?.status === 'submitted' && (
                          <button
                            onClick={() => {
                              setAppealModalEval(ev);
                            }}
                            className="px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-black rounded-xl text-xs transition shrink-0"
                          >
                            بررسی و صدور رای کمیته
                          </button>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: ROUTE CONFIG & ASSIGNMENT (پیکربندی مسیرها و انتساب سرپرستان) */}
      {/* ========================================================================= */}
      {activeTab === 'route_config' && currentUser.role === 'admin' && (
        <div className="space-y-6">
          {/* Batch Assignment Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-100 mb-2">انتساب دسته‌ای سرپرستان و تاییدکنندگان</h3>
            <p className="text-xs text-slate-400 mb-4">
              انتساب سریع سرپرست ارزیاب مستقیم یا تاییدکننده نهایی برای تمامی پرسنل یک واحد سازمانی
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-950 p-4 rounded-2xl border border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">واحد سازمانی هدف</label>
                <select
                  value={batchAssignUnit}
                  onChange={e => setBatchAssignUnit(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="all">همه واحدهای سازمانی</option>
                  {availableUnits.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">انتساب سرپرست ارزیاب (مرحله ۲)</label>
                <select
                  value={batchSupervisorId}
                  onChange={e => setBatchSupervisorId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-teal-300 focus:outline-none"
                >
                  <option value="">-- بدون تغییر --</option>
                  {employees.filter(e => e.role === 'supervisor' || e.role === 'admin').map(sup => (
                    <option key={sup.id} value={sup.id}>{sup.name} ({sup.unit})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">انتساب تاییدکننده نهایی HR (مرحله ۴)</label>
                <select
                  value={batchApproverId}
                  onChange={e => setBatchApproverId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-indigo-300 focus:outline-none"
                >
                  <option value="">-- بدون تغییر --</option>
                  {employees.filter(e => e.role === 'admin').map(adm => (
                    <option key={adm.id} value={adm.id}>{adm.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={handleExecuteBatchAssign}
                className="px-5 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-black rounded-xl text-xs transition shadow-lg shadow-teal-500/20"
              >
                اعمال دسته‌ای انتسابات
              </button>
            </div>
          </div>

          {/* Individual Employee Matrix */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-100 mb-4">ماتریس انتساب انفرادی سرپرست، ارزیاب ۳۶۰ و تاییدکننده نهایی</h3>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-bold">
                    <th className="py-3 px-4">پرسنل (شاغل)</th>
                    <th className="py-3 px-4">کد پرسنلی</th>
                    <th className="py-3 px-4">واحد</th>
                    <th className="py-3 px-4">سرپرست ارزیاب (مرحله ۲)</th>
                    <th className="py-3 px-4">ارزیاب همتا / ۳۶۰ (مرحله ۳)</th>
                    <th className="py-3 px-4">تاییدکننده نهایی HR (مرحله ۵)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {employees.map(emp => {
                    const supervisorsList = employees.filter(e => e.role === 'supervisor' || e.role === 'admin');
                    const peerList = employees.filter(e => e.id !== emp.id);

                    return (
                      <tr key={emp.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-4 font-bold text-slate-200">{emp.name}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{emp.code}</td>
                        <td className="py-3 px-4 text-slate-300">{emp.unit}</td>

                        <td className="py-3 px-4">
                          <select
                            value={emp.supervisorId || ''}
                            onChange={e => {
                              const updatedEmp = { ...emp, supervisorId: e.target.value || undefined };
                              const stored = JSON.parse(localStorage.getItem('pe_employees') || '[]');
                              const updatedList = stored.map((item: Employee) => item.id === emp.id ? updatedEmp : item);
                              db.saveEmployees(updatedList);
                              if (onUpdateEmployees) onUpdateEmployees(updatedList);
                            }}
                            className="bg-slate-950 border border-slate-800 text-xs text-teal-300 rounded-xl px-3 py-1.5 focus:outline-none focus:border-teal-500 w-full max-w-xs"
                          >
                            <option value="">انتخاب نشده (پیش‌فرض واحد)</option>
                            {supervisorsList.map(sup => (
                              <option key={sup.id} value={sup.id}>{sup.name} ({sup.unit})</option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3 px-4">
                          <select
                            value={emp.peerReviewerId || ''}
                            onChange={e => {
                              const updatedEmp = { ...emp, peerReviewerId: e.target.value || undefined };
                              const stored = JSON.parse(localStorage.getItem('pe_employees') || '[]');
                              const updatedList = stored.map((item: Employee) => item.id === emp.id ? updatedEmp : item);
                              db.saveEmployees(updatedList);
                              if (onUpdateEmployees) onUpdateEmployees(updatedList);
                            }}
                            className="bg-slate-950 border border-slate-800 text-xs text-cyan-300 rounded-xl px-3 py-1.5 focus:outline-none focus:border-cyan-500 w-full max-w-xs"
                          >
                            <option value="">-- خودکار / همکار هم‌واحد --</option>
                            {peerList.map(p => (
                              <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3 px-4">
                          <select
                            value={emp.approverId || 'emp-admin'}
                            onChange={e => {
                              const updatedEmp = { ...emp, approverId: e.target.value || undefined };
                              const stored = JSON.parse(localStorage.getItem('pe_employees') || '[]');
                              const updatedList = stored.map((item: Employee) => item.id === emp.id ? updatedEmp : item);
                              db.saveEmployees(updatedList);
                              if (onUpdateEmployees) onUpdateEmployees(updatedList);
                            }}
                            className="bg-slate-950 border border-slate-800 text-xs text-indigo-300 rounded-xl px-3 py-1.5 focus:outline-none focus:border-indigo-500 w-full max-w-xs"
                          >
                            <option value="emp-admin">مدیریت ارشد منابع انسانی (پیش‌فرض)</option>
                            {supervisorsList.map(sup => (
                              <option key={sup.id} value={sup.id}>{sup.name}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: HISTORY & AUDIT LOGS (ردپای گردش کار) */}
      {/* ========================================================================= */}
      {activeTab === 'history_audit' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
          <h3 className="text-base font-bold text-slate-100">تاریخچه زنجیره تاییدها و تغییرات گردش کار</h3>
          <p className="text-xs text-slate-400">
            ثبت دقیق نام کاربر اقدام‌کننده، زمان، نقش و توضیحات ثبت‌شده در کلیه مراحل انتقال ارزیابی‌ها
          </p>

          <div className="space-y-3 mt-4">
            {normalizedEvaluations.flatMap(ev => (ev.history || []).map(h => ({ ...h, evalId: ev.id, empId: ev.empId }))).length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                هنوز هیچ تراکنشی در این دوره در گردش کار ثبت نشده است.
              </div>
            ) : (
              normalizedEvaluations
                .flatMap(ev => (ev.history || []).map(h => ({ ...h, evalId: ev.id, empId: ev.empId })))
                .map(log => {
                  const emp = employees.find(e => e.id === log.empId);
                  return (
                    <div key={log.id} className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          log.toStage === 'rejected' ? 'bg-rose-500/20 text-rose-400' : 'bg-teal-500/20 text-teal-400'
                        }`}>
                          {log.toStage === 'rejected' ? <AlertCircle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-200">
                            پرونده <strong className="text-teal-400">{emp?.name}</strong>: انتقال از «{WORKFLOW_STAGES[log.fromStage]?.label || log.fromStage}» به «{WORKFLOW_STAGES[log.toStage]?.label || log.toStage}»
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1">
                            توسط: <strong className="text-slate-300">{log.actorName}</strong> ({log.actorRole === 'admin' ? 'مدیر ارشد' : log.actorRole === 'supervisor' ? 'سرپرست' : 'کارمند'})
                            {log.targetAssigneeName && <span> • ارجاع به: <strong className="text-teal-300">{log.targetAssigneeName}</strong></span>}
                          </div>
                          {log.comment && (
                            <div className="mt-2 p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                              یادداشت: {log.comment}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-500 font-mono shrink-0">
                        {log.timestamp}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: INTERACTIVE VISUAL WORKFLOW CANVAS & ROUTE INSPECTOR */}
      {/* ========================================================================= */}
      {selectedEvalForVisualModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100 my-auto">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-100 flex items-center gap-2">
                  <GitFork className="w-5 h-5 text-teal-400" />
                  <span>نقشه و زنجیره پیشرفت ارزیابی: {employees.find(e => e.id === selectedEvalForVisualModal.empId)?.name}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  کد پرسنلی: {employees.find(e => e.id === selectedEvalForVisualModal.empId)?.code} • واحد: {employees.find(e => e.id === selectedEvalForVisualModal.empId)?.unit}
                </p>
              </div>
              <button
                onClick={() => setSelectedEvalForVisualModal(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Stepper Flow Nodes */}
              <div className="space-y-4">
                {(['self_review', 'supervisor_review', 'peer_review', 'calibration_review', 'hr_approval', 'feedback_meeting', 'completed'] as WorkflowStageKey[]).map((stKey, idx) => {
                  const st = WORKFLOW_STAGES[stKey];
                  const isCurrent = selectedEvalForVisualModal.stage === stKey;
                  const isPassed = st.stepNumber < (WORKFLOW_STAGES[selectedEvalForVisualModal.stage]?.stepNumber || 1);

                  return (
                    <div
                      key={stKey}
                      className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-4 ${
                        isCurrent
                          ? 'bg-teal-500/10 border-teal-500/50 ring-2 ring-teal-500/20 shadow-lg'
                          : isPassed
                          ? 'bg-slate-950/60 border-slate-800'
                          : 'bg-slate-950/30 border-slate-800/40 opacity-60'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                          isCurrent
                            ? 'bg-teal-500 text-slate-950 animate-pulse'
                            : isPassed
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-slate-800 text-slate-500'
                        }`}>
                          {isPassed ? <Check className="w-4 h-4" /> : idx + 1}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-100">{st.label}</h4>
                            {isCurrent && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-teal-500 text-slate-950 animate-bounce">
                                موقعیت کنونی پرونده
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{st.description}</p>
                          <div className="text-[10px] text-teal-400 font-semibold mt-1">مسئول رسیدگی: {st.responsibleLabel}</div>
                        </div>
                      </div>

                      {isCurrent && (
                        <div className="text-left shrink-0 bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                          <span className="text-[10px] text-slate-400 block">در کارتابل:</span>
                          <strong className="text-xs text-teal-300 font-bold">{selectedEvalForVisualModal.currentAssigneeName}</strong>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: REASSIGN / ACTION / OVERRIDE MODAL */}
      {/* ========================================================================= */}
      {selectedEvalForAction && actionType && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl shadow-2xl p-6 text-slate-100 space-y-4 my-auto">
            <h3 className="text-base font-black text-slate-100 flex items-center gap-2">
              {actionType === 'reassign' && <UserPlus className="w-5 h-5 text-indigo-400" />}
              {actionType === 'override' && <Settings className="w-5 h-5 text-purple-400" />}
              {actionType === 'reject' && <CornerDownLeft className="w-5 h-5 text-rose-400" />}
              <span>
                {actionType === 'reassign' ? 'ارجاع و تفویض پرونده به شخص جایگزین (Reassign)' :
                 actionType === 'override' ? 'تغییر دستی مرحله پرونده (ادمین)' :
                 'عودت پرونده به مرحله قبل جهت بازنگری'}
              </span>
            </h3>

            {actionType === 'reassign' && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">شخص جدید مسئول کارتابل:</label>
                <select
                  value={reassignTargetId}
                  onChange={e => setReassignTargetId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none"
                >
                  <option value="">-- انتخاب همکار / سرپرست / مدیر --</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name} ({e.unit} - {e.role === 'admin' ? 'مدیر' : e.role === 'supervisor' ? 'سرپرست' : 'کارمند'})</option>
                  ))}
                </select>
              </div>
            )}

            {actionType === 'override' && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">انتقال مستقیم به مرحله:</label>
                <select
                  value={overrideStage}
                  onChange={e => setOverrideStage(e.target.value as WorkflowStageKey)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none"
                >
                  {Object.entries(WORKFLOW_STAGES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">توضیحات و یادداشت همراه:</label>
              <textarea
                value={actionComment}
                onChange={e => setActionComment(e.target.value)}
                placeholder="توضیح دلیل تغییر یا عودت پرونده..."
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  setSelectedEvalForAction(null);
                  setActionType(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
              >
                انصراف
              </button>

              <button
                onClick={() => {
                  if (actionType === 'reassign') {
                    handleExecuteReassign();
                  } else if (actionType === 'override') {
                    executeStageTransition(selectedEvalForAction, overrideStage, 'admin_override', actionComment || 'تغییر مستقیم توسط ادمین');
                  } else if (actionType === 'reject') {
                    executeStageTransition(selectedEvalForAction, 'rejected', 'reject_to_supervisor', actionComment || 'عودت داده شده جهت بازنگری');
                  }
                }}
                className="px-5 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-black rounded-xl text-xs transition cursor-pointer"
              >
                تایید و اعمال
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: IDP PLANNER MODAL */}
      {/* ========================================================================= */}
      {idpModalEval && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl p-6 text-slate-100 space-y-5 my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-black text-slate-100 flex items-center gap-2">
                <Target className="w-5 h-5 text-teal-400" />
                <span>برنامه توانمندسازی و توسعه فردی (IDP): {employees.find(e => e.id === idpModalEval.empId)?.name}</span>
              </h3>
              <button onClick={() => setIdpModalEval(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">عنوان برنامه توانمندسازی</label>
                <input
                  type="text"
                  placeholder="مثال: دوره تخصصی تحلیل فرآیندها یا مربیگری HSE..."
                  value={newIdpTitle}
                  onChange={e => setNewIdpTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">نوع اقدام یادگیری</label>
                  <select
                    value={newIdpType}
                    onChange={e => setNewIdpType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="training_course">دوره آموزشی رسمی / آنلاین</option>
                    <option value="mentorship">مربیگری و منتورینگ اختصاصی</option>
                    <option value="on_the_job">آموزش حین کار (OJT)</option>
                    <option value="job_shadowing">همراهی با متخصص ارشد (Shadowing)</option>
                    <option value="project_assignment">انتساب به پروژه بهبود</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">شایستگی یا زمینه هدف</label>
                  <input
                    type="text"
                    placeholder="مثال: ایمنی کارگاهی یا دقت عملیاتی..."
                    value={newIdpArea}
                    onChange={e => setNewIdpArea(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">مهلت تحقق</label>
                  <input
                    type="text"
                    value={newIdpDate}
                    onChange={e => setNewIdpDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">نام منتور / مربی</label>
                  <input
                    type="text"
                    placeholder="نام مربی یا سرپرست..."
                    value={newIdpMentor}
                    onChange={e => setNewIdpMentor(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button onClick={() => setIdpModalEval(null)} className="px-4 py-2 text-xs font-bold text-slate-400 cursor-pointer">
                بستن
              </button>
              <button
                onClick={handleAddIdpItem}
                className="px-5 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 font-black rounded-xl text-xs transition cursor-pointer"
              >
                ثبت در پرونده شاغل
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: APPEAL REVIEW / SUBMIT MODAL */}
      {/* ========================================================================= */}
      {appealModalEval && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl shadow-2xl p-6 text-slate-100 space-y-4 my-auto">
            <h3 className="text-base font-black text-slate-100 flex items-center gap-2">
              <Scale className="w-5 h-5 text-orange-400" />
              <span>
                {currentUser.role === 'admin' ? 'رسیدگی به فرجام‌خواهی و صدور رای کمیته تجدیدنظر' : 'ثبت اعتراض رسمی نسبت به نتایج ارزیابی'}
              </span>
            </h3>

            {currentUser.role !== 'admin' ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-400">
                  چنانچه معتقدید مستندات کاری شما به طور کامل دیده نشده یا خطایی در محاسبه نمرات رخ داده است، دلایل خود را ثبت کنید:
                </p>
                <textarea
                  value={appealReason}
                  onChange={e => setAppealReason(e.target.value)}
                  placeholder="شرح دقیق ادله و شواهد عدم انطباق نمره..."
                  rows={4}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                  <strong>اعتراض شاغل:</strong> {appealModalEval.appeal?.reason || 'درخواست بازنگری'}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">تصمیم کمیته تجدیدنظر:</label>
                  <select
                    value={reviewAppealVerdict}
                    onChange={e => setReviewAppealVerdict(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="accepted">پذیرش اعتراض و تعدیل نمره (Accepted & Adjusted)</option>
                    <option value="rejected">رد اعتراض و تایید نمرات قبلی (Rejected & Upheld)</option>
                  </select>
                </div>

                {reviewAppealVerdict === 'accepted' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">میزان افزایش نمره نهایی (از ۱۰۰):</label>
                    <input
                      type="number"
                      value={reviewAppealScoreDelta}
                      onChange={e => setReviewAppealScoreDelta(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none font-mono"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">صورت‌جلسه و استدلال رای کمیته:</label>
                  <textarea
                    value={reviewAppealNotes}
                    onChange={e => setReviewAppealNotes(e.target.value)}
                    placeholder="شرح دلایل پذیرش یا رد اعتراض شاغل..."
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button onClick={() => setAppealModalEval(null)} className="px-4 py-2 text-xs font-bold text-slate-400 cursor-pointer">
                انصراف
              </button>
              <button
                onClick={currentUser.role === 'admin' ? handleReviewAppeal : handleSubmitAppeal}
                className="px-5 py-2 bg-orange-500 hover:bg-orange-400 text-slate-950 font-black rounded-xl text-xs transition cursor-pointer"
              >
                {currentUser.role === 'admin' ? 'ثبت و ابلاغ رای کمیته' : 'ارسال به کمیته تجدیدنظر'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: DELETE SINGLE EVALUATION CONFIRMATION */}
      {/* ========================================================================= */}
      {evalToDelete && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in" dir="rtl">
          <div className="bg-slate-900 border border-rose-500/40 w-full max-w-md rounded-3xl shadow-2xl p-6 text-slate-100 space-y-4 text-right animate-in fade-in">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-100">تایید حذف پرونده از گردش کار</h3>
                <p className="text-[11px] text-slate-400">این عملیات بلافاصله انجام شده و غیرقابل بازگشت است</p>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 space-y-2 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>همکار:</span>
                <span className="font-bold text-slate-100">
                  {employees.find(e => e.id === evalToDelete.empId)?.name || 'نامشخص'}
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>مرحله فعلی:</span>
                <span className="text-teal-400 font-bold">{WORKFLOW_STAGES[evalToDelete.stage]?.label}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>دوره:</span>
                <span className="font-mono text-slate-300">{evalToDelete.period}</span>
              </div>
            </div>

            <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-300 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                هشدار: با حذف این پرونده، تمامی امتیازات، سوابق اقدامات و لاگ گردش کار این دوره پاک خواهد شد.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setEvalToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-all cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDeleteSingle(evalToDelete)}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all cursor-pointer shadow-lg shadow-rose-600/20 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>بله، حذف پرونده</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: BULK DELETE EVALUATIONS CONFIRMATION */}
      {/* ========================================================================= */}
      {isBulkDeleteModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in" dir="rtl">
          <div className="bg-slate-900 border border-rose-500/40 w-full max-w-md rounded-3xl shadow-2xl p-6 text-slate-100 space-y-4 text-right animate-in fade-in">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-100">تایید حذف گروهی پرونده‌های گردش کار</h3>
                <p className="text-[11px] text-slate-400">حذف همزمان {selectedEvalIds.length} پرونده انتخاب‌شده</p>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 space-y-2 text-xs max-h-48 overflow-y-auto">
              <div className="text-slate-400 font-medium mb-1">پرونده‌های انتخاب‌شده:</div>
              {selectedEvalIds.map(id => {
                const ev = localEvaluations.find(e => e.id === id);
                const emp = employees.find(e => e.id === ev?.empId);
                return (
                  <div key={id} className="flex justify-between items-center py-1 border-b border-slate-900 text-slate-200 text-xs">
                    <span>{emp?.name || 'همکار'}</span>
                    <span className="text-[10px] text-teal-400">{WORKFLOW_STAGES[ev?.stage || 'self_review']?.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-300 leading-relaxed">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                توجه: این اقدام تمامی پرونده‌های انتخاب‌شده را از دیتابیس پاک کرده و غیرقابل بازیابی است.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-all cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteBulk}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 transition-all cursor-pointer shadow-lg shadow-rose-600/20 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تایید و حذف گروهی ({selectedEvalIds.length} مورد)</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL 7: BULK STAGE REDIRECT MODAL (ادمین - هدایت گروهی به مرحله دلخواه) */}
      {/* ========================================================================= */}
      {isBulkRedirectModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in" dir="rtl">
          <div className="bg-slate-900 border border-purple-500/40 w-full max-w-md rounded-3xl shadow-2xl p-6 text-slate-100 space-y-4 text-right animate-in fade-in">
            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-100">هدایت گروهی پرونده‌ها به مرحله خاص</h3>
                <p className="text-[11px] text-slate-400">انتقال همزمان {selectedEvalIds.length} پرونده انتخاب‌شده توسط مدیر سیستم</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">مرحله هدف جهت انتقال:</label>
                <select
                  value={bulkRedirectTargetStage}
                  onChange={e => setBulkRedirectTargetStage(e.target.value as WorkflowStageKey)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                >
                  {Object.entries(WORKFLOW_STAGES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label} ({v.responsibleLabel})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">توضیح یا دستور اداری همراه (اختیاری):</label>
                <textarea
                  value={bulkRedirectComment}
                  onChange={e => setBulkRedirectComment(e.target.value)}
                  placeholder="دلیل هدایت دسته‌جمعی یا دستور مصوب جلسه..."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-300 leading-relaxed">
                با اعمال این دستور، تمامی پرونده‌های انتخاب‌شده به مرحله «{WORKFLOW_STAGES[bulkRedirectTargetStage]?.label}» جهش کرده و کارتابل مسئول جدید بر اساس الگوی سازمانی تنظیم می‌شود.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setIsBulkRedirectModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 transition-all cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkRedirect}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition-all cursor-pointer shadow-lg shadow-purple-600/20 flex items-center gap-1.5"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>اعمال هدایت گروهی ({selectedEvalIds.length} مورد)</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
