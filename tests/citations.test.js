import { describe, it, expect } from 'vitest';
import { extractCitedIds, validateCitations, formatInlineCitations } from '../server/services/citations.js';

describe('Citations Service', () => {
  describe('extractCitedIds', () => {
    it('extracts single citation IDs', () => {
      const text = 'The policy states [1] that employees must [2] follow guidelines.';
      const ids = extractCitedIds(text);
      expect(ids.has(1)).toBe(true);
      expect(ids.has(2)).toBe(true);
      expect(ids.size).toBe(2);
    });

    it('extracts comma-separated citation IDs', () => {
      const text = 'According to multiple sources [1,3,5] this is true.';
      const ids = extractCitedIds(text);
      expect(ids.has(1)).toBe(true);
      expect(ids.has(3)).toBe(true);
      expect(ids.has(5)).toBe(true);
    });

    it('extracts range citation IDs', () => {
      const text = 'Documents [2-4] confirm this.';
      const ids = extractCitedIds(text);
      expect(ids.has(2)).toBe(true);
      expect(ids.has(3)).toBe(true);
      expect(ids.has(4)).toBe(true);
    });

    it('returns empty set for text without citations', () => {
      const text = 'No citations here.';
      const ids = extractCitedIds(text);
      expect(ids.size).toBe(0);
    });

    it('handles mixed citation formats', () => {
      const text = 'See [1], also [3,4] and [7-9].';
      const ids = extractCitedIds(text);
      expect(ids.size).toBe(6); // 1, 3, 4, 7, 8, 9
    });
  });

  describe('validateCitations', () => {
    const mockChunks = [
      { id: 'chunk-1', content: 'Chunk 1 content about HR policy.', pageNumber: 1, title: 'HR_Policy.pdf', originalFilename: 'HR_Policy.pdf', score: 0.95 },
      { id: 'chunk-2', content: 'Chunk 2 content about benefits.', pageNumber: 3, title: 'Benefits.pdf', originalFilename: 'Benefits.pdf', score: 0.88 },
      { id: 'chunk-3', content: 'Chunk 3 content about guidelines.', pageNumber: 5, title: 'Guidelines.md', originalFilename: 'Guidelines.md', score: 0.82 },
    ];

    it('validates correct citations', () => {
      const text = 'The policy [1] states benefits [2] are available.';
      const { cleanedText, validSources, invalidIds } = validateCitations(text, mockChunks);

      expect(invalidIds.length).toBe(0);
      expect(validSources.length).toBe(2);
      expect(validSources[0].sourceId).toBe(1);
      expect(validSources[0].title).toBe('HR_Policy.pdf');
      expect(validSources[1].sourceId).toBe(2);
    });

    it('strips invalid citation IDs', () => {
      const text = 'The policy [1] references [99] which is invalid.';
      const { cleanedText, validSources, invalidIds } = validateCitations(text, mockChunks);

      expect(invalidIds).toContain(99);
      expect(validSources.length).toBe(1);
      expect(cleanedText).not.toContain('[99]');
      expect(cleanedText).toContain('[1]');
    });

    it('handles text with no citations', () => {
      const text = 'No citations in this response.';
      const { cleanedText, validSources, invalidIds } = validateCitations(text, mockChunks);

      expect(validSources.length).toBe(0);
      expect(invalidIds.length).toBe(0);
      expect(cleanedText).toBe(text);
    });

    it('generates formatted citations', () => {
      const text = 'According to [1] and [3].';
      const { validSources } = validateCitations(text, mockChunks);

      expect(validSources[0].formattedCitation).toBe('[Doc: HR_Policy.pdf, Page 1]');
      expect(validSources[1].formattedCitation).toBe('[Doc: Guidelines.md, Page 5]');
    });

    it('includes snippets in valid sources', () => {
      const text = 'See [2].';
      const { validSources } = validateCitations(text, mockChunks);

      expect(validSources[0].snippet).toContain('Chunk 2 content');
    });

    it('deduplicates citation IDs', () => {
      const text = 'Point [1] and again [1].';
      const { validSources } = validateCitations(text, mockChunks);

      // Should only have one source entry for ID 1
      expect(validSources.length).toBe(1);
    });
  });

  describe('formatInlineCitations', () => {
    it('replaces source IDs with formatted citations', () => {
      const validSources = [
        { sourceId: 1, formattedCitation: '[Doc: Policy.pdf, Page 2]' },
        { sourceId: 2, formattedCitation: '[Doc: Guide.md, Page 1]' },
      ];

      const text = 'The rule [1] says you should [2] follow it.';
      const formatted = formatInlineCitations(text, validSources);

      expect(formatted).toContain('[Doc: Policy.pdf, Page 2]');
      expect(formatted).toContain('[Doc: Guide.md, Page 1]');
      expect(formatted).not.toContain('[1]');
      expect(formatted).not.toContain('[2]');
    });
  });
});
