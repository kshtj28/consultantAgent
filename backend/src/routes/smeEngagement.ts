import { Router, Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { fetchSMEEngagement } from '../services/smeEngagementService';
import { addSMESSEClient } from '../services/reportSseService';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const entries = await fetchSMEEngagement();
    return res.json({ users: entries });
  } catch (err: any) {
    console.error('Fetch SME engagement error:', err);
    return res.status(500).json({ error: 'Failed to fetch SME engagement' });
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
  addSMESSEClient(res);

  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => clearInterval(keepAlive));
});

export default router;
