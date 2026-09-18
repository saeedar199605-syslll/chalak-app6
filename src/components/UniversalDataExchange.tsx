/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  FileText, 
  FileJson, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Layers, 
  RefreshCw,
  Info
} from 'lucide-react';

export interface DataExchangeConfig<T> {
  entityName: string; // e.g. 'بانک شاخص‌های شایستگی', 'پروفایل‌های شغلی', 'مدیریت پرسنل', 'ارزیابی‌ها'
  entityKey: string; // e.g. 'criteria', 'job_profiles', 'employees', 'evaluations'
  items: T[];
  onImport: (importedItems: any[], mode: 'merge' | 'replace') => { count: number; message?: string; errors?: string[] };
  csvHeaders: { key: keyof T | string; label: string; accessor?: (item: T) => any }[];
  templateSampleRows?: Record<string, string>[];
}

interface UniversalDataExchangeProps<T> {
  config: DataExchangeConfig<T>;
  isOpen: boolean;
  onClose: () => void;
  theme?: 'dark' | 'light';
}

export default function UniversalDataExchange<T>({
  config,
  isOpen,
  onClose,
  theme = 'dark'
}: UniversalDataExchangeProps<T>) {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [rawTextInput, setRawTextInput] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string; errors?: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const isDark = theme === 'dark';

  // Helper: Sanitize string against CSV Formula Injection & DDE attacks
  const sanitizeCSVCell = (raw: any): string => {
    if (raw === undefined || raw === null) return '""';
    let str = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
    // If text starts with risky formula triggers, neutralize with single quote prefix
    if (/^[=+\-@\t\r]/.test(str)) {
      str = "'" + str;
    }
    return `"${str.replace(/"/g, '""')}"`;
  };

  // Helper: Sanitize imported string data to prevent XSS / malicious payloads
  const sanitizeImportString = (val: any): string => {
    if (typeof val !== 'string') return val;
    return val.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').trim();
  };

  // Robust CSV Line parser respecting RFC 4180 quotes
  const parseCSVLine = (line: string, delimiter: string = ','): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        if (inQuotes && line[i + 1] === char) {
          current += char;
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result.map(s => s.replace(/^["']|["']$/g, ''));
  };

  // 1. EXPORT TO CSV (Excel UTF-8 BOM compatible)
  const handleExportCSV = () => {
    try {
      const headersRow = config.csvHeaders.map(h => `"${h.label.replace(/"/g, '""')}"`).join(',');
      const rows = config.items.map(item => {
        return config.csvHeaders.map(h => {
          const val = h.accessor ? h.accessor(item) : (item as any)[h.key];
          return sanitizeCSVCell(val);
        }).join(',');
      });

      const csvContent = [headersRow, ...rows].join('\n');
      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `chalak_${config.entityKey}_${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setStatusMessage({ type: 'success', text: `فایل استاندارد CSV (اکسل) شامل ${config.items.length} رکورد با موفقیت ایجاد و دانلود شد.` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `خطا در صدور فایل CSV: ${err.message}` });
    }
  };

  // 2. EXPORT TO JSON (Clean Structured Backup)
  const handleExportJSON = () => {
    try {
      const jsonStr = JSON.stringify(config.items, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `chalak_${config.entityKey}_${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setStatusMessage({ type: 'success', text: `پشتیبان کامل ساختاریافته JSON شامل ${config.items.length} رکورد با موفقیت دانلود شد.` });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `خطا در صدور فایل JSON: ${err.message}` });
    }
  };

  // 3. DOWNLOAD TEMPLATE SAMPLE
  const handleDownloadTemplate = () => {
    try {
      const headersRow = config.csvHeaders.map(h => `"${h.label}"`).join(',');
      let sampleRows = '';
      if (config.templateSampleRows && config.templateSampleRows.length > 0) {
        sampleRows = '\n' + config.templateSampleRows.map(row => {
          return config.csvHeaders.map(h => `"${row[h.label] || row[h.key as string] || ''}"`).join(',');
        }).join('\n');
      }

      const templateContent = headersRow + sampleRows;
      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), templateContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `template_${config.entityKey}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `خطا در دانلود قالب اکسل: ${err.message}` });
    }
  };

  // 4. PARSE AND PROCESS IMPORT
  const processImportString = (content: string) => {
    try {
      let parsedItems: any[] = [];
      const trimmed = content.trim();

      // Check if JSON
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        const parsed = JSON.parse(trimmed);
        parsedItems = Array.isArray(parsed) ? parsed : [parsed];
      } else {
        // Parse CSV or TSV
        const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) {
          throw new Error('فایل یا متن ورودی باید حداقل شامل یک سطر عنوان (Header) و یک سطر داده باشد.');
        }

        const delimiter = lines[0].includes('\t') ? '\t' : ',';
        const headers = parseCSVLine(lines[0], delimiter).map(h => sanitizeImportString(h));

        for (let i = 1; i < lines.length; i++) {
          const rawLine = lines[i];
          const cols = parseCSVLine(rawLine, delimiter).map(c => sanitizeImportString(c));
          const obj: any = {};
          
          headers.forEach((h, colIdx) => {
            const cleanHeader = h.trim();
            const matchedHeader = config.csvHeaders.find(ch => 
              ch.label.toLowerCase() === cleanHeader.toLowerCase() || 
              String(ch.key).toLowerCase() === cleanHeader.toLowerCase()
            );
            const keyToUse = matchedHeader ? matchedHeader.key : cleanHeader;
            obj[keyToUse] = cols[colIdx] !== undefined ? cols[colIdx] : '';
            // Also keep Persian key in case custom mapper uses it
            obj[cleanHeader] = cols[colIdx] !== undefined ? cols[colIdx] : '';
          });

          parsedItems.push(obj);
        }
      }

      if (parsedItems.length === 0) {
        throw new Error('هیچ داده معتبری برای درون‌ریزی شناسایی نشد.');
      }

      const result = config.onImport(parsedItems, importMode);
      setStatusMessage({
        type: result.errors && result.errors.length > 0 && result.count === 0 ? 'error' : 'success',
        text: result.message || `تعداد ${result.count} رکورد با موفقیت پردازش و در سامانه ثبت گردید.`,
        errors: result.errors
      });
      setRawTextInput('');
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `خطا در پردازش فایل: ${err.message}` });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        processImportString(text);
      }
    };
    reader.onerror = () => {
      setStatusMessage({ type: 'error', text: 'خطا در خواندن فایل از حافظه دستگاه.' });
    };
    reader.readAsText(file, 'UTF-8');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200" dir="rtl">
      <div className={`w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
        isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        
        {/* Modal Header */}
        <div className={`p-5 border-b flex items-center justify-between ${
          isDark ? 'border-slate-800 bg-slate-950/40' : 'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center text-white shadow-md">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className={`font-black text-sm md:text-base ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                مرکز تبادل جامع داده: {config.entityName}
              </h3>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                ورود (Import) و خروجی کامل (Export) سازگار با اکسل، CSV و JSON
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className={`flex border-b p-2 gap-2 ${
          isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-100/70'
        }`}>
          <button
            onClick={() => { setActiveTab('export'); setStatusMessage(null); }}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'export'
                ? 'bg-red-600 text-white shadow-md font-black'
                : isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800/50' : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>خروجی گرفتن و دانلود (Export)</span>
          </button>
          <button
            onClick={() => { setActiveTab('import'); setStatusMessage(null); }}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'import'
                ? 'bg-red-600 text-white shadow-md font-black'
                : isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800/50' : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>ورود اطلاعات و بارگذاری (Import)</span>
          </button>
        </div>

        {/* Status Notification */}
        {statusMessage && (
          <div className={`m-4 p-3.5 rounded-2xl border text-xs font-bold flex flex-col gap-1.5 ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : statusMessage.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
              : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
          }`}>
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>{statusMessage.text}</span>
            </div>
            {statusMessage.errors && statusMessage.errors.length > 0 && (
              <ul className="list-disc list-inside text-[11px] font-normal text-rose-500 dark:text-rose-300 mt-1 space-y-0.5">
                {statusMessage.errors.slice(0, 5).map((e, idx) => (
                  <li key={idx}>{e}</li>
                ))}
                {statusMessage.errors.length > 5 && (
                  <li>و {statusMessage.errors.length - 5} خطای دیگر...</li>
                )}
              </ul>
            )}
          </div>
        )}

        {/* Tab Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'export' ? (
            <div className="space-y-4">
              <div className={`p-4 rounded-2xl border space-y-2 ${
                isDark ? 'bg-slate-800/40 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>تعداد رکوردهای آماده صدور:</span>
                  <span className="text-sm font-black text-red-500 font-mono">{config.items.length.toLocaleString('fa-IR')} رکورد</span>
                </div>
                <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  فایل خروجی شامل کلیه ستون‌های استاندارد جدول بوده و با نرم‌افزارهای Microsoft Excel، Google Sheets و سامانه‌های ERP سازگار است.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="p-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-900/20 transition-all cursor-pointer"
                >
                  <FileSpreadsheet className="w-5 h-5 shrink-0" />
                  <div className="text-right">
                    <div className="text-xs font-black">دانلود فایل CSV (اکسل)</div>
                    <div className="text-[10px] text-emerald-100/90 font-normal">فرمت استاندارد جدول با UTF-8 BOM</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleExportJSON}
                  className={`p-4 rounded-2xl border font-bold flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-sm ${
                    isDark 
                      ? 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700 hover:border-slate-600' 
                      : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <FileJson className="w-5 h-5 text-indigo-500 shrink-0" />
                  <div className="text-right">
                    <div className="text-xs font-black">دانلود ساختار کامل JSON</div>
                    <div className={`text-[10px] font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>پشتیبان‌گیری ساختاریافته سیستمی</div>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              
              {/* Import Mode Selection */}
              <div className={`flex items-center justify-between p-3.5 rounded-2xl border text-xs ${
                isDark ? 'bg-slate-800/40 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className={`font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>روش اعمال داده‌های جدید:</span>
                <div className="flex items-center gap-4">
                  <label className={`flex items-center gap-1.5 cursor-pointer font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'merge'}
                      onChange={() => setImportMode('merge')}
                      className="accent-red-600"
                    />
                    <span>افزودن و ادغام (Merge)</span>
                  </label>
                  <label className={`flex items-center gap-1.5 cursor-pointer font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === 'replace'}
                      onChange={() => setImportMode('replace')}
                      className="accent-red-600"
                    />
                    <span>جایگزینی کامل (Replace)</span>
                  </label>
                </div>
              </div>

              {/* Template Download Prompt */}
              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs">
                <span className="text-indigo-600 dark:text-indigo-300 font-medium">نیاز به الگوی استاندارد جهت تکمیل داده‌ها دارید؟</span>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-[11px] flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>دانلود قالب نمونه</span>
                </button>
              </div>

              {/* Drag and Drop / File Picker */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 group ${
                  isDark 
                    ? 'border-slate-700 hover:border-red-500 bg-slate-950/40' 
                    : 'border-slate-300 hover:border-red-500 bg-slate-50'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-red-600/10 border border-red-600/20 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <div className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  فایل CSV یا JSON خود را اینجا رها کنید یا کلیک نمایید
                </div>
                <div className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  پشتیبانی از فرمت‌های CSV، TXT تب‌بندی‌شده، و JSON
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {/* Or Paste Raw Text */}
              <div className="space-y-1.5">
                <label className={`block text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  یا کپی مستقیم متن / جدول اکسل (Paste):
                </label>
                <textarea
                  rows={4}
                  value={rawTextInput}
                  onChange={(e) => setRawTextInput(e.target.value)}
                  placeholder="سطرهای کپی‌شده از اکسل یا فایل متنی را اینجا قرار دهید..."
                  className={`w-full rounded-2xl p-3 text-xs font-mono focus:outline-none focus:border-red-500 transition-colors border ${
                    isDark 
                      ? 'bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600' 
                      : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                  }`}
                />
              </div>

              <button
                type="button"
                disabled={!rawTextInput.trim()}
                onClick={() => processImportString(rawTextInput)}
                className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-600/20 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>پردازش و ثبت داده‌های وارد شده</span>
              </button>

            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className={`p-4 border-t flex justify-end ${
          isDark ? 'border-slate-800 bg-slate-950/30' : 'border-slate-200 bg-slate-50'
        }`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
              isDark 
                ? 'bg-slate-800 hover:bg-slate-750 text-slate-300' 
                : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
            }`}
          >
            بستن پنجره
          </button>
        </div>

      </div>
    </div>
  );
}
