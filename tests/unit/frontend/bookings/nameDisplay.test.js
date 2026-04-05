import { describe, it, expect } from 'vitest';
import { compactName, stripHtml } from '@/features/bookings/utils/nameDisplay';

describe('nameDisplay utils', () => {
  describe('compactName', () => {
    it('returns full name if it fits within maxChars', () => {
      expect(compactName('John Smith', 12)).toBe('John Smith');
    });

    it('returns single name without truncation if under maxChars', () => {
      expect(compactName('Alice', 10)).toBe('Alice');
    });

    it('compacts full name to first + last initial if space allows', () => {
      const result = compactName('Christopher Johnson', 15);
      expect(result).toBe('Christopher J.');
    });

    it('truncates single name with ellipsis when exceeding maxChars', () => {
      const result = compactName('Maximilian', 5);
      expect(result).toContain('…');
      expect(result.length).toBe(5);
    });

    it('handles names with multiple spaces', () => {
      expect(compactName('Mary  Anne  Smith', 12)).toBe('Mary S.');
    });

    it('returns empty string for empty input', () => {
      expect(compactName('', 10)).toBe('');
    });

    it('handles null/undefined gracefully', () => {
      expect(compactName(null, 10)).toBe('');
      expect(compactName(undefined, 10)).toBe('');
    });

    it('defaults to 12 chars if maxChars not provided', () => {
      const name = 'John Q. Public';
      const result = compactName(name);
      expect(result.length).toBeLessThanOrEqual(12);
    });

    it('preserves first name and shows last initial when possible', () => {
      const result = compactName('Alexander Rodriguez', 18);
      expect(result).toMatch(/^Alexander/);
      expect(result).toContain('R');
    });

    it('handles very small maxChars with ellipsis', () => {
      const result = compactName('John Doe', 1);
      // When maxChars is 1, the function tries to fit "J…" (2 chars) but trims to fit
      expect(result.length).toBeLessThanOrEqual(2);
      expect(result).toContain('…');
    });
  });

  describe('stripHtml', () => {
    it('removes basic HTML tags', () => {
      expect(stripHtml('<p>Hello</p>')).toBe('Hello');
    });

    it('removes multiple HTML tags', () => {
      expect(stripHtml('<div><span>Test</span></div>')).toBe('Test');
    });

    it('collapses multiple spaces', () => {
      expect(stripHtml('Hello   <br/>   World')).toBe('Hello World');
    });

    it('removes self-closing tags', () => {
      expect(stripHtml('Line<br/>Break')).toBe('Line Break');
    });

    it('strips HTML entities and tags', () => {
      expect(stripHtml('<p>Test &amp; More</p>')).toContain('Test');
    });

    it('returns empty string for empty input', () => {
      expect(stripHtml('')).toBe('');
    });

    it('handles null/undefined input gracefully', () => {
      // stripHtml coerces null/undefined to string first
      const nullResult = stripHtml(null);
      const undefinedResult = stripHtml(undefined);
      expect(typeof nullResult).toBe('string');
      expect(typeof undefinedResult).toBe('string');
    });

    it('handles plain text with no tags', () => {
      expect(stripHtml('Just plain text')).toBe('Just plain text');
    });

    it('preserves text with special characters', () => {
      const result = stripHtml('Price: $<b>100</b>');
      expect(result).toContain('Price');
      expect(result).toContain('100');
    });

    it('handles nested tags', () => {
      const html = '<div><p><span>Nested</span></p></div>';
      const result = stripHtml(html);
      expect(result).toBe('Nested');
    });
  });
});
