/**
 * Base adapter interface for document source extraction.
 *
 * Every adapter must implement:
 *   extract(input: Buffer | string) -> { pages: [{ pageNumber: number, text: string }], metadata: object }
 *
 * @abstract
 */
export class SourceAdapter {
  /**
   * @param {Buffer|string} input - The raw file content.
   * @returns {Promise<{ pages: Array<{ pageNumber: number, text: string }>, metadata: object }>}
   */
  async extract(_input) {
    throw new Error('extract() must be implemented by subclass');
  }

  /**
   * Normalize whitespace: collapse multiple spaces/newlines, trim each line.
   */
  normalizeText(text) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trim();
  }

  /**
   * Strip repeated headers/footers from pages.
   * If a line appears on >60% of pages, it's likely a header/footer.
   */
  stripRepeatedHeadersFooters(pages) {
    if (pages.length < 3) return pages;

    const lineFrequency = new Map();
    for (const page of pages) {
      const lines = page.text.split('\n');
      const firstLines = lines.slice(0, 3).map((l) => l.trim());
      const lastLines = lines.slice(-3).map((l) => l.trim());
      for (const line of [...firstLines, ...lastLines]) {
        if (line.length > 5) {
          lineFrequency.set(line, (lineFrequency.get(line) || 0) + 1);
        }
      }
    }

    const threshold = pages.length * 0.6;
    const repeatedLines = new Set();
    for (const [line, count] of lineFrequency) {
      if (count >= threshold) {
        repeatedLines.add(line);
      }
    }

    if (repeatedLines.size === 0) return pages;

    return pages.map((page) => ({
      ...page,
      text: page.text
        .split('\n')
        .filter((line) => !repeatedLines.has(line.trim()))
        .join('\n')
        .trim(),
    }));
  }

  /**
   * Filter out empty pages.
   */
  dropEmptyPages(pages) {
    return pages.filter((page) => page.text.trim().length > 0);
  }

  /**
   * Standard postprocessing pipeline.
   */
  postprocess(pages) {
    const normalized = pages.map((p) => ({ ...p, text: this.normalizeText(p.text) }));
    const stripped = this.stripRepeatedHeadersFooters(normalized);
    return this.dropEmptyPages(stripped);
  }
}
