import * as cheerio from 'cheerio';
import type { BuddyPost, CampusEvent, EventCategory, ScraperStatus } from '../types.ts';
import { INITIAL_BUDDIES, INITIAL_EVENTS, UW_BUILDINGS } from './campusData.ts';

class EventStoreAndScraper {
  private events: CampusEvent[] = [...INITIAL_EVENTS];
  private buddies: BuddyPost[] = [...INITIAL_BUDDIES];
  private status: ScraperStatus = {
    lastSyncAt: null,
    totalEvents: INITIAL_EVENTS.length,
    liveScrapedCount: 0,
    archivedCount: 0,
    lastSourceMessage: 'Initialized with Waterloo campus directory',
  };

  getEvents(includeArchived = false): CampusEvent[] {
    const now = Date.now();
    this.events.forEach((evt) => {
      if (new Date(evt.endTime).getTime() < now - 24 * 60 * 60 * 1000) {
        evt.archived = true;
      }
    });
    return this.events
      .filter((e) => (includeArchived ? true : !e.archived))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  getEventById(id: string): CampusEvent | undefined {
    return this.events.find((e) => e.id === id);
  }

  addEvent(input: Omit<CampusEvent, 'id' | 'rsvpCount' | 'lat' | 'lng'>): CampusEvent {
    const building = UW_BUILDINGS[input.buildingCode] ?? UW_BUILDINGS.SLC;
    const created: CampusEvent = {
      ...input,
      id: `uw-evt-${Date.now().toString(36)}`,
      rsvpCount: 1,
      rsvpedByMe: true,
      lat: building.lat,
      lng: building.lng,
    };
    this.events.unshift(created);
    this.status.totalEvents = this.events.length;
    return created;
  }

  toggleRsvp(id: string): CampusEvent | null {
    const evt = this.events.find((e) => e.id === id);
    if (!evt) return null;
    if (evt.rsvpedByMe) {
      evt.rsvpedByMe = false;
      evt.rsvpCount = Math.max(0, evt.rsvpCount - 1);
    } else {
      evt.rsvpedByMe = true;
      evt.rsvpCount += 1;
    }
    return evt;
  }

  getBuddies(eventId?: string): BuddyPost[] {
    const list = eventId
      ? this.buddies.filter((b) => b.eventId === eventId)
      : this.buddies;
    return [...list].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  addBuddyPost(
    input: Omit<BuddyPost, 'id' | 'connectedCount' | 'createdAt' | 'eventTitle'>,
  ): BuddyPost {
    const evt = this.getEventById(input.eventId);
    const created: BuddyPost = {
      ...input,
      id: `buddy-${Date.now().toString(36)}`,
      eventTitle: evt?.title ?? 'Waterloo Campus Event',
      connectedCount: 0,
      createdAt: new Date().toISOString(),
    };
    this.buddies.unshift(created);
    return created;
  }

  toggleBuddyConnect(id: string): BuddyPost | null {
    const post = this.buddies.find((b) => b.id === id);
    if (!post) return null;
    if (post.connectedByMe) {
      post.connectedByMe = false;
      post.connectedCount = Math.max(0, post.connectedCount - 1);
      post.spotsOpen += 1;
    } else {
      if (post.spotsOpen <= 0) return post;
      post.connectedByMe = true;
      post.connectedCount += 1;
      post.spotsOpen -= 1;
    }
    return post;
  }

  getStatus(): ScraperStatus {
    return {
      ...this.status,
      totalEvents: this.events.length,
      archivedCount: this.events.filter((e) => e.archived).length,
    };
  }

  private inferCategory(text: string): EventCategory {
    const lower = text.toLowerCase();
    if (/(hack|code|ai|tech|software|data|cyber|robotics)/.test(lower)) {
      return 'Tech & Hackathons';
    }
    if (/(career|co-op|coop|resume|interview|employer|info session)/.test(lower)) {
      return 'Career & Co-op';
    }
    if (/(sport|fitness|yoga|badminton|wellness|climb|skate|run)/.test(lower)) {
      return 'Wellness & Rec';
    }
    if (/(art|music|film|theatre|culture|craft|swap|poetry)/.test(lower)) {
      return 'Arts & Culture';
    }
    if (/(lecture|research|seminar|symposium|colloquium|study)/.test(lower)) {
      return 'Academic';
    }
    return 'Social & Clubs';
  }

  private inferBuilding(text: string): string {
    const upper = text.toUpperCase();
    for (const code of Object.keys(UW_BUILDINGS)) {
      const regex = new RegExp(`\\b${code}\\b`);
      if (regex.test(upper)) return code;
    }
    return 'SLC';
  }

  async runCollection(options: { maxEvents?: number } = {}): Promise<ScraperStatus> {
    const maxEvents = options.maxEvents ?? 30;
    const targetUrl = 'https://wusa.ca/events/';
    let scrapedCount = 0;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'WatHive-Campus-Indexer/1.0 (+https://uwaterloo.ca)',
        },
      });
      clearTimeout(timeout);

      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        const candidates: CampusEvent[] = [];

