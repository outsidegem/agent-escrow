import { Hono } from 'hono';
import { AgentEscrow } from '../core/escrow';
import { ActionState } from '../models/types';

const app = new Hono();

// Basic Authorization Middleware (Hostile until proven safe)
app.use('*', async (c, next) => {
  const token = c.req.header('Authorization');
  if (token !== 'Bearer TITAN_SECURE_TOKEN_2026') {
    return c.json({ error: 'Unauthorized. Agent identity not verified.' }, 401);
  }
  await next();
});

app.post('/api/v1/escrow/submit', async (c) => {
  try {
    const rawRequest = await c.req.json();
    const result = AgentEscrow.submitAction(rawRequest);
    
    if (result.state === ActionState.PENDING_REVIEW) {
      return c.json({ 
        message: 'Action staged. Awaiting 1-bit human-in-the-loop override.', 
        hashId: result.hashId,
        state: result.state 
      }, 202);
    }
    
    return c.json(result, 200);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

app.get('/api/v1/escrow/status/:hashId', (c) => {
  // In a full implementation, this queries the EscrowDB for the current state
  return c.json({ message: "Status endpoint placeholder" });
});

export default app;
