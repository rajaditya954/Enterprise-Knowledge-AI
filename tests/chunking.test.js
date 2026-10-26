import { describe, it, expect } from 'vitest';
import { chunkPages } from '../server/services/chunking.js';

describe('Chunking Service', () => {
  it('returns chunks with content and page info', () => {
    const pages = [
      { pageNumber: 1, text: 'This is the first page of content. It has some text that should be chunked appropriately.' },
    ];

    const chunks = chunkPages(pages);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]).toHaveProperty('content');
    expect(chunks[0]).toHaveProperty('pageNumber');
    expect(chunks[0]).toHaveProperty('tokenCount');
    expect(chunks[0]).toHaveProperty('chunkIndex');
    expect(chunks[0].content.length).toBeGreaterThan(0);
  });

  it('handles multiple pages', () => {
    const pages = [
      { pageNumber: 1, text: 'Page one content with some meaningful text about policies.' },
      { pageNumber: 2, text: 'Page two content with some meaningful text about procedures.' },
      { pageNumber: 3, text: 'Page three content with some meaningful text about guidelines.' },
    ];

    const chunks = chunkPages(pages);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('detects section headings in markdown', () => {
    const pages = [
      {
        pageNumber: 1,
        text: `## Introduction

This is the introduction section with detailed content about the topic.

## Methods

This is the methods section describing the approach taken.`,
      },
    ];

    const chunks = chunkPages(pages);
    expect(chunks.length).toBeGreaterThanOrEqual(1);

    // At least one chunk should have detected a heading
    const hasHeading = chunks.some((c) => c.sectionHeading !== null);
    expect(hasHeading).toBe(true);
  });

  it('handles empty pages gracefully', () => {
    const pages = [
      { pageNumber: 1, text: '' },
      { pageNumber: 2, text: '   ' },
    ];

    const chunks = chunkPages(pages);
    // Should handle empty input without error
    expect(Array.isArray(chunks)).toBe(true);
  });

  it('preserves page numbers across chunks', () => {
    const pages = [
      { pageNumber: 5, text: 'Content on page five with meaningful text.' },
      { pageNumber: 6, text: 'Content on page six with meaningful text.' },
    ];

    const chunks = chunkPages(pages);
    for (const chunk of chunks) {
      expect(chunk.pageNumber).toBeGreaterThanOrEqual(5);
      expect(chunk.pageNumber).toBeLessThanOrEqual(6);
    }
  });

  it('generates chunks within token limits', () => {
    // Create a large document
    const largeText = Array(200)
      .fill('This is a sentence with enough words to contribute meaningfully to the token count of each chunk.')
      .join(' ');

    const pages = [{ pageNumber: 1, text: largeText }];
    const chunks = chunkPages(pages);

    expect(chunks.length).toBeGreaterThan(1);

    // Each chunk should be roughly within the configured max tokens
    // (800 tokens ≈ 3200 chars with chars/4 heuristic)
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(1000); // Allow some margin
    }
  });

  it('assigns sequential chunk indices', () => {
    const pages = [
      { pageNumber: 1, text: Array(50).fill('Some text here for chunking.').join(' ') },
    ];

    const chunks = chunkPages(pages);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunkIndex).toBe(i);
    }
  });
});
