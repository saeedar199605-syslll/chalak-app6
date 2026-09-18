import { describe, expect, it } from 'vitest';
import { calculateKpiScore, evaluateNumericFormula, safeEvaluateMath } from '../src/utils/formulaEngine';

describe('safeEvaluateMath', () => {
  it('respects arithmetic precedence and parentheses', () => {
    expect(safeEvaluateMath('2 + 3 * 4', {}).result).toBe(14);
    expect(safeEvaluateMath('(2 + 3) * 4', {}).result).toBe(20);
  });

  it('implements exponentiation as a right-associative operator', () => {
    expect(safeEvaluateMath('2 ^ 3 ^ 2', {}).result).toBe(512);
  });

  it('substitutes only declared numeric variables', () => {
    expect(evaluateNumericFormula('baseAmount * multiplier + score', {
      baseAmount: 10_000,
      multiplier: 1.5,
      score: 90,
    })).toBe(15_090);
    expect(safeEvaluateMath('SCORE / target', { score: 90, target: 100 }).result).toBe(0.9);
  });

  it('rejects executable code, unknown variables and invalid arithmetic', () => {
    expect(safeEvaluateMath('globalThis.alert(1)', {}).error).toBeTruthy();
    expect(safeEvaluateMath('actual + missing', { actual: 2 }).error).toContain('تعریف نشده');
    expect(safeEvaluateMath('1 / 0', {}).error).toContain('تقسیم بر صفر');
  });
});

describe('calculateKpiScore', () => {
  it('calculates a ratio KPI and maps it to score thresholds', () => {
    const result = calculateKpiScore({
      id: 'c1', code: 'OUTPUT', name: 'خروجی', category: 'K', weight: 100,
      calculationType: 'ratio', targetValue: 100, dir: 'more',
    } as any, { actual: 105, target: 100 });
    expect(result.computedValue).toBe(105);
    expect(result.score).toBe(5);
  });

  it('returns a controlled error for an invalid custom formula', () => {
    const result = calculateKpiScore({
      id: 'c2', code: 'CUSTOM', name: 'سفارشی', category: 'K', weight: 100,
      calculationType: 'custom_formula', formulaExpression: 'actual + unknown', dir: 'more',
      variables: [{ key: 'actual', label: 'actual', defaultValue: 0 }],
    } as any, { actual: 10 });
    expect(result.error).toBeTruthy();
    expect(result.score).toBe(1);
  });
});
