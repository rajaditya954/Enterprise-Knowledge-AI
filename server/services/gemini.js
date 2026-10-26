import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

/**
 * Embed texts using Gemini embedding model with retry logic.
 *
 * @param {string[]} texts - Array of texts to embed.
 * @param {'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'} taskType
 * @returns {Promise<number[][]>} Array of embedding vectors.
 */
export async function embedTexts(texts, taskType = 'RETRIEVAL_DOCUMENT') {
  const batchSize = 100; // Gemini batch limit
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embeddings = await embedBatchWithRetry(batch, taskType);
    allEmbeddings.push(...embeddings);
  }

  return allEmbeddings;
}

/**
 * Embed a single query text.
 */
export async function embedQuery(text) {
  const results = await embedTexts([text], 'RETRIEVAL_QUERY');
  return results[0];
}

/**
 * Embed a batch with exponential backoff and jitter.
 */
async function embedBatchWithRetry(texts, taskType, maxRetries = 5) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.embedContent({
        model: config.gemini.embeddingModel,
        contents: texts.map((text) => ({ parts: [{ text }] })),
        config: {
          taskType,
          outputDimensionality: config.gemini.embeddingDimensions,
        },
      });

      const embeddings = response.embeddings.map((e) => {
        const vector = e.values;
        if (vector.length !== config.gemini.embeddingDimensions) {
          throw new Error(
            `Expected ${config.gemini.embeddingDimensions} dimensions, got ${vector.length}`
          );
        }
        return l2Normalize(vector);
      });

      return embeddings;
    } catch (err) {
      const isRateLimit = err.status === 429 || err.message?.includes('RESOURCE_EXHAUSTED');
      const isRetryable = isRateLimit || err.status >= 500;

      if (!isRetryable || attempt === maxRetries) {
        logger.error({ err, attempt, batchSize: texts.length }, 'Embedding failed');
        throw err;
      }

      const baseDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
      const jitter = Math.random() * baseDelay * 0.5;
      const delay = baseDelay + jitter;

      logger.warn(
        { attempt, delay: Math.round(delay), error: err.message },
        'Embedding retry'
      );
      await sleep(delay);
    }
  }
}

/**
 * Generate a streaming response from a Gemini model.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} options
 * @returns {AsyncIterable<string>}
 */
export async function* generateStream(systemPrompt, userPrompt, options = {}) {
  const modelId = options.useProModel ? config.gemini.proModel : config.gemini.flashModel;

  const response = await ai.models.generateContentStream({
    model: modelId,
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: systemPrompt,
      temperature: options.temperature ?? 0.2,
      topP: options.topP ?? 0.8,
      maxOutputTokens: options.maxTokens ?? 4096,
    },
  });

  for await (const chunk of response) {
    const text = chunk.text;
    if (text) {
      yield text;
    }
  }
}

/**
 * Generate a non-streaming response (for rewriting, follow-ups, etc.).
 */
export async function generateText(systemPrompt, userPrompt, options = {}) {
  const modelId = options.useProModel ? config.gemini.proModel : config.gemini.flashModel;

  const response = await ai.models.generateContent({
    model: modelId,
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    config: {
      systemInstruction: systemPrompt,
      temperature: options.temperature ?? 0.3,
      maxOutputTokens: options.maxTokens ?? 1024,
    },
  });

  return response.text;
}

/**
 * L2-normalize a vector.
 */
function l2Normalize(vector) {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vector;
  return vector.map((v) => v / norm);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
