import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { apiRouter } from './src/backend/apiRoutes.ts';
import { wusaScraper } from './src/backend/wusaScraper.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  // Middlewares
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // CORS support for desktop applications
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Mount API endpoints
  app.use('/api', apiRouter);

  // In development, mount Vite dev server as middleware
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve built frontend assets from dist/
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`UW Events Backend Service running on port ${PORT}`);
    console.log(`REST API: http://localhost:${PORT}/api/events`);
    console.log(`Health:   http://localhost:${PORT}/api/health`);
    console.log(`Docs:     http://localhost:${PORT}/api/docs`);
    console.log(`Mode:     ${isProduction ? 'Production' : 'Development'}`);
    console.log(`====================================================`);

    // Non-blocking initial sync if network is available
    setTimeout(() => {
      wusaScraper.runCollection({ maxEvents: 30 }).catch((e) => {
        console.log('[BackgroundSync] Initial live WUSA sync check finished:', e.message);
      });
    }, 3000);

    // Periodic sync every 2 hours: archives old events, publishes new releases
    setInterval(() => {
      wusaScraper.runCollection().catch((e) => {
        console.log('[BackgroundSync] Scheduled sync deferred:', e.message);
      });
    }, 2 * 60 * 60 * 1000);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
