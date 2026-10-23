import { createPool, migrate, seedKnowledge } from './db.js';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = createPool(process.env.DATABASE_URL);
try { await migrate(pool); await seedKnowledge(pool); console.log('Database migration and corpus seed complete.'); } finally { await pool.end(); }
