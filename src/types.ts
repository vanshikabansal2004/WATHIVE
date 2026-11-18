export type EventCategory =
  | 'Tech & Hackathons'
  | 'Social & Clubs'
  | 'Career & Co-op'
  | 'Wellness & Rec'
  | 'Arts & Culture'
  | 'Academic';

export interface CampusBuilding {
  code: string;
  name: string;
  lat: number;
  lng: number;
  zone: 'Main Campus' | 'Engineering' | 'South Campus' | 'North Campus';
}

export interface CampusEvent {
  id: string;
  title: string;
  organizer: string;
  category: EventCategory;
  description: string;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  buildingCode: string;
  locationDetail: string;
  lat: number;
  lng: number;
  rsvpCount: number;
  capacity?: number;
  isFree: boolean;
  source: 'WUSA' | 'UW Events' | 'Student Initiative';
  sourceUrl?: string;
  tags: string[];
  archived?: boolean;
  rsvpedByMe?: boolean;
}

export interface BuddyPost {
  id: string;
  eventId: string;
  eventTitle: string;
  studentName: string;
  faculty: string;
  year: string;
  note: string;
  meetupSpot: string;
  spotsOpen: number;
  connectedCount: number;
  connectedByMe?: boolean;
  createdAt: string;
}

export interface ScraperStatus {
  lastSyncAt: string | null;
  totalEvents: number;
  liveScrapedCount: number;
  archivedCount: number;
  lastSourceMessage: string;
}
