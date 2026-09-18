/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Centralized Database & Storage Service for Esfahan Chalak Performance System
 * Fully compatible with:
 * - Cloudflare Pages (Free tier static SPA & KV)
 * - Local & Containerized Node/Express Server
 * - Offline-first browser storage (resilient & persistent)
 */

import { Criterion, JobProfile, Employee, Evaluation, OKRGoal, OneOnOneMeeting, PraiseKudos } from '../types';
import { SEED_CRITERIA, SEED_PROFILES, SEED_EMPLOYEES, SEED_EVALUATIONS } from '../seedData';
import { INITIAL_OKRS, INITIAL_ONE_ON_ONES, INITIAL_KUDOS } from '../data/latticeKickidlerSeed';
import { CLOUD_SYNC_KEYS, CloudState, isCloudSyncKey } from '../../cloudflare/syncState';

const STORAGE_KEYS = {
  EMPLOYEES: 'pe_employees',
  CRITERIA: 'pe_criteria',
  PROFILES: 'pe_profiles',
  EVALUATIONS: 'pe_evaluations',
  ARCHIVED_EVALUATIONS: 'pe_archived_evaluations',
  THEME: 'pe_theme',
  ACTIVE_PERIOD: 'pe_active_period',
  BACKUP_TIMESTAMP: 'pe_last_backup_ts',
  OKRS: 'pe_lattice_okrs',
  ONE_ON_ONES: 'pe_lattice_one_on_ones',
  KUDOS: 'pe_lattice_kudos',
  WORKSHOP_TARGETS: 'pe_workshop_targets'
} as const;

export const CURRENT_ACTIVE_PERIOD = 'بهار ۱۴۰۵';

class AppDatabase {
  private syncTimeout: any = null;
  private listeners: Set<(key: string, data: any) => void> = new Set();

