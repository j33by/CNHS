import http from 'node:http';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import { config, assertConfig } from './config.js';
import { getPool } from './db.js';
import { authRouter, notifRouter } from './auth.js';
import { attachRealtime, onlineCount } from './realtime.js';
import { ensureBucket, localDir } from './storage.js';
import { admin } from './routes/admin1.js';
import './routes/admin2.js';
import { teacher } from './routes/teacher.js';
import { student } from './routes/student.js';
import { site, publicApi } from './routes/public.js';

assertConfig();
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
const imgHost = config.supabaseUrl || '';
app.use(helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:', imgHost].filter(Boolean), styleSrc: ["'self'"], scriptSrc: ["'self'"], fontSrc: ["'self'"], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'self'"], upgradeInsecureRequests: null } },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression());
app.use('/api', cors({ origin: true }), express.json({ limit: '1mb' }));
app.use('/assets', express.static(path.resolve('public/assets'), { maxAge: '7d' }));
app.use('/uploads/pub', express.static(localDir, { maxAge: '30d' }));

app.use('/api/v1/public', publicApi);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/notifications', notifRouter);
app.use('/api/v1/admin', admin);
app.use('/api/v1/teacher', teacher);
app.use('/api/v1/student', student);
app.get('/healthz', (req, res) => res.json({ ok: true, online: onlineCount() }));
app.use(site);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((req, res) => res.status(404).type('text').send('Not found'));
app.use((err, req, res, next) => {
  if (err.status) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request.' });
  console.error(err);
  res.status(500).json({ error: 'The system could not complete this request. Please try again later.' });
});

const server = http.createServer(app);
attachRealtime(server);
server.listen(config.port, () => { console.log('CNHS backend on :' + config.port); ensureBucket(); });
process.on('SIGTERM', () => { server.close(); getPool().end().catch(() => {}); });
