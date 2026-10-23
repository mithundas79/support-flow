import pg, { type PoolClient } from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { knowledgeDocumentSchema } from '@support-flow/core';
import { z } from 'zod';
export const createPool = (connectionString: string) => new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
export type Pool = ReturnType<typeof createPool>;
export async function tx<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const result = await action(c); await c.query('COMMIT'); return result; }
  catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
export async function migrate(pool: Pool): Promise<void> {
  const sql = await readFile(fileURLToPath(new URL('../migrations/001_initial.sql', import.meta.url)), 'utf8');
  await tx(pool, async c => { await c.query('SELECT pg_advisory_xact_lock(78632145)'); await c.query(sql); });
}
export async function seedKnowledge(pool: Pool): Promise<void> {
  const path = process.env.KNOWLEDGE_PATH ?? fileURLToPath(new URL('../../../fixtures/knowledge-base/articles.json', import.meta.url));
  let raw: unknown;
  try { raw = JSON.parse(await readFile(path, 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw e; }
  const docs = z.array(knowledgeDocumentSchema).max(1000).parse(raw);
  await tx(pool, async c => { for (const doc of docs) await c.query('INSERT INTO knowledge_documents(id,title,content,url) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING', [doc.id, doc.title, doc.content, doc.url ?? null]); });
}
