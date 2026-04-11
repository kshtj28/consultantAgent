import { Router, Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { fetchInsights, computeInsights } from '../services/insightsService';
import { addInsightsSSEClient } from '../services/reportSseService';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const sessionId = req.query.sessionId as string | undefined;
    const insights = await fetchInsights(sessionId);
    return res.json({ insights });
  } catch (err: any) {
    console.error('Fetch insights error:', err);
    return res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

router.post('/compute', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    const insights = await computeInsights(sessionId || 'global');
    return res.json({ insights });
  } catch (err: any) {
    console.error('Compute insights error:', err);
    return res.status(500).json({ error: 'Failed to compute insights' });
  }
});

router.get('/stream', (req: Request, res: Response) => {
  const user = (req as AuthRequest).user;
  if (!user) return res.sendStatus(401);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  res.write('data: {"type":"connected"}\n\n');
  addInsightsSSEClient(res);

  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => clearInterval(keepAlive));
});

export default router;
