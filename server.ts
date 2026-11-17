import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './server/db.js';
import { collector } from './server/wusaCollector.js';
import { scheduler } from './server/scheduler.js';
import { exportToJson, exportToCsv } from './server/export.js';
import { mapToWatHiveEventItem } from './server/previewMapper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const resolvedPort = (() => {
  const defaultPort = parseInt(process.env.DEFAULT_APP_PORT || '3000', 10);
  if (process.env.NODE_ENV !== 'production') {
    return defaultPort;
  }
  if (process.env.PORT && process.env.PORT !== process.env.NGINX_PORT) {
    return parseInt(process.env.PORT, 10);
  }
  return defaultPort;
})();
const PORT = Number.isFinite(resolvedPort) ? resolvedPort : 3000;
const ADMIN_PASSWORD = process.env.WUSA_ADMIN_SECRET || 'wathive_admin_2026';

app.use(express.json({ limit: '10mb' }));

// --- COLLECTOR API ROUTES ---

// 1. Auth check
app.post('/api/collector/auth', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, error: 'Password required' });
  }
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true, token: 'wusa_session_' + Date.now() });
  }
  return res.status(401).json({ success: false, error: 'Invalid admin credentials' });
});

// 2. Status & stats
app.get('/api/collector/status', (req, res) => {
  try {
    const status = scheduler.getStatus();
    const stats = db.getStats();
    res.json({
      success: true,
      ...status,
      stats
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/collector/stats', (req, res) => {
  try {
    const stats = db.getStats();
    res.json({ success: true, stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Trigger manual sync (with mutex guard)
app.post('/api/collector/sync', async (req, res) => {
  if (collector.isBusy()) {
    return res.status(409).json({
      success: false,
      error: 'A collection sync run is currently in progress. Please wait for it to complete.'
    });
  }

  try {
    // Run sync and wait for results so user sees immediate results
    const run = await collector.executeSync('manual');
    res.json({ success: true, run });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Events listing & filter
app.get('/api/collector/events', (req, res) => {
  try {
    const {
      search,
      status,
      temporal_status,
      category,
      review_status,
      approval_status,
      page,
      limit
    } = req.query;

    const result = db.getEvents({
      search: search as string,
      status: status as string,
      temporal_status: temporal_status as string,
      category: category as string,
      review_status: review_status as string,
      approval_status: approval_status as string,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 50
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Single event & change history
app.get('/api/collector/events/:id', (req, res) => {
  try {
    const event = db.getStoredEvent(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }
    const history = db.getEventHistory(req.params.id);
    res.json({ success: true, event, history });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Manual edit and approval
app.put('/api/collector/events/:id', (req, res) => {
  try {
    const { updates } = req.body;
    if (!updates) {
      return res.status(400).json({ success: false, error: 'No updates provided' });
    }

    const success = db.updateEventManual(req.params.id, updates);
    if (!success) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const updated = db.getStoredEvent(req.params.id);
    const history = db.getEventHistory(req.params.id);
    res.json({ success: true, event: updated, history });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Recurring series
app.get('/api/collector/series', (req, res) => {
  try {
    const series = db.getRecurringSeries();
    res.json({ success: true, series });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Sync runs & logs
app.get('/api/collector/runs', (req, res) => {
  try {
    const runs = db.getSyncRuns(50);
    res.json({ success: true, runs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Config management
app.get('/api/collector/config', (req, res) => {
  try {
    const config = db.getConfig();
    res.json({ success: true, config });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/collector/config', (req, res) => {
  try {
    const { config } = req.body;
    if (!config) {
      return res.status(400).json({ success: false, error: 'Config required' });
    }
    db.saveConfig(config);
    scheduler.updateSchedule();
    res.json({ success: true, config: db.getConfig() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Data exports (JSON & CSV)
app.get('/api/collector/export/json', (req, res) => {
  try {
    const events = db.getAllEventsRaw();
    const jsonStr = exportToJson(events);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="wusa_events_collected.json"');
    res.send(jsonStr);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/collector/export/csv', (req, res) => {
  try {
    const events = db.getAllEventsRaw();
    const csvStr = exportToCsv(events);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="wusa_events_collected.csv"');
    res.send(csvStr);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. WatHive preview mapping
app.get('/api/collector/preview', (req, res) => {
  try {
    const events = db.getAllEventsRaw();
    const previewList = events.slice(0, 50).map(mapToWatHiveEventItem);
    res.json({
      success: true,
      totalAvailable: events.length,
      sampleSize: previewList.length,
      previewEvents: previewList,
      targetSchema: {
        entity: 'EventItem',
        mappedFields: [
          'id -> wusa_{source_id}',
          'title -> title (clean decoded)',
          'category -> mapped to WatHive EventCategory',
          'organizer -> organizer.name',
          'organizerType -> mapped to WUSA / Clubs / Societies',
          'date -> YYYY-MM-DD',
          'startTime -> HH:mm (24h)',
          'endTime -> HH:mm (24h)',
          'location -> venue.name + room',
          'price -> cost raw preserved',
          'registrationUrl -> extracted tickets/rsvp url',
          'utcIsoString -> start_iso with Toronto DST offset',
          'sourceVerification -> "wusa_official"'
        ]
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- VITE MIDDLEWARE / STATIC ASSETS ---

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';
  const http = await import('node:http');
  const httpServer = http.createServer(app);

  let viteServer: { close: () => Promise<void> } | null = null;

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      appType: 'spa',
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer }
      }
    });
    viteServer = vite;
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`WatHive WUSA Event Collector Backend running on port ${PORT}`);
    console.log(`Admin Dashboard URL: http://localhost:${PORT}/?view=wusa-collector`);
    console.log(`Daily Schedule: 6:00 AM America/Toronto`);
    console.log(`=======================================================`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[Server] Received ${signal}, shutting down gracefully...`);
    httpServer.close(() => {
      process.exit(0);
    });
    if (viteServer) {
      await viteServer.close().catch(() => {});
    }
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
