import { Router } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { UW_BUILDINGS } from './campusData.ts';
import { wusaScraper } from './wusaScraper.ts';
import type { EventCategory } from '../types.ts';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'WatHive Campus Events & Buddy API',
    timestamp: new Date().toISOString(),
    ...wusaScraper.getStatus(),
  });
});

apiRouter.get('/docs', (_req, res) => {
  res.json({
    name: 'WatHive REST API',
    version: '1.0.0',
    endpoints: [
      { method: 'GET', path: '/api/health', description: 'Service health and WUSA sync status' },
      { method: 'GET', path: '/api/buildings', description: 'Waterloo campus buildings and coordinates' },
      { method: 'GET', path: '/api/events', description: 'List and filter campus events' },
      { method: 'POST', path: '/api/events', description: 'Submit a new student initiative or event' },
      { method: 'POST', path: '/api/events/:id/rsvp', description: 'Toggle RSVP for a campus event' },
      { method: 'GET', path: '/api/buddies', description: 'List buddy requests across campus events' },
      { method: 'POST', path: '/api/buddies', description: 'Post a new buddy request for an event' },
      { method: 'POST', path: '/api/buddies/:id/connect', description: 'Connect or join an event buddy group' },
      { method: 'POST', path: '/api/sync', description: 'Trigger live WUSA event collection' },
      { method: 'POST', path: '/api/ai/recommend', description: 'Server-side Gemini event & buddy recommendation' },
    ],
  });
});

apiRouter.get('/buildings', (_req, res) => {
  res.json({ buildings: Object.values(UW_BUILDINGS) });
});

apiRouter.get('/events', (req, res) => {
  const { category, search, building, includeArchived } = req.query;
  let events = wusaScraper.getEvents(includeArchived === 'true');

  if (typeof category === 'string' && category !== 'All') {
    events = events.filter((e) => e.category === category);
  }
  if (typeof building === 'string' && building !== 'All') {
    events = events.filter((e) => e.buildingCode === building);
  }
  if (typeof search === 'string' && search.trim()) {
    const q = search.trim().toLowerCase();
    events = events.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.organizer.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.buildingCode.toLowerCase().includes(q) ||
        e.locationDetail.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  res.json({
    events,
    status: wusaScraper.getStatus(),
  });
});

apiRouter.post('/events', (req, res) => {
  const {
    title,
    organizer,
    category,
    description,
    startTime,
    endTime,
    buildingCode,
    locationDetail,
    isFree,
    tags,
  } = req.body ?? {};

  if (!title || !organizer || !startTime || !buildingCode) {
    res.status(400).json({ error: 'Title, organizer, startTime, and buildingCode are required.' });
    return;
  }

  const parsedStart = new Date(startTime);
  if (Number.isNaN(parsedStart.getTime())) {
    res.status(400).json({ error: 'Invalid startTime date format.' });
    return;
  }

  const parsedEnd = endTime
    ? new Date(endTime)
    : new Date(parsedStart.getTime() + 90 * 60 * 1000);

  const created = wusaScraper.addEvent({
    title: String(title).trim(),
    organizer: String(organizer).trim(),
    category: (category as EventCategory) || 'Social & Clubs',
    description: String(description || 'Student-led campus initiative at University of Waterloo.').trim(),
    startTime: parsedStart.toISOString(),
    endTime: Number.isNaN(parsedEnd.getTime())
      ? new Date(parsedStart.getTime() + 90 * 60 * 1000).toISOString()
      : parsedEnd.toISOString(),
    buildingCode: String(buildingCode).trim().toUpperCase(),
    locationDetail: String(locationDetail || buildingCode).trim(),
    isFree: isFree !== false,
    source: 'Student Initiative',
    tags: Array.isArray(tags)
      ? tags.map((t) => String(t).trim()).filter(Boolean)
      : ['Student Initiative'],
  });

  res.status(201).json({ event: created });
});

apiRouter.post('/events/:id/rsvp', (req, res) => {
  const updated = wusaScraper.toggleRsvp(req.params.id);
  if (!updated) {
    res.status(404).json({ error: 'Event not found.' });
    return;
  }
  res.json({ event: updated });
});

apiRouter.get('/buddies', (req, res) => {
  const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : undefined;
  res.json({ buddies: wusaScraper.getBuddies(eventId) });
});

apiRouter.post('/buddies', (req, res) => {
  const { eventId, studentName, faculty, year, note, meetupSpot, spotsOpen } = req.body ?? {};
  if (!eventId || !studentName || !note) {
    res.status(400).json({ error: 'eventId, studentName, and note are required.' });
    return;
  }

  const created = wusaScraper.addBuddyPost({
    eventId: String(eventId),
    studentName: String(studentName).trim(),
    faculty: String(faculty || 'Mathematics').trim(),
    year: String(year || '2A').trim(),
    note: String(note).trim(),
    meetupSpot: String(meetupSpot || 'SLC Turnkey Desk').trim(),
    spotsOpen: Math.max(1, Math.min(8, Number(spotsOpen) || 2)),
  });

  res.status(201).json({ buddy: created });
});

apiRouter.post('/buddies/:id/connect', (req, res) => {
  const updated = wusaScraper.toggleBuddyConnect(req.params.id);
  if (!updated) {
    res.status(404).json({ error: 'Buddy post not found.' });
    return;
  }
  res.json({ buddy: updated });
});

apiRouter.post('/sync', async (_req, res) => {
  const status = await wusaScraper.runCollection({ maxEvents: 30 });
  res.json({
    events: wusaScraper.getEvents(),
    status,
  });
});

apiRouter.post('/ai/recommend', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: 'Gemini API key is not configured on the server. Set GEMINI_API_KEY in Settings > Secrets.',
    });
    return;
  }

  const { faculty, interests, vibe } = req.body ?? {};
  const events = wusaScraper.getEvents();
  const buddies = wusaScraper.getBuddies();

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const promptPayload = {
      studentProfile: {
        faculty: String(faculty || 'Any'),
        interests: String(interests || 'meeting people and exploring campus'),
        vibe: String(vibe || 'casual'),
      },
      upcomingEvents: events.map((e) => ({
        id: e.id,
        title: e.title,
        category: e.category,
        buildingCode: e.buildingCode,
        startTime: e.startTime,
        tags: e.tags,
      })),
      activeBuddyPosts: buddies.map((b) => ({
        id: b.id,
        eventId: b.eventId,
        studentName: b.studentName,
        faculty: b.faculty,
        year: b.year,
        note: b.note,
      })),
    };

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Recommend the top 2 campus events and up to 2 buddy matches for this University of Waterloo student.\n${JSON.stringify(promptPayload)}`,
      config: {
        systemInstruction:
          'You are the WatHive campus concierge for University of Waterloo students. Match students concisely and warmly to real upcoming events and buddy posts from the provided JSON only.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            recommendedEventIds: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            recommendedBuddyIds: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['summary', 'recommendedEventIds', 'recommendedBuddyIds'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json(parsed);
  } catch (err) {
    console.error('[AI Recommend] Gemini error:', err);
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Failed to generate recommendations.',
    });
  }
});
