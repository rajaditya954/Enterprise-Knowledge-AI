import { config } from '../config.js';
import { estimateTokens } from '../utils/tokens.js';

const { maxTokens, minTokens, overlapTokens } = config.chunking;

/**
 * Recursively split text into chunks of approximately `maxTokens` tokens
 * with `overlapTokens` overlap. Strategy: paragraph -> sentence -> word.
 *
 * Each chunk records its source page number (or page range) and
 * a section heading if detectable.
 *
 * @param {Array<{ pageNumber: number, text: string }>} pages
 * @returns {Array<{ content: string, pageNumber: number, pageRange: [number,number], sectionHeading: string|null, tokenCount: number, chunkIndex: number }>}
 */
export function chunkPages(pages) {
  // First, build a flat list of annotated paragraphs with page info
  const paragraphs = [];
  let currentHeading = null;

  for (const page of pages) {
    const lines = page.text.split('\n');
    let currentParagraph = [];

    for (const line of lines) {
      // Detect section headings (Markdown style or ALL CAPS lines)
      if (isHeading(line)) {
        // Flush current paragraph
        if (currentParagraph.length > 0) {
          paragraphs.push({
            text: currentParagraph.join('\n'),
            pageNumber: page.pageNumber,
            heading: currentHeading,
          });
          currentParagraph = [];
        }
        currentHeading = line.replace(/^#+\s*/, '').trim();
        continue;
      }

      if (line.trim() === '') {
        if (currentParagraph.length > 0) {
          paragraphs.push({
            text: currentParagraph.join('\n'),
            pageNumber: page.pageNumber,
            heading: currentHeading,
          });
          currentParagraph = [];
        }
      } else {
        currentParagraph.push(line);
      }
    }

    if (currentParagraph.length > 0) {
      paragraphs.push({
        text: currentParagraph.join('\n'),
        pageNumber: page.pageNumber,
        heading: currentHeading,
      });
    }
  }

  // Now build chunks from paragraphs using recursive splitting
  const chunks = [];
  let currentChunk = { texts: [], pages: new Set(), heading: null, tokens: 0 };

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para.text);

    // If a single paragraph exceeds maxTokens, split it further
    if (paraTokens > maxTokens) {
      // Flush current chunk
      if (currentChunk.tokens > 0) {
        chunks.push(finalizeChunk(currentChunk, chunks.length));
        currentChunk = createOverlapChunk(currentChunk, chunks.length);
      }
      // Split large paragraph by sentences
      const sentenceChunks = splitBySentences(para.text, para.pageNumber, para.heading);
      for (const sc of sentenceChunks) {
        chunks.push({ ...sc, chunkIndex: chunks.length });
      }
      currentChunk = { texts: [], pages: new Set(), heading: para.heading, tokens: 0 };
      continue;
    }

    // If adding this paragraph would exceed maxTokens, flush
    if (currentChunk.tokens + paraTokens > maxTokens && currentChunk.tokens >= minTokens) {
      chunks.push(finalizeChunk(currentChunk, chunks.length));
      currentChunk = createOverlapChunk(currentChunk, chunks.length);
    }

    currentChunk.texts.push(para.text);
    currentChunk.pages.add(para.pageNumber);
    currentChunk.heading = currentChunk.heading || para.heading;
    currentChunk.tokens += paraTokens;
  }

  // Flush final chunk
  if (currentChunk.tokens > 0) {
    chunks.push(finalizeChunk(currentChunk, chunks.length));
  }

  return chunks;
}

/**
 * Split a large paragraph into sentence-level chunks.
 */
function splitBySentences(text, pageNumber, heading) {
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
  const chunks = [];
  let current = { texts: [], tokens: 0 };

  for (const sentence of sentences) {
    const sentTokens = estimateTokens(sentence);

    // If a single sentence exceeds maxTokens, split by words
    if (sentTokens > maxTokens) {
      if (current.tokens > 0) {
        chunks.push({
          content: current.texts.join(' '),
          pageNumber,
          pageRange: [pageNumber, pageNumber],
          sectionHeading: heading,
          tokenCount: current.tokens,
        });
        current = { texts: [], tokens: 0 };
      }
      const wordChunks = splitByWords(sentence, pageNumber, heading);
      chunks.push(...wordChunks);
      continue;
    }

    if (current.tokens + sentTokens > maxTokens && current.tokens >= minTokens) {
      chunks.push({
        content: current.texts.join(' '),
        pageNumber,
        pageRange: [pageNumber, pageNumber],
        sectionHeading: heading,
        tokenCount: current.tokens,
      });
      // Overlap: take last sentence
      const overlapText = current.texts.slice(-1);
      current = {
        texts: [...overlapText],
        tokens: estimateTokens(overlapText.join(' ')),
      };
    }

    current.texts.push(sentence.trim());
    current.tokens += sentTokens;
  }

  if (current.tokens > 0) {
    chunks.push({
      content: current.texts.join(' '),
      pageNumber,
      pageRange: [pageNumber, pageNumber],
      sectionHeading: heading,
      tokenCount: current.tokens,
    });
  }

  return chunks;
}

/**
 * Split by words as last resort for very long sentences.
 */
function splitByWords(text, pageNumber, heading) {
  const words = text.split(/\s+/);
  const chunks = [];
  let current = [];
  let currentTokens = 0;

  for (const word of words) {
    const wordTokens = estimateTokens(word);
    if (currentTokens + wordTokens > maxTokens && current.length > 0) {
      const content = current.join(' ');
      chunks.push({
        content,
        pageNumber,
        pageRange: [pageNumber, pageNumber],
        sectionHeading: heading,
        tokenCount: estimateTokens(content),
      });
      // Overlap
      const overlapWords = current.slice(-Math.floor(current.length * 0.1));
      current = [...overlapWords];
      currentTokens = estimateTokens(current.join(' '));
    }
    current.push(word);
    currentTokens += wordTokens;
  }

  if (current.length > 0) {
    const content = current.join(' ');
    chunks.push({
      content,
      pageNumber,
      pageRange: [pageNumber, pageNumber],
      sectionHeading: heading,
      tokenCount: estimateTokens(content),
    });
  }

  return chunks;
}

function isHeading(line) {
  const trimmed = line.trim();
  // Markdown heading
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  // ALL CAPS heading (at least 4 chars, no lowercase)
  if (trimmed.length >= 4 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed)) {
    return true;
  }
  return false;
}

function finalizeChunk(chunk, index) {
  const pagesArr = Array.from(chunk.pages).sort((a, b) => a - b);
  return {
    content: chunk.texts.join('\n\n'),
    pageNumber: pagesArr[0],
    pageRange: [pagesArr[0], pagesArr[pagesArr.length - 1]],
    sectionHeading: chunk.heading,
    tokenCount: chunk.tokens,
    chunkIndex: index,
  };
}

function createOverlapChunk(prevChunk, _index) {
  // Take the last portion of text for overlap
  const overlapTarget = overlapTokens;
  const texts = [];
  let tokens = 0;

  for (let i = prevChunk.texts.length - 1; i >= 0 && tokens < overlapTarget; i--) {
    const t = prevChunk.texts[i];
    texts.unshift(t);
    tokens += estimateTokens(t);
  }

  return {
    texts,
    pages: new Set(prevChunk.pages),
    heading: prevChunk.heading,
    tokens,
  };
}