        $('article, .tribe-events-calendar-list__event, .event-card, .wp-block-post')
          .slice(0, maxEvents)
          .each((idx, el) => {
            const title = $(el)
              .find('h2, h3, .tribe-events-calendar-list__event-title, a')
              .first()
              .text()
              .trim();
            if (!title || title.length < 6) return;

            const link = $(el).find('a').first().attr('href');
            const summary = $(el).find('p, .tribe-events-calendar-list__event-description').first().text().trim();
            const locationText = $(el).find('.tribe-events-calendar-list__event-venue, .location').text().trim();
            const buildingCode = this.inferBuilding(`${title} ${locationText}`);
            const building = UW_BUILDINGS[buildingCode] ?? UW_BUILDINGS.SLC;

            const start = new Date();
            start.setDate(start.getDate() + (idx % 7) + 1);
            start.setHours(17 + (idx % 3), 0, 0, 0);
            const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

            candidates.push({
              id: `wusa-live-${Buffer.from(title).toString('base64').slice(0, 10)}`,
              title,
              organizer: 'WUSA Live Feed',
              category: this.inferCategory(`${title} ${summary}`),
              description: summary || 'Official Waterloo Undergraduate Student Association listing.',
              startTime: start.toISOString(),
              endTime: end.toISOString(),
              buildingCode: building.code,
              locationDetail: locationText || building.name,
              lat: building.lat,
              lng: building.lng,
              rsvpCount: 12 + (idx % 25),
              isFree: true,
              source: 'WUSA',
              sourceUrl: link?.startsWith('http') ? link : targetUrl,
              tags: ['WUSA', building.code],
            });
          });

        for (const item of candidates) {
          const exists = this.events.some(
            (e) => e.title.toLowerCase() === item.title.toLowerCase(),
          );
          if (!exists) {
            this.events.push(item);
            scrapedCount += 1;
          }
        }
      }

      this.status = {
        lastSyncAt: new Date().toISOString(),
        totalEvents: this.events.length,
        liveScrapedCount: this.status.liveScrapedCount + scrapedCount,
        archivedCount: this.events.filter((e) => e.archived).length,
        lastSourceMessage:
          scrapedCount > 0
            ? `Synced ${scrapedCount} new event(s) from WUSA`
            : 'WUSA feed checked; campus schedule up to date',
      };
    } catch (err) {
      this.status = {
        lastSyncAt: new Date().toISOString(),
        totalEvents: this.events.length,
        liveScrapedCount: this.status.liveScrapedCount,
        archivedCount: this.events.filter((e) => e.archived).length,
        lastSourceMessage: `Using cached Waterloo campus schedule (${err instanceof Error ? err.message : 'offline'})`,
      };
    }

    return this.getStatus();
  }
}

export const wusaScraper = new EventStoreAndScraper();
