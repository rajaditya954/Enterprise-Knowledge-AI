/**
 * Citation validation and formatting.
 *
 * The model cites by source ID (e.g., [1], [2]).
 * The backend verifies that every cited ID exists in the retrieved set,
 * strips invalid ones, and renders the final format.
 */

/**
 * Extract source IDs cited in the model's response.
 * Matches patterns like [1], [2], [3,4], [1-3], etc.
 *
 * @param {string} text - The model's response text.
 * @returns {Set<number>} Set of cited source IDs.
 */
export function extractCitedIds(text) {
  const ids = new Set();
  // Match [N], [N,M], [N-M] patterns
  const pattern = /\[(\d+(?:[,\s-]+\d+)*)\]/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const inner = match[1];

    // Handle ranges like "1-3"
    const rangeMatch = inner.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      for (let i = start; i <= end; i++) {
        ids.add(i);
      }
      continue;
    }

    // Handle comma-separated like "1,2,3"
    const parts = inner.split(/[,\s]+/);
    for (const part of parts) {
      const num = parseInt(part.trim(), 10);
      if (!isNaN(num)) {
        ids.add(num);
      }
    }
  }

  return ids;
}

/**
 * Validate citations against the retrieved chunk set.
 * Returns only valid citations and strips invalid source IDs from the text.
 *
 * @param {string} responseText - The model's full response.
 * @param {Array<{ id: string, content: string, pageNumber: number, title: string, score: number }>} retrievedChunks
 *        The retrieved chunks, indexed by their 1-based position.
 * @returns {{ cleanedText: string, validSources: Array, invalidIds: number[] }}
 */
export function validateCitations(responseText, retrievedChunks) {
  const citedIds = extractCitedIds(responseText);
  const maxValidId = retrievedChunks.length;

  const validIds = [];
  const invalidIds = [];

  for (const id of citedIds) {
    if (id >= 1 && id <= maxValidId) {
      validIds.push(id);
    } else {
      invalidIds.push(id);
    }
  }

  // Strip invalid citation references from text
  let cleanedText = responseText;
  for (const invalidId of invalidIds) {
    cleanedText = cleanedText.replace(new RegExp(`\\[${invalidId}\\]`, 'g'), '');
  }

  // Clean up any empty brackets or double spaces left behind
  cleanedText = cleanedText.replace(/\[\s*\]/g, '').replace(/\s{2,}/g, ' ').trim();

  // Build valid sources array with formatted citations
  const validSources = [...new Set(validIds)].sort((a, b) => a - b).map((id) => {
    const chunk = retrievedChunks[id - 1];
    return {
      sourceId: id,
      chunkId: chunk.id,
      title: chunk.title,
      originalFilename: chunk.originalFilename || chunk.title,
      pageNumber: chunk.pageNumber,
      snippet: chunk.content.substring(0, 200) + (chunk.content.length > 200 ? '...' : ''),
      score: chunk.score,
      formattedCitation: `[Doc: ${chunk.originalFilename || chunk.title}, Page ${chunk.pageNumber || 'N/A'}]`,
    };
  });

  return { cleanedText, validSources, invalidIds };
}

/**
 * Replace inline source IDs with formatted citations in the text.
 * E.g., [1] -> [Doc: HR_Policy.pdf, Page 4]
 */
export function formatInlineCitations(text, validSources) {
  let formatted = text;
  // Replace from highest to lowest to avoid index collision issues
  const sorted = [...validSources].sort((a, b) => b.sourceId - a.sourceId);

  for (const source of sorted) {
    formatted = formatted.replace(
      new RegExp(`\\[${source.sourceId}\\]`, 'g'),
      source.formattedCitation
    );
  }

  return formatted;
}