  /**
   * Subscribe to real-time database state mutations
   */
  public subscribe(listener: (key: string, data: any) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public notifyChange(key: string, data: any): void {
    this.listeners.forEach(fn => {
      try { fn(key, data); } catch (e) { console.error('Error in db listener:', e); }
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pe_db_updated', { detail: { key, data } }));
    }
  }

  // Safe JSON getter
  private getItem<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw) as T;
    } catch (e) {
      console.warn(`Error reading ${key} from storage:`, e);
      return fallback;
    }
  }

  // Safe JSON setter with synchronous notification
  private setItem<T>(key: string, value: T): void {
    try {
      const stringVal = JSON.stringify(value);
      const currentVal = localStorage.getItem(key);
      if (currentVal === stringVal) return; // Prevent unnecessary cycles

      localStorage.setItem(key, stringVal);
      this.notifyChange(key, value);
      if (this.cloudSyncEnabled && isCloudSyncKey(key)) {
        this.dirtyKeys.add(key);
        this.triggerCloudSyncDebounced();
      }
    } catch (e) {
      console.error(`Error saving ${key} to storage:`, e);
    }
  }

  // --- EMPLOYEES ---
  public getEmployees(): Employee[] {
    const data = this.getItem<Employee[]>(STORAGE_KEYS.EMPLOYEES, []);
    if (!data || data.length === 0) {
      this.setItem(STORAGE_KEYS.EMPLOYEES, SEED_EMPLOYEES);
      return SEED_EMPLOYEES;
    }
    return data;
  }

  public saveEmployees(employees: Employee[]): void {
    this.setItem(STORAGE_KEYS.EMPLOYEES, employees);
  }

  public addEmployee(empData: Omit<Employee, 'id'>): { employee: Employee; evaluation: Evaluation | null } {
    const employees = this.getEmployees();
    
    // Generate clean username if empty
    let username = (empData.username || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
    if (!username) {
      const cleanCode = (empData.code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      username = `user_${cleanCode || Math.random().toString(36).substring(2, 7)}`;
    }

    // Ensure unique username
    let finalUsername = username;
    let counter = 1;
    while (employees.some(e => e.username.toLowerCase() === finalUsername.toLowerCase())) {
      finalUsername = `${username}_${counter}`;
      counter++;
    }

    const newEmp: Employee = {
      ...empData,
      id: `emp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      username: finalUsername,
      code: empData.code.trim().toUpperCase()
    };

    const updatedEmployees = [...employees, newEmp];
    this.saveEmployees(updatedEmployees);

    // Automatically create an active evaluation for this employee so they appear in reports and cards
    let createdEval: Evaluation | null = null;
    try {
      const profiles = this.getProfiles();
      const matchedProfile = profiles.find(p => p.id === newEmp.profileId) || profiles[0];
      if (matchedProfile) {
        const evals = this.getEvaluations();
        const initialScores = (matchedProfile.items || []).map(item => ({
          cid: item.cid,
          weight: item.weight,
          value: 0,
          self: 0,
          doc: ''
        }));

        createdEval = {
          id: `eval-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          empId: newEmp.id,
          profileId: matchedProfile.id,
          period: CURRENT_ACTIVE_PERIOD,
          status: 'draft',
          scores: initialScores,
          created: Date.now()
        };

        this.saveEvaluations([...evals, createdEval]);
      }
    } catch (err) {
      console.warn('Could not auto-generate initial evaluation for employee:', err);
    }

    return { employee: newEmp, evaluation: createdEval };
  }

  public updateEmployee(id: string, empData: Omit<Employee, 'id'>): Employee | null {
    const employees = this.getEmployees();
    const index = employees.findIndex(e => e.id === id);
    if (index === -1) return null;

    const updated: Employee = {
      ...empData,
      id,
      code: empData.code.trim().toUpperCase(),
      username: empData.username.trim().toLowerCase()
    };

    employees[index] = updated;
    this.saveEmployees(employees);
    return updated;
  }

  public deleteEmployee(id: string): boolean {
    const employees = this.getEmployees();
    const target = employees.find(e => e.id === id);
    if (!target) return false;

    // Protect main admin
    if (target.role === 'admin' && (target.username === 'admin' || target.code === 'ADMIN-001')) {
      return false;
    }

    const filtered = employees.filter(e => e.id !== id);
    this.saveEmployees(filtered);

    // Cascade delete evaluations
    const evals = this.getEvaluations();
    const filteredEvals = evals.filter(ev => ev.empId !== id);
    this.saveEvaluations(filteredEvals);

    return true;
  }

  /**
   * Batch delete employees with cascade removal of evaluations and safety check for main admin
   */
  public deleteEmployeesBatch(ids: string[]): { success: boolean; deletedCount: number } {
    if (!ids || ids.length === 0) return { success: true, deletedCount: 0 };
    const idSet = new Set(ids);
    const employees = this.getEmployees();
    
    // Filter out protected admins from deletion set
    const targetsToDelete = employees.filter(e => idSet.has(e.id) && !(e.role === 'admin' && (e.username === 'admin' || e.code === 'ADMIN-001')));
    if (targetsToDelete.length === 0) return { success: true, deletedCount: 0 };

    const validDeleteIds = new Set(targetsToDelete.map(e => e.id));
    const remainingEmployees = employees.filter(e => !validDeleteIds.has(e.id));
    this.saveEmployees(remainingEmployees);

    // Cascade delete evaluations
    const evals = this.getEvaluations();
    const remainingEvals = evals.filter(ev => !validDeleteIds.has(ev.empId));
    this.saveEvaluations(remainingEvals);

    return { success: true, deletedCount: targetsToDelete.length };
  }

  // --- CRITERIA (PARAMETERS) ---
  public getCriteria(): Criterion[] {
    const data = this.getItem<Criterion[]>(STORAGE_KEYS.CRITERIA, []);
    if (!data || data.length === 0) {
      this.setItem(STORAGE_KEYS.CRITERIA, SEED_CRITERIA);
      return SEED_CRITERIA;
    }
    return data;
  }

  public saveCriteria(criteria: Criterion[]): void {
    this.setItem(STORAGE_KEYS.CRITERIA, criteria);
  }

  public addCriterion(critData: Omit<Criterion, 'id'>): Criterion {
    const criteria = this.getCriteria();
    const newCrit: Criterion = {
      ...critData,
      id: `crit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      code: critData.code.trim().toUpperCase()
    };
    this.saveCriteria([...criteria, newCrit]);
    return newCrit;
  }

  public updateCriterion(id: string, critData: Omit<Criterion, 'id'>): Criterion | null {
    const criteria = this.getCriteria();
    const index = criteria.findIndex(c => c.id === id);
    if (index === -1) return null;

    const updated: Criterion = {
      ...critData,
      id,
      code: critData.code.trim().toUpperCase()
    };
    criteria[index] = updated;
    this.saveCriteria(criteria);
    return updated;
  }

  /**
   * Delete criterion with automatic CASCADE removal from profiles and evaluations.
   * This guarantees that any parameter can be deleted cleanly without blocking errors!
   */
  public deleteCriterion(id: string): { success: boolean; affectedProfiles: number; affectedEvaluations: number } {
    const criteria = this.getCriteria();
    const target = criteria.find(c => c.id === id);
    if (!target) return { success: false, affectedProfiles: 0, affectedEvaluations: 0 };

    // 1. Remove from criteria bank
    const updatedCriteria = criteria.filter(c => c.id !== id);
    this.saveCriteria(updatedCriteria);

    // 2. Cascade remove from all job profiles
    const profiles = this.getProfiles();
    let affectedProfiles = 0;
    const updatedProfiles = profiles.map(profile => {
      const hasItem = profile.items.some(item => item.cid === id);
      if (hasItem) {
        affectedProfiles++;
        const filteredItems = profile.items.filter(item => item.cid !== id);
        return {
          ...profile,
          items: filteredItems
        };
      }
      return profile;
    });
    if (affectedProfiles > 0) {
      this.saveProfiles(updatedProfiles);
    }

    // 3. Cascade remove from all evaluations
    const evals = this.getEvaluations();
    let affectedEvaluations = 0;
    const updatedEvals = evals.map(evaluation => {
      const hasScore = evaluation.scores.some(s => s.cid === id);
      if (hasScore) {
        affectedEvaluations++;
        return {
          ...evaluation,
          scores: evaluation.scores.filter(s => s.cid !== id)
        };
      }
      return evaluation;
    });
    if (affectedEvaluations > 0) {
      this.saveEvaluations(updatedEvals);
    }

    return { success: true, affectedProfiles, affectedEvaluations };
  }

  /**
   * Batch delete multiple criteria with cascading removal from all profiles and evaluations
   */
  public deleteCriteriaBatch(ids: string[]): { success: boolean; affectedProfiles: number; affectedEvaluations: number; deletedCount: number } {
    if (!ids || ids.length === 0) return { success: true, affectedProfiles: 0, affectedEvaluations: 0, deletedCount: 0 };
    const idSet = new Set(ids);
    const criteria = this.getCriteria();
    const remainingCriteria = criteria.filter(c => !idSet.has(c.id));
    const deletedCount = criteria.length - remainingCriteria.length;
    if (deletedCount === 0) return { success: true, affectedProfiles: 0, affectedEvaluations: 0, deletedCount: 0 };

    this.saveCriteria(remainingCriteria);

    // Cascade remove from profiles
    const profiles = this.getProfiles();
    let affectedProfiles = 0;
    const updatedProfiles = profiles.map(profile => {
      const hasItem = profile.items.some(item => idSet.has(item.cid));
      if (hasItem) {
        affectedProfiles++;
        return {
          ...profile,
          items: profile.items.filter(item => !idSet.has(item.cid))
        };
      }
      return profile;
    });
    if (affectedProfiles > 0) {
      this.saveProfiles(updatedProfiles);
    }

    // Cascade remove from evaluations
    const evals = this.getEvaluations();
    let affectedEvaluations = 0;
    const updatedEvals = evals.map(evaluation => {
      const hasScore = evaluation.scores.some(s => idSet.has(s.cid));
      if (hasScore) {
        affectedEvaluations++;
        return {
          ...evaluation,
          scores: evaluation.scores.filter(s => !idSet.has(s.cid))
        };
      }
      return evaluation;
    });
    if (affectedEvaluations > 0) {
      this.saveEvaluations(updatedEvals);
    }

    return { success: true, affectedProfiles, affectedEvaluations, deletedCount };
  }

  // --- JOB PROFILES ---
  public getProfiles(): JobProfile[] {
    const data = this.getItem<JobProfile[]>(STORAGE_KEYS.PROFILES, []);
    if (!data || data.length === 0) {
      this.setItem(STORAGE_KEYS.PROFILES, SEED_PROFILES);
      return SEED_PROFILES;
    }
    return data;
  }

  public saveProfiles(profiles: JobProfile[]): void {
    this.setItem(STORAGE_KEYS.PROFILES, profiles);
  }

  public addProfile(profData: Omit<JobProfile, 'id'>): JobProfile {
    const profiles = this.getProfiles();
    const newProf: JobProfile = {
      ...profData,
      id: `prof-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    };
    this.saveProfiles([...profiles, newProf]);
    return newProf;
  }

  public updateProfile(id: string, profData: Omit<JobProfile, 'id'>): JobProfile | null {
    const profiles = this.getProfiles();
    const index = profiles.findIndex(p => p.id === id);
    if (index === -1) return null;

    const updated: JobProfile = {
      ...profData,
      id
    };
    profiles[index] = updated;
    this.saveProfiles(profiles);
    return updated;
  }

  public deleteProfile(id: string, force = true): { success: boolean; error?: string; affectedEmployees?: number } {
    const employees = this.getEmployees();
    const assignedEmployees = employees.filter(e => e.profileId === id);
    
    if (assignedEmployees.length > 0 && !force) {
      return { success: false, error: `این رده شغلی به ${assignedEmployees.length} پرسنل منتسب است و ابتدا باید رده شغلی آن‌ها تغییر کند.` };
    }

    if (assignedEmployees.length > 0 && force) {
      const updatedEmployees = employees.map(e => e.profileId === id ? { ...e, profileId: '' } : e);
      this.saveEmployees(updatedEmployees);
    }

    const profiles = this.getProfiles();
    this.saveProfiles(profiles.filter(p => p.id !== id));
    return { success: true, affectedEmployees: assignedEmployees.length };
  }

  public deleteProfilesBatch(ids: string[]): { success: boolean; deletedCount: number; affectedEmployees: number } {
    if (!ids || ids.length === 0) return { success: true, deletedCount: 0, affectedEmployees: 0 };
    const idSet = new Set(ids);

    const employees = this.getEmployees();
    let affectedEmployees = 0;
    const updatedEmployees = employees.map(e => {
      if (idSet.has(e.profileId)) {
        affectedEmployees++;
        return { ...e, profileId: '' };
      }
      return e;
    });
    if (affectedEmployees > 0) {
      this.saveEmployees(updatedEmployees);
    }

    const profiles = this.getProfiles();
    const remaining = profiles.filter(p => !idSet.has(p.id));
    const deletedCount = profiles.length - remaining.length;
    this.saveProfiles(remaining);

    return { success: true, deletedCount, affectedEmployees };
  }

  // --- EVALUATIONS ---
  public getEvaluations(): Evaluation[] {
    const data = this.getItem<Evaluation[]>(STORAGE_KEYS.EVALUATIONS, []);
    if (!data || data.length === 0) {
      this.setItem(STORAGE_KEYS.EVALUATIONS, SEED_EVALUATIONS);
      return SEED_EVALUATIONS;
    }
    return data;
  }

  public saveEvaluations(evaluations: Evaluation[]): void {
    this.setItem(STORAGE_KEYS.EVALUATIONS, evaluations);
  }

  public deleteEvaluation(id: string): boolean {
    const evals = this.getEvaluations();
    const filtered = evals.filter(e => e.id !== id);
    if (filtered.length === evals.length) return false;
    this.saveEvaluations(filtered);
    return true;
  }

  public deleteEvaluationsBatch(ids: string[]): { success: boolean; deletedCount: number } {
    if (!ids || ids.length === 0) return { success: true, deletedCount: 0 };
    const idSet = new Set(ids);
    const evals = this.getEvaluations();
    const filtered = evals.filter(e => !idSet.has(e.id));
    const deletedCount = evals.length - filtered.length;
    if (deletedCount > 0) {
      this.saveEvaluations(filtered);
    }
    return { success: true, deletedCount };
  }

  public getArchivedEvaluations(): Evaluation[] {
    return this.getItem<Evaluation[]>(STORAGE_KEYS.ARCHIVED_EVALUATIONS, []);
  }

  public saveArchivedEvaluations(archived: Evaluation[]): void {
    this.setItem(STORAGE_KEYS.ARCHIVED_EVALUATIONS, archived);
  }

  public updateEvaluation(id: string, updatedEv: Evaluation): Evaluation {
    const evals = this.getEvaluations();
    const index = evals.findIndex(e => e.id === id);
    let nextList: Evaluation[];
    if (index >= 0) {
      nextList = [...evals];
      nextList[index] = updatedEv;
    } else {
      nextList = [...evals, updatedEv];
    }
    this.saveEvaluations(nextList);
    return updatedEv;
  }

  // --- OKRS & GOALS MANAGEMENT ---
  public getOkrs(): OKRGoal[] {
    const data = this.getItem<OKRGoal[]>(STORAGE_KEYS.OKRS, []);
    if (!data || data.length === 0) {
      return INITIAL_OKRS;
    }
    return data;
  }

  public saveOkrs(okrs: OKRGoal[]): void {
    this.setItem(STORAGE_KEYS.OKRS, okrs);
  }

  public updateOkr(id: string, partial: Partial<OKRGoal>): OKRGoal | null {
    const okrs = this.getOkrs();
    const index = okrs.findIndex(o => o.id === id);
    if (index === -1) return null;

    const existing = okrs[index];
    const updated: OKRGoal = {
      ...existing,
      ...partial
    };

    // Auto-recalculate progress if key results were supplied
    if (updated.keyResults && updated.keyResults.length > 0) {
      const sum = updated.keyResults.reduce((acc, kr) => {
        const range = kr.targetValue - kr.startValue;
        if (range === 0) return acc + 100;
        return acc + Math.min(100, Math.max(0, ((kr.currentValue - kr.startValue) / range) * 100));
      }, 0);
      updated.progress = Math.round(sum / updated.keyResults.length);
      if (updated.progress >= 100) updated.confidence = 'completed';
      else if (updated.progress < 50) updated.confidence = 'behind';
      else if (updated.progress < 75) updated.confidence = 'at_risk';
      else updated.confidence = 'on_track';
    }

    okrs[index] = updated;
    this.saveOkrs(okrs);
    return updated;
  }

  public addOkr(okrData: Omit<OKRGoal, 'id'>): OKRGoal {
    const okrs = this.getOkrs();
    const newOkr: OKRGoal = {
      ...okrData,
      id: `okr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
    };
    this.saveOkrs([newOkr, ...okrs]);
    return newOkr;
  }

  public deleteOkr(id: string): boolean {
    const okrs = this.getOkrs();
    const filtered = okrs.filter(o => o.id !== id);
    if (filtered.length === okrs.length) return false;
    this.saveOkrs(filtered);
    return true;
  }

  // --- WORKSHOP TARGETS ---
  public getWorkshopTargets<T = any>(fallback: T[] = []): T[] {
    return this.getItem<T[]>(STORAGE_KEYS.WORKSHOP_TARGETS, fallback);
  }

  public saveWorkshopTargets<T = any>(targets: T[]): void {
    this.setItem(STORAGE_KEYS.WORKSHOP_TARGETS, targets);
  }

  public getMiscData<T>(key: string, fallback: T): T {
    return this.getItem<T>(key, fallback);
  }
  public saveMiscData<T>(key: string, value: T): void {
    this.setItem(key, value);
  }

  // --- BATCH CRITERIA MERGE / MULTI-SOURCE REGISTER ---
  public saveCriteriaBatch(
    newCriteria: Array<Omit<Criterion, 'id'> & { id?: string }>,
    mode: 'merge' | 'replace' | 'skip_existing' = 'merge'
  ): { addedCount: number; updatedCount: number; totalCount: number; criteria: Criterion[] } {
    let currentCriteria = this.getCriteria();
    let addedCount = 0;
    let updatedCount = 0;

    if (mode === 'replace') {
      const formatted = newCriteria.map((c, idx) => ({
        ...c,
        id: c.id || `crit-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
        code: c.code.trim().toUpperCase()
      } as Criterion));
      this.saveCriteria(formatted);
      return { addedCount: formatted.length, updatedCount: 0, totalCount: formatted.length, criteria: formatted };
    }

    const updatedList = [...currentCriteria];

    newCriteria.forEach((critCandidate, idx) => {
      const cleanCode = critCandidate.code.trim().toUpperCase();
      const existingIdx = updatedList.findIndex(c => c.code.trim().toUpperCase() === cleanCode);

      if (existingIdx >= 0) {
        if (mode === 'merge') {
          // Merge fields, preserve existing ID
          const existing = updatedList[existingIdx];
          updatedList[existingIdx] = {
            ...existing,
            ...critCandidate,
            id: existing.id,
            code: cleanCode
          };
          updatedCount++;
        }
        // If mode === 'skip_existing', do nothing
      } else {
        // Add new
        const newCrit: Criterion = {
          ...critCandidate,
          id: critCandidate.id || `crit-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
          code: cleanCode
        };
        updatedList.push(newCrit);
        addedCount++;
      }
    });

    this.saveCriteria(updatedList);
    return { addedCount, updatedCount, totalCount: updatedList.length, criteria: updatedList };
  }

  // --- CLOUD & CLOUDFLARE SYNC (Safe & Non-Destructive) ---
  private cloudSyncEnabled = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isSyncing = false;
  private dirtyKeys = new Set<string>();
  private lastSyncedValues = new Map<string, string | null>();
  private cloudRevision = 0;
  
  public async initializeCloudSync(): Promise<void> {
    clearTimeout(this.syncTimeout);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.cloudSyncEnabled = false;
    this.dirtyKeys.clear();
    this.lastSyncedValues.clear();
    this.emitCloudStatus('syncing', 'در حال دریافت پایگاه داده ابری…');

    const cloudHadState = await this.runSyncCycle('pull');
    this.cloudSyncEnabled = true;
    if (cloudHadState === false) {
      for (const key of CLOUD_SYNC_KEYS) {
        if (localStorage.getItem(key) !== null) this.dirtyKeys.add(key);
      }
      await this.runSyncCycle('push');
    }

    this.pollTimer = setInterval(() => {
      this.runSyncCycle('auto').catch(() => {});
    }, 1500);
  }

  public stopCloudSync(): void {
    this.cloudSyncEnabled = false;
    clearTimeout(this.syncTimeout);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.dirtyKeys.clear();
    this.emitCloudStatus('idle', 'همگام‌سازی متوقف است.');
  }

  private emitCloudStatus(
    status: 'idle' | 'syncing' | 'synced' | 'error',
    message: string,
    extra: Record<string, unknown> = {}
  ): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('pe_cloud_sync_status', {
      detail: { status, message, revision: this.cloudRevision, ...extra }
    }));
  }

  private getClientId(): string {
    const key = 'chalak_cloud_client_id';
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(key, id);
    }
    return id;
  }

  private detectDirectStorageChanges(): void {
    if (!this.cloudSyncEnabled) return;
    for (const key of CLOUD_SYNC_KEYS) {
      const current = localStorage.getItem(key);
      const previous = this.lastSyncedValues.get(key) ?? null;
      if (current !== previous) this.dirtyKeys.add(key);
    }
  }

  private async runSyncCycle(mode: 'pull' | 'push' | 'auto', forceAll = false): Promise<boolean | null> {
    if (this.isSyncing) return null;
    this.isSyncing = true;
    try {
      if (mode === 'auto') {
        this.detectDirectStorageChanges();
        return this.dirtyKeys.size > 0 ? await this.pushStateToCloudInternal(false) : await this.pullFromCloud();
      }
      if (mode === 'push') return this.pushStateToCloudInternal(forceAll);
      return this.pullFromCloud();
    } finally {
      this.isSyncing = false;
    }
  }

  private applyRemoteState(remoteState: CloudState): void {
    let changed = false;
    for (const key of CLOUD_SYNC_KEYS) {
      if (this.dirtyKeys.has(key)) continue;
      const hasRemoteValue = Object.prototype.hasOwnProperty.call(remoteState, key);
      const nextRaw = hasRemoteValue ? JSON.stringify(remoteState[key]) : null;
      const localRaw = localStorage.getItem(key);
      if (nextRaw === null) {
        if (this.lastSyncedValues.has(key) && localRaw !== null) {
          localStorage.removeItem(key);
          this.notifyChange(key, null);
          changed = true;
        }
      } else if (localRaw !== nextRaw) {
        localStorage.setItem(key, nextRaw);
        this.notifyChange(key, remoteState[key]);
        changed = true;
      }
      this.lastSyncedValues.set(key, nextRaw);
    }
    if (changed) window.dispatchEvent(new CustomEvent('pe_cloud_data_received'));
  }

  private async pullFromCloud(): Promise<boolean | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);

      const res = await fetch('/api/state', { signal: controller.signal, credentials: 'same-origin' });
      clearTimeout(timeoutId);

      const contentType = res.headers.get('Content-Type') || '';
      if (!contentType.includes('application/json')) {
        this.emitCloudStatus('error', 'API فضای ابری در این اجرا فعال نیست؛ داده فقط محلی ذخیره می‌شود.');
        return null;
      }
      const result = contentType.includes('application/json')
        ? await res.json() as { state?: CloudState; revision?: number; updatedAt?: string; error?: string }
        : {};
      if (!res.ok) {
        if (res.status === 401) window.dispatchEvent(new Event('pe_auth_expired'));
        this.emitCloudStatus('error', result.error || `خطای دریافت داده ابری (${res.status})`);
        return null;
      }

      const cloudState = result.state && typeof result.state === 'object' ? result.state : {};
      this.cloudRevision = Number.isInteger(result.revision) ? Number(result.revision) : this.cloudRevision;
      if (Object.keys(cloudState).length === 0 && this.cloudRevision === 0) return false;
      this.applyRemoteState(cloudState);
      this.emitCloudStatus('synced', 'داده‌ها با فضای ابری همگام هستند.', {
        lastSyncedAt: result.updatedAt || new Date().toISOString()
      });
      return true;
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'AbortError'
        ? 'پاسخ فضای ابری بیش از حد طول کشید.'
        : 'ارتباط با پایگاه داده ابری برقرار نشد.';
      this.emitCloudStatus('error', message);
      return null;
    }
  }

  private triggerCloudSyncDebounced(): void {
    if (!this.cloudSyncEnabled) return;
    clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => {
      this.runSyncCycle('auto').catch(() => {});
    }, 700);
  }

  public async syncToCloudNow(): Promise<boolean> {
    clearTimeout(this.syncTimeout);
    if (!this.cloudSyncEnabled) {
      this.emitCloudStatus('error', 'ابتدا باید با حساب معتبر وارد سامانه شوید.');
      return false;
    }
    return (await this.runSyncCycle('auto')) === true;
  }

  /** Flush local edits first, then explicitly request and apply the latest cloud revision. */
  public async refreshFromCloudNow(): Promise<boolean> {
    clearTimeout(this.syncTimeout);
    if (!this.cloudSyncEnabled) {
      this.emitCloudStatus('error', 'ابتدا باید با حساب معتبر وارد سامانه شوید.');
      return false;
    }
    if (this.isSyncing) return false;
    // Include any legacy/direct storage mutation that occurred since the last
    // successful sync before deciding whether it is safe to pull.
    this.detectDirectStorageChanges();
    if (this.dirtyKeys.size > 0) {
      const pushed = await this.runSyncCycle('push');
      if (pushed !== true) return false;
    }
    return (await this.runSyncCycle('pull')) === true;
  }

  /** Remove only server-rehydratable shared data after sign-out; preferences remain local. */
  public clearAuthorizedCache(): void {
    this.stopCloudSync();
    for (const key of CLOUD_SYNC_KEYS) localStorage.removeItem(key);
    this.lastSyncedValues.clear();
    this.dirtyKeys.clear();
  }

  public async pushStateToCloud(): Promise<boolean> {
    if (!this.cloudSyncEnabled) return false;
    return (await this.runSyncCycle('push')) === true;
  }

  private async pushStateToCloudInternal(forceAll: boolean, allowConflictRetry = true): Promise<boolean> {
    try {
      this.detectDirectStorageChanges();
      if (forceAll) {
        for (const key of CLOUD_SYNC_KEYS) {
          if (localStorage.getItem(key) !== null) this.dirtyKeys.add(key);
        }
      }

      const keysToSend = Array.from(this.dirtyKeys);
      if (keysToSend.length === 0) {
        this.emitCloudStatus('synced', 'تغییری برای ارسال وجود ندارد.', { lastSyncedAt: new Date().toISOString() });
        return true;
      }

      const changes: CloudState = {};
      const sentRaw = new Map<string, string | null>();
      for (const key of keysToSend) {
        const raw = localStorage.getItem(key);
        sentRaw.set(key, raw);
        if (raw === null) changes[key] = null;
        else {
          try { changes[key] = JSON.parse(raw); }
          catch { changes[key] = raw; }
        }
      }

      this.emitCloudStatus('syncing', `در حال ارسال ${keysToSend.length} تغییر به فضای ابری…`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch('/api/state', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          state: changes,
          baseRevision: this.cloudRevision,
          clientId: this.getClientId(),
        })
      });
      clearTimeout(timeoutId);
      const contentType = res.headers.get('Content-Type') || '';
      if (!contentType.includes('application/json')) {
        this.emitCloudStatus('error', 'API فضای ابری در این اجرا فعال نیست؛ ذخیره فقط محلی انجام شد.');
        return false;
      }
      const result = contentType.includes('application/json')
        ? await res.json() as { state?: CloudState; revision?: number; updatedAt?: string; error?: string }
        : {};
      if (!res.ok) {
        if (res.status === 401) window.dispatchEvent(new Event('pe_auth_expired'));
        if (res.status === 409 && allowConflictRetry) {
          // Keep the local dirty values intact. Pulling and retrying the same
          // whole-key payload could silently overwrite another client's edit.
          this.cloudRevision = Number.isInteger(result.revision) ? Number(result.revision) : this.cloudRevision;
          this.emitCloudStatus('error', 'داده ابری در مرورگر دیگری تغییر کرده است. تغییر محلی حذف نشد؛ پیش از ادامه تعارض را بررسی کنید.');
          return false;
        }
        this.emitCloudStatus('error', result.error || `ذخیره ابری ناموفق بود (${res.status}).`);
        return false;
      }

      for (const [key, raw] of sentRaw) {
        if (localStorage.getItem(key) === raw) {
          this.dirtyKeys.delete(key);
          this.lastSyncedValues.set(key, raw);
        }
      }
      this.cloudRevision = Number.isInteger(result.revision) ? Number(result.revision) : this.cloudRevision + 1;
      if (result.state && typeof result.state === 'object') this.applyRemoteState(result.state);
      this.emitCloudStatus('synced', 'همه تغییرات در پایگاه داده ابری ذخیره شد.', {
        lastSyncedAt: result.updatedAt || new Date().toISOString()
      });
      if (this.dirtyKeys.size > 0) this.triggerCloudSyncDebounced();
      return true;
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'AbortError'
        ? 'ذخیره ابری به‌دلیل پایان زمان انتظار انجام نشد.'
        : 'ذخیره ابری به‌دلیل خطای شبکه انجام نشد.';
      this.emitCloudStatus('error', message);
      return false;
    }
  }

  // --- BACKUP & RESTORE ---
  public exportBackupJSON(): string {
    const backupData = {
      meta: {
        app: 'اصفهان چالاک - سامانه ارزیابی عملکرد',
        version: '4.0.0-Cloudflare',
        exportedAt: new Date().toISOString()
      },
      employees: this.getEmployees(),
      criteria: this.getCriteria(),
      profiles: this.getProfiles(),
      evaluations: this.getEvaluations(),
      archivedEvaluations: this.getArchivedEvaluations()
    };
    return JSON.stringify(backupData, null, 2);
  }

  public importBackupJSON(jsonStr: string): { success: boolean; message: string } {
    try {
      const data = JSON.parse(jsonStr);
      if (!data || typeof data !== 'object') {
        return { success: false, message: 'فایل پشتیبان معتبر نیست.' };
      }

      if (Array.isArray(data.employees)) this.saveEmployees(data.employees);
      if (Array.isArray(data.criteria)) this.saveCriteria(data.criteria);
      if (Array.isArray(data.profiles)) this.saveProfiles(data.profiles);
      if (Array.isArray(data.evaluations)) this.saveEvaluations(data.evaluations);
      if (Array.isArray(data.archivedEvaluations)) this.saveArchivedEvaluations(data.archivedEvaluations);

      return { success: true, message: 'اطلاعات پشتیبان با موفقیت بازیابی شد.' };
    } catch (e: any) {
      return { success: false, message: `خطا در بازخوانی فایل: ${e?.message || 'فرمت نامعتبر'}` };
    }
  }

  public resetToFactoryDefaults(): void {
    this.saveEmployees(SEED_EMPLOYEES);
    this.saveCriteria(SEED_CRITERIA);
    this.saveProfiles(SEED_PROFILES);
    this.saveEvaluations(SEED_EVALUATIONS);
    this.saveArchivedEvaluations([]);
  }
}

export const db = new AppDatabase();
