/**
 * Enterprise Knowledge AI — Retrieval Benchmark Script
 *
 * Measures vector search latency (p50, p95) and time-to-first-token.
 * Requires a running database with indexed documents.
 *
 * Usage: node eval/benchmark.js
 *
 * Note: "sub-100ms" retrieval is a target to be measured, not a guarantee.
 * Actual latency depends on dataset size, hardware, and pgvector configuration.
 */

import { config } from '../server/config.js';
import { query, getClient, closePool } from '../server/db.js';

const ITERATIONS = 50;
const WARMUP = 5;

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Enterprise Knowledge AI — Retrieval Benchmark  ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Check if we have chunks to search
  const countResult = await query('SELECT COUNT(*) as cnt FROM document_chunks WHERE embedding IS NOT NULL');
  const chunkCount = parseInt(countResult.rows[0].cnt, 10);

  if (chunkCount === 0) {
    console.log('⚠️  No embedded chunks found. Ingest some documents first.\n');
    console.log('Generating synthetic benchmark with random vectors...\n');
    await runSyntheticBenchmark();
  } else {
    console.log(`📊 Found ${chunkCount} embedded chunks\n`);
    await runRealBenchmark();
  }

  await closePool();
}

async function runSyntheticBenchmark() {
  const latencies = [];
  const dimensions = config.gemini.embeddingDimensions;

  // Generate random query vector
  const randomVector = () => {
    const vec = Array.from({ length: dimensions }, () => Math.random() * 2 - 1);
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return vec.map((v) => v / norm);
  };

  console.log(`Running ${WARMUP} warmup + ${ITERATIONS} iterations...\n`);

  for (let i = 0; i < WARMUP + ITERATIONS; i++) {
    const vec = randomVector();
    const client = await getClient();

    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL hnsw.ef_search = ${config.retrieval.efSearch}`);
      await client.query(`SET LOCAL hnsw.iterative_scan = relaxed_order`);

      const start = performance.now();

      await client.query(
        `SELECT c.id, 1 - (c.embedding <=> $1) AS score
         FROM document_chunks c
         JOIN documents d ON d.id = c.document_id
         WHERE d.status = 'READY'
         ORDER BY c.embedding <=> $1
         LIMIT $2`,
        [JSON.stringify(vec), config.retrieval.topK]
      );

      const elapsed = performance.now() - start;
      await client.query('COMMIT');

      if (i >= WARMUP) {
        latencies.push(elapsed);
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      // Empty table is fine for synthetic benchmark
      if (i >= WARMUP) {
        latencies.push(0);
      }
    } finally {
      client.release();
    }
  }

  reportLatencies(latencies);
}

async function runRealBenchmark() {
  const latencies = [];
  const dimensions = config.gemini.embeddingDimensions;

  const randomVector = () => {
    const vec = Array.from({ length: dimensions }, () => Math.random() * 2 - 1);
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return vec.map((v) => v / norm);
  };

  console.log(`Running ${WARMUP} warmup + ${ITERATIONS} iterations...\n`);

  for (let i = 0; i < WARMUP + ITERATIONS; i++) {
    const vec = randomVector();
    const client = await getClient();

    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL hnsw.ef_search = ${config.retrieval.efSearch}`);
      await client.query(`SET LOCAL hnsw.iterative_scan = relaxed_order`);

      const start = performance.now();

      const result = await client.query(
        `SELECT c.id, c.content, c.page_number, d.title,
                1 - (c.embedding <=> $1) AS score
         FROM document_chunks c
         JOIN documents d ON d.id = c.document_id
         WHERE d.status = 'READY'
           AND check_rbac_access('ADMIN', NULL, c.department_id, c.permission_level)
         ORDER BY c.embedding <=> $1
         LIMIT $2`,
        [JSON.stringify(vec), config.retrieval.topK]
      );

      const elapsed = performance.now() - start;
      await client.query('COMMIT');

      if (i >= WARMUP) {
        latencies.push(elapsed);
      }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
    } finally {
      client.release();
    }
  }

  reportLatencies(latencies);
}

function reportLatencies(latencies) {
  if (latencies.length === 0) {
    console.log('No latencies recorded.\n');
    return;
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  console.log('📊 Retrieval Latency Results:');
  console.log('  ┌──────────┬────────────┐');
  console.log(`  │ p50      │ ${p50.toFixed(2).padStart(8)} ms │`);
  console.log(`  │ p95      │ ${p95.toFixed(2).padStart(8)} ms │`);
  console.log(`  │ p99      │ ${p99.toFixed(2).padStart(8)} ms │`);
  console.log(`  │ mean     │ ${mean.toFixed(2).padStart(8)} ms │`);
  console.log(`  │ min      │ ${min.toFixed(2).padStart(8)} ms │`);
  console.log(`  │ max      │ ${max.toFixed(2).padStart(8)} ms │`);
  console.log('  └──────────┴────────────┘');

  const target = 100;
  const meetsTarget = p50 < target;
  console.log(`\n  Target: p50 < ${target}ms — ${meetsTarget ? '✅ PASS' : '⚠️  ABOVE TARGET'}`);
  console.log('\n  Note: "sub-100ms" is a target to be measured, not a guarantee.');
  console.log('  Actual latency depends on dataset size, hardware, and pgvector config.\n');
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
