import { query, getClient } from '../db.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { embedQuery } from './gemini.js';

/**
 * Perform RBAC-filtered vector similarity search.
 *
 * Uses the HNSW index with iterative_scan for filtered queries.
 * ORDER BY uses the raw distance operator so the index is used.
 *
 * @param {string} queryText - The user's query text.
 * @param {object} user - { role, departmentId }
 * @param {object} options - { topK, minSimilarity }
 * @returns {Promise<Array<{ id, content, pageNumber, title, score, documentId, chunkMetadata }>>}
 */
export async function searchChunks(queryText, user, options = {}) {
  const topK = options.topK || config.retrieval.topK;
  const minSimilarity = options.minSimilarity || config.retrieval.minSimilarity;
  const efSearch = options.efSearch || config.retrieval.efSearch;

  const startTime = Date.now();

  // Embed the query
  const queryEmbedding = await embedQuery(queryText);

  // Use a dedicated client for SET LOCAL commands (transaction-scoped)
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Set HNSW search parameters
    await client.query(`SET LOCAL hnsw.ef_search = ${efSearch}`);
    await client.query(`SET LOCAL hnsw.iterative_scan = relaxed_order`);

    // Run the RBAC-filtered vector search
    // ORDER BY uses the raw distance operator (<=>)  so the HNSW index is utilized
    const result = await client.query(
      `SELECT
         c.id,
         c.content,
         c.page_number,
         c.chunk_index,
         c.metadata,
         c.document_id,
         d.title,
         d.original_filename,
         1 - (c.embedding <=> $1) AS score
       FROM document_chunks c
       JOIN documents d ON d.id = c.document_id
       WHERE d.status = 'READY'
         AND check_rbac_access($2, $3, c.department_id, c.permission_level)
       ORDER BY c.embedding <=> $1
       LIMIT $4`,
      [JSON.stringify(queryEmbedding), user.role, user.departmentId, topK]
    );

    await client.query('COMMIT');

    const duration = Date.now() - startTime;
    logger.info(
      { queryLength: queryText.length, resultCount: result.rows.length, duration },
      'Vector search completed'
    );

    // Filter by minimum similarity threshold
    const chunks = result.rows
      .filter((row) => row.score >= minSimilarity)
      .map((row) => ({
        id: row.id,
        content: row.content,
        pageNumber: row.page_number,
        chunkIndex: row.chunk_index,
        title: row.title,
        originalFilename: row.original_filename,
        score: row.score,
        documentId: row.document_id,
        chunkMetadata: row.metadata,
      }));

    return { chunks, latencyMs: duration, queryEmbedding };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
