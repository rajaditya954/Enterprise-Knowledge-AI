/**
 * Approximate token count from text using chars/4 heuristic.
 * This avoids heavy tokenizer dependencies while being reasonable for chunking.
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
