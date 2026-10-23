import { createApp } from './app.js';
import { loadConfig } from './config.js';
const { app, store } = await createApp(loadConfig(), { logger: true });
await store.recover();
await app.listen({ host: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 3000) });
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { void app.close(); });
