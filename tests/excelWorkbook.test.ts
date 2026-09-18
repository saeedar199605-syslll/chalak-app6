import { File as NodeFile } from 'node:buffer';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { readWorkbookRows } from '../src/utils/excelWorkbook';

describe('Excel workbook import', () => {
  it('reads XLSX rows and formula results', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('داده‌ها');
    sheet.addRow(['کد', 'امتیاز']);
    sheet.addRow(['EMP-1', { formula: '1+2', result: 3 }]);
    const buffer = await workbook.xlsx.writeBuffer();
    const file = new NodeFile([new Uint8Array(buffer)], 'sample.xlsx') as unknown as File;

    const parsed = await readWorkbookRows(file);

    expect(parsed.sheets).toEqual(['داده‌ها']);
    expect(parsed.rowsBySheet['داده‌ها']).toEqual([
      ['کد', 'امتیاز'],
      ['EMP-1', 3]
    ]);
  });

  it('reads UTF-8 CSV while preserving quoted commas', async () => {
    const file = new NodeFile(
      ['\uFEFFکد,توضیح\r\nEMP-1,"دقیق, منظم"'],
      'sample.csv',
      { type: 'text/csv' }
    ) as unknown as File;

    const parsed = await readWorkbookRows(file);

    expect(parsed.rowsBySheet.CSV).toEqual([
      ['کد', 'توضیح'],
      ['EMP-1', 'دقیق, منظم']
    ]);
  });
});
