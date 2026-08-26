import { Hono } from 'hono';
import { AgentEscrow } from '../core/escrow.js';
import { ActionState } from '../models/types.js';

const app = new Hono();

app.use('*', async (c, next) => {
  const token = c.req.header('Authorization');
  if (token !== 'Bearer TITAN_SECURE_TOKEN_2026') {
    return c.json({ error: 'Unauthorized.' }, 401);
  }
  await next();
});

app.post('/api/v1/escrow/submit', async (c) => {
  try {
    const rawRequest = await c.req.json();
    const result = AgentEscrow.submitAction(rawRequest);
    
    if (result.state === ActionState.PENDING_REVIEW) {
      return c.json({ message: 'Awaiting HITL override.', hashId: result.hashId, state: result.state }, 202);
    }
    return c.json(result, 200);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

export default app;
