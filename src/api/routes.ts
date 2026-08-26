import { Hono } from 'hono';
import { AgentAuthority } from '../sdk/index.js';
import { EscrowDB } from '../storage/db.js';

const authority = new AgentAuthority({ mode: 'production' });
const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok', uptime: process.uptime() }));
app.get('/ready', (c) => c.json({ status: 'ready' }));

app.use('/v1/*', async (c, next) => {
  const token = c.req.header('Authorization');
  if (token !== 'Bearer TITAN_SECURE_TOKEN_2026') {
    return c.json({ error: 'Unauthorized: Invalid credentials' }, 401);
  }
  await next();
});

app.post('/v1/actions/authorize', async (c) => {
  try {
    const body = await c.req.json();
    const result = await authority.authorize(body);
    return c.json(result, 202);
  } catch (e: any) {
    // Fail closed: No stack traces leaked in production responses
    return c.json({ error: e.message || 'Validation failed' }, 400);
  }
});

app.post('/v1/actions/:actionId/approve', async (c) => {
  try {
    const actionId = c.req.param('actionId');
    const capability = await authority.approve(actionId, 'admin-reviewer-1');
    return c.json({ capability }, 200);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.post('/v1/actions/execute', async (c) => {
  try {
    const { capability, payload } = await c.req.json();
    const result = await authority.execute(capability, payload);
    return c.json(result, 200);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

app.get('/v1/audit', (c) => {
  try {
    const logs = EscrowDB.getLastAuditEvent.all();
    return c.json({ audit_logs: logs }, 200);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

export default app;
