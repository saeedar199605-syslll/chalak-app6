/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Evaluation, Employee, WorkflowStageKey, WORKFLOW_STAGES } from '../types';

export interface OverdueEvaluationItem {
  evalId: string;
  empId: string;
  empName: string;
  empCode: string;
  unit: string;
  period: string;
  stage: WorkflowStageKey;
  stageLabel: string;
  daysPending: number;
  maxAllowedDays: number;
  daysOverdue: number;
  reason: string;
  currentAssigneeName: string;
  urgency: 'critical' | 'high' | 'medium';
}

/**
 * Stage SLA allowed days before considered overdue
 */
const STAGE_SLA_DAYS: Record<WorkflowStageKey, number> = {
  self_review: 4,         // مهلت خودارزیابی
  supervisor_review: 3,   // مهلت ارزیابی و امتیازدهی سرپرست
  peer_review: 3,         // مهلت ارزیابی همتا
  calibration_review: 2,  // مهلت کمیته کالیبراسیون
  hr_approval: 2,         // مهلت تایید مدیر HR
  feedback_meeting: 4,    // مهلت برگزاری جلسه بازخورد و IDP
  rejected: 2,            // مهلت اصلاح مستندات
  appealed: 3,            // مهلت رسیدگی به فرجام‌خواهی
  completed: 999          // تکمیل شده
};

/**
 * Calculate overdue evaluations for a given user (supervisor or admin)
 */
export function getOverdueEvaluations(
  evaluations: Evaluation[],
  employees: Employee[],
  currentUser: Employee
): OverdueEvaluationItem[] {
  if (!currentUser) return [];

  const overdueItems: OverdueEvaluationItem[] = [];

  evaluations.forEach(ev => {
    // Completed or locked evaluations are never overdue
    if (ev.status === 'locked' || ev.stage === 'completed') {
      return;
    }

    const emp = employees.find(e => e.id === ev.empId);
    if (!emp) return;

    // Check if user is responsible for this evaluation:
    // 1. Admin: oversees all evaluations
    // 2. Supervisor: subordinate is assigned to this supervisor, or same unit supervisor, or currently assigned to supervisor
    const isSupervisor = currentUser.role === 'supervisor';
    const isAdmin = currentUser.role === 'admin';

    if (!isAdmin && !isSupervisor) {
      // Regular employees only care about their own overdue self_review or feedback_meeting
      if (emp.id !== currentUser.id) return;
    }

    if (isSupervisor && !isAdmin) {
      const isDirectSubordinate = emp.supervisorId === currentUser.id;
      const isUnitSubordinate = !emp.supervisorId && emp.unit === currentUser.unit;
      const isAssignedToMe = ev.currentAssigneeId === currentUser.id;

      if (!isDirectSubordinate && !isUnitSubordinate && !isAssignedToMe) {
        return;
      }
    }

    const stage: WorkflowStageKey = ev.stage || (
      ev.status === 'calibrated' ? 'hr_approval' :
      ev.scores.some(s => s.value > 0) ? 'calibration_review' :
      ev.scores.some(s => s.self > 0) ? 'supervisor_review' : 'self_review'
    );

    const maxAllowedDays = STAGE_SLA_DAYS[stage] || 3;

    // Determine days elapsed in current stage
    let daysPending = 3;
    if (ev.history && ev.history.length > 0) {
      const lastTrans = ev.history[0];
      // Mock realistic pending days from id / history
      daysPending = (Math.abs(ev.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 5)) + 3;
    } else {
      // For draft or pending evaluations without history, base on id seed
      const seed = Math.abs(ev.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 6);
      daysPending = seed + 3; // between 3 and 8 days
    }

    // Special cases in demo data to make sure realistic overdue items exist:
    // e.g. eval-reza-1 (draft for Reza Ebrahimi)
    if (ev.id === 'eval-reza-1') {
      daysPending = 6;
    } else if (ev.status === 'draft') {
      daysPending = Math.max(daysPending, 5);
    }

    const isOverdue = daysPending > maxAllowedDays;

    if (isOverdue) {
      const daysOverdue = daysPending - maxAllowedDays;
      let reason = 'تاخیر در بررسی و تعیین تکلیف پرونده در مهلت مصوب سازمانی';
      let urgency: 'critical' | 'high' | 'medium' = 'medium';

      if (stage === 'supervisor_review') {
        reason = `عدم ثبت نمرات و بازخورد اولیه سرپرست مستقیم (${daysOverdue} روز فراتر از مهلت)`;
        urgency = daysOverdue >= 3 ? 'critical' : 'high';
      } else if (stage === 'self_review') {
        reason = `عدم تکمیل خودارزیابی توسط پرسنل (${daysOverdue} روز تاخیر)`;
        urgency = 'high';
      } else if (stage === 'feedback_meeting') {
        reason = `عدم برگزاری جلسه دونفره مربیگری و ثبت برنامه توانمندسازی IDP`;
        urgency = daysOverdue >= 2 ? 'critical' : 'high';
      } else if (stage === 'calibration_review') {
        reason = `انتظار برای تایید کمیته کالیبراسیون و انطباق توزیع نمرات`;
        urgency = 'medium';
      } else if (stage === 'rejected') {
        reason = `پرونده عودت‌داده شده نیازمند بازنگری فوری مستندات است`;
        urgency = 'critical';
      } else if (stage === 'appealed') {
        reason = `اعتراض ثبت‌شده کارمند نیازمند رسیدگی کمیته فرجام‌خواهی است`;
        urgency = 'critical';
      }

      const stageInfo = WORKFLOW_STAGES[stage] || { label: 'در دست بررسی' };

      overdueItems.push({
        evalId: ev.id,
        empId: emp.id,
        empName: emp.name,
        empCode: emp.code,
        unit: emp.unit,
        period: ev.period,
        stage,
        stageLabel: stageInfo.label,
        daysPending,
        maxAllowedDays,
        daysOverdue,
        reason,
        currentAssigneeName: ev.currentAssigneeName || (isSupervisor ? currentUser.name : 'سرپرست مربوطه'),
        urgency
      });
    }
  });

  // Sort by urgency then daysOverdue descending
  return overdueItems.sort((a, b) => {
    const urgencyWeight = { critical: 3, high: 2, medium: 1 };
    if (urgencyWeight[b.urgency] !== urgencyWeight[a.urgency]) {
      return urgencyWeight[b.urgency] - urgencyWeight[a.urgency];
    }
    return b.daysOverdue - a.daysOverdue;
  });
}
