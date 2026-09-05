import { describe, it, expect } from 'vitest';
import { csvCell } from '../src/lib/stats-csv';

describe('csvCell', () => {
  it('leaves a plain name untouched', () => {
    expect(csvCell('Dave')).toBe('Dave');
    expect(csvCell('Mary Ann')).toBe('Mary Ann');
  });

  it('neutralizes formula-looking prefixes with a leading quote', () => {
    expect(csvCell('-2+cmd')).toBe("'-2+cmd");
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@import')).toBe("'@import");
    expect(csvCell('\tx')).toBe("'\tx");
  });

  it('quotes a value containing a carriage return (and doubles inner quotes)', () => {
    expect(csvCell('a\rb')).toBe('"a\rb"');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell('say "hi", now')).toBe('"say ""hi"", now"');
  });

  it('quotes a CR-prefixed value after guarding it', () => {
    // Leading CR hits both the prefix guard and the quoting rule.
    expect(csvCell('\rfoo')).toBe('"\'\rfoo"');
  });

  it('keeps bare numbers (including negatives) as-is', () => {
    expect(csvCell(-3)).toBe('-3');
    expect(csvCell('-1.25')).toBe('-1.25');
    expect(csvCell(7)).toBe('7');
    expect(csvCell('0')).toBe('0');
  });

  it('renders null/undefined as an empty cell', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});
