import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Calendar,
  Check,
  MapPin,
  RefreshCw,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { BuddyPanel } from './components/BuddyPanel.tsx';
import { CampusMap } from './components/CampusMap.tsx';
import { PromoteModal } from './components/PromoteModal.tsx';
import type {
  BuddyPost,
  CampusBuilding,
  CampusEvent,
  EventCategory,
  ScraperStatus,
} from './types.ts';

type ActiveTab = 'discover' | 'map' | 'buddies';

const CATEGORIES: Array<'All' | EventCategory> = [
  'All',
  'Tech & Hackathons',
  'Social & Clubs',
  'Career & Co-op',
  'Wellness & Rec',
  'Arts & Culture',
  'Academic',
];

function formatEventDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatEventTime(startIso: string, endIso: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  };
  const start = new Date(startIso).toLocaleTimeString('en-CA', opts);
  const end = new Date(endIso).toLocaleTimeString('en-CA', opts);
  return `${start} – ${end}`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('discover');
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [buildings, setBuildings] = useState<CampusBuilding[]>([]);
  const [buddies, setBuddies] = useState<BuddyPost[]>([]);
  const [syncStatus, setSyncStatus] = useState<ScraperStatus | null>(null);

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<'All' | EventCategory>('All');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [buddyFilterEventId, setBuddyFilterEventId] = useState<string | null>(null);
  const [showPromoteModal, setShowPromoteModal] = useState(false);

  // Server-side AI matcher state
  const [aiFaculty, setAiFaculty] = useState('Mathematics');
  const [aiInterests, setAiInterests] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<{
    summary: string;
    recommendedEventIds: string[];
    recommendedBuddyIds: string[];
  } | null>(null);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eventsRes, buildingsRes, buddiesRes] = await Promise.all([
        fetch('/api/events'),
        fetch('/api/buildings'),
        fetch('/api/buddies'),
      ]);

      if (!eventsRes.ok || !buildingsRes.ok || !buddiesRes.ok) {
        throw new Error('Unable to load campus schedule from the WatHive API.');
      }

      const eventsData = await eventsRes.json();
      const buildingsData = await buildingsRes.json();
      const buddiesData = await buddiesRes.json();

      setEvents(eventsData.events ?? []);
      setSyncStatus(eventsData.status ?? null);
      setBuildings(buildingsData.buildings ?? []);
      setBuddies(buddiesData.buddies ?? []);

      if (eventsData.events?.length && !selectedEventId) {
        setSelectedEventId(eventsData.events[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load WatHive.');
    } finally {
      setLoading(false);
    }
  }, [selectedEventId]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      if (selectedCategory !== 'All' && evt.category !== selectedCategory) {
        return false;
      }
      if (selectedBuilding !== 'All' && evt.buildingCode !== selectedBuilding) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = `${evt.title} ${evt.organizer} ${evt.description} ${evt.buildingCode} ${evt.locationDetail} ${evt.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, selectedCategory, selectedBuilding, searchQuery]);

  const selectedEvent = useMemo(() => {
    return (
      filteredEvents.find((e) => e.id === selectedEventId) ||
      events.find((e) => e.id === selectedEventId) ||
      filteredEvents[0] ||
      null
    );
  }, [filteredEvents, events, selectedEventId]);

  async function handleToggleRsvp(eventId: string) {
    try {
      const res = await fetch(`/api/events/${eventId}/rsvp`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to update RSVP.');
      const data = await res.json();
      setEvents((prev) => prev.map((e) => (e.id === eventId ? data.event : e)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'RSVP request failed.');
    }
  }

  async function handleSyncWusa() {
    setSyncing(true);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      if (!res.ok) throw new Error('Sync request failed.');
      const data = await res.json();
      setEvents(data.events ?? []);
      setSyncStatus(data.status ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sync WUSA feed.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleCreateEvent(payload: {
    title: string;
    organizer: string;
    category: EventCategory;
    description: string;
    startTime: string;
    buildingCode: string;
    locationDetail: string;
    tags: string[];
  }) {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not publish event.');
    setEvents((prev) => [data.event, ...prev]);
    setSelectedEventId(data.event.id);
    setActiveTab('discover');
  }

  async function handleCreateBuddy(payload: {
    eventId: string;
    studentName: string;
    faculty: string;
    year: string;
    note: string;
    meetupSpot: string;
    spotsOpen: number;
  }) {
    const res = await fetch('/api/buddies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not create buddy post.');
    setBuddies((prev) => [data.buddy, ...prev]);
  }

  async function handleConnectBuddy(buddyId: string) {
    const res = await fetch(`/api/buddies/${buddyId}/connect`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) return;
    setBuddies((prev) => prev.map((b) => (b.id === buddyId ? data.buddy : b)));
  }

  async function handleAiRecommend() {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faculty: aiFaculty,
          interests: aiInterests || 'meeting new friends, tech talks, and campus food',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Recommendation failed.');
      }
      setAiResult(data);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to run smart matching.');
    } finally {
      setAiLoading(false);
    }
  }

  function openBuddiesForEvent(eventId: string) {
    setBuddyFilterEventId(eventId);
    setActiveTab('buddies');
  }

  const buddiesCountByEvent = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of buddies) {
      counts.set(b.eventId, (counts.get(b.eventId) ?? 0) + 1);
    }
    return counts;
  }, [buddies]);

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-zinc-900 flex flex-col">
      {/* Three-Zone Top Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#discover"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('discover');
            }}
            className="font-display text-xl font-bold tracking-tight text-zinc-950 whitespace-nowrap shrink-0"
          >
            WatHive
          </a>

          <nav className="flex items-center gap-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('discover')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === 'discover'
                  ? 'border-amber-500 text-zinc-950'
                  : 'border-transparent text-zinc-600 hover:text-zinc-950'
              }`}
            >
              Discover
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('map')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === 'map'
                  ? 'border-amber-500 text-zinc-950'
                  : 'border-transparent text-zinc-600 hover:text-zinc-950'
              }`}
            >
              Campus Map
            </button>
            <button
              type="button"
              onClick={() => {
                setBuddyFilterEventId(null);
                setActiveTab('buddies');
              }}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === 'buddies'
                  ? 'border-amber-500 text-zinc-950'
                  : 'border-transparent text-zinc-600 hover:text-zinc-950'
              }`}
            >
              Buddy Finder
            </button>
            <button
              type="button"
              onClick={handleSyncWusa}
              disabled={syncing}
              className="hidden sm:inline-flex items-center gap-1.5 py-1 text-zinc-600 hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing' : 'Sync WUSA'}
            </button>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setShowPromoteModal(true)}
              className="px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Post Event
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Concise Waterloo Context Header */}
        <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-zinc-200 pb-6">
          <div className="max-w-2xl space-y-2">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950 text-balance">
              Waterloo Campus Events & Student Buddy Finder
            </h1>
            <p className="text-sm sm:text-base text-zinc-600 leading-relaxed">
              Browse WUSA club nights, engineering workshops, and campus recreation across University of Waterloo buildings — and pair up so you never have to walk in solo.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-6 shrink-0 border-t lg:border-t-0 pt-4 lg:pt-0 border-zinc-200">
            <div>
              <div className="text-xs text-zinc-500">Upcoming Events</div>
              <div className="text-2xl font-bold font-display tabular-nums text-zinc-950">
                {events.length}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Open Buddy Groups</div>
              <div className="text-2xl font-bold font-display tabular-nums text-zinc-950">
                {buddies.length}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Campus Buildings</div>
              <div className="text-2xl font-bold font-display tabular-nums text-zinc-950">
                {buildings.length}
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-4"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={loadWorkspace}
              className="text-xs font-semibold underline whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        )}

        {/* DISCOVER TAB */}
        {activeTab === 'discover' && (
          <div className="space-y-6">
            {/* Search & Filter Toolbar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-1.5 bg-zinc-100 p-1 rounded-lg">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      selectedCategory === cat
                        ? 'bg-white text-zinc-950 shadow-sm'
                        : 'text-zinc-600 hover:text-zinc-950'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <div className="relative flex-1 sm:w-64">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search clubs, buildings, topics..."
                    className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                <select
                  aria-label="Filter by building"
                  value={selectedBuilding}
                  onChange={(e) => setSelectedBuilding(e.target.value)}
                  className="px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="All">All Buildings</option>
                  {buildings.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.code} — {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Split Workspace: Event List + Map & Inspector */}
            {loading ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 space-y-3">
                  {[1, 2, 3, 4].map((n) => (
                    <div
                      key={n}
                      className="h-32 bg-white border border-zinc-200 rounded-xl animate-pulse"
                    />
                  ))}
                </div>
                <div className="lg:col-span-5 h-[440px] bg-white border border-zinc-200 rounded-xl animate-pulse" />
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center space-y-3">
                <p className="text-base font-semibold text-zinc-900">
                  No matching campus events found.
                </p>
                <p className="text-sm text-zinc-500">
                  Try clearing your search or building filter, or promote a new student initiative.
                </p>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory('All');
                      setSelectedBuilding('All');
                      setSearchQuery('');
                    }}
                    className="px-4 py-2 text-xs font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-900 rounded-lg"
                  >
                    Reset Filters
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPromoteModal(true)}
                    className="px-4 py-2 text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-zinc-950 rounded-lg"
                  >
                    Post Event
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Event Feed */}
                <div className="lg:col-span-7 space-y-3">
                  {filteredEvents.map((evt) => {
                    const isSelected = selectedEvent?.id === evt.id;
                    const buddyCount = buddiesCountByEvent.get(evt.id) ?? 0;

                    return (
                      <motion.article
                        key={evt.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.16 }}
                        onClick={() => setSelectedEventId(evt.id)}
                        className={`cursor-pointer bg-white rounded-xl p-5 border transition-colors ${
                          isSelected
                            ? 'border-amber-500 ring-1 ring-amber-400/50'
                            : 'border-zinc-200 hover:border-zinc-300'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 mb-2">
                          <span>
                            {evt.category} · {evt.organizer} · {evt.source}
                          </span>
                          <span className="font-mono tabular-nums text-zinc-700">
                            {formatEventDate(evt.startTime)} · {evt.buildingCode}
                          </span>
                        </div>

                        <h2 className="text-lg font-semibold text-zinc-950 leading-snug">
                          {evt.title}
                        </h2>

                        <p className="text-sm text-zinc-600 mt-1.5 line-clamp-2 leading-relaxed">
                          {evt.description}
                        </p>

                        <div className="mt-4 pt-3 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3 text-xs text-zinc-500 tabular-nums">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                              {formatEventTime(evt.startTime, evt.endTime)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                              {evt.locationDetail}
                            </span>
                          </div>

                          <div
                            className="flex items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => openBuddiesForEvent(evt.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors whitespace-nowrap shrink-0 tabular-nums"
                            >
                              <Users className="w-3.5 h-3.5" />
                              {buddyCount > 0 ? `${buddyCount} Buddies` : 'Find Buddy'}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleRsvp(evt.id)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                                evt.rsvpedByMe
                                  ? 'bg-zinc-900 text-white'
                                  : 'bg-amber-400 text-zinc-950 hover:bg-amber-300'
                              }`}
                            >
                              {evt.rsvpedByMe && <Check className="w-3.5 h-3.5" />}
                              {evt.rsvpedByMe ? 'Going' : 'RSVP'} ({evt.rsvpCount})
                            </button>
                          </div>
                        </div>
                      </motion.article>
                    );
                  })}
                </div>

                {/* Sticky Right Column: Map + Selected Event Spotlight */}
                <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-4">
                  <CampusMap
                    events={filteredEvents}
                    buildings={buildings}
                    selectedEventId={selectedEvent?.id ?? null}
                    onSelectEvent={(id) => setSelectedEventId(id)}
                    heightClass="h-[320px]"
                  />

                  {selectedEvent && (
                    <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-3">
                      <div className="text-xs text-zinc-500 flex items-center justify-between gap-2">
                        <span>{selectedEvent.buildingCode} · {selectedEvent.locationDetail}</span>
                        <span className="font-mono tabular-nums">
                          {selectedEvent.isFree ? 'Free Admission' : 'Ticketed'}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-zinc-950">
                        {selectedEvent.title}
                      </h3>

                      <p className="text-sm text-zinc-600 leading-relaxed">
                        {selectedEvent.description}
                      </p>

                      <div className="text-xs text-zinc-500">
                        {selectedEvent.tags.join(' · ')}
                      </div>

                      <div className="pt-2 flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => handleToggleRsvp(selectedEvent.id)}
                          className={`flex-1 py-2 px-4 text-xs font-semibold rounded-lg transition-colors ${
                            selectedEvent.rsvpedByMe
                              ? 'bg-zinc-900 text-white'
                              : 'bg-amber-400 text-zinc-950 hover:bg-amber-300'
                          }`}
                        >
                          {selectedEvent.rsvpedByMe
                            ? `Attending (${selectedEvent.rsvpCount})`
                            : `RSVP to Event (${selectedEvent.rsvpCount})`}
                        </button>
                        <button
                          type="button"
                          onClick={() => openBuddiesForEvent(selectedEvent.id)}
                          className="py-2 px-4 text-xs font-medium text-zinc-800 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors whitespace-nowrap"
                        >
                          Find Buddy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* FULL CAMPUS MAP TAB */}
        {activeTab === 'map' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8">
              <CampusMap
                events={events}
                buildings={buildings}
                selectedEventId={selectedEvent?.id ?? null}
                onSelectEvent={(id) => setSelectedEventId(id)}
                heightClass="h-[540px]"
              />
            </div>

            <div className="lg:col-span-4 bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
              <div>
                <h2 className="text-lg font-bold text-zinc-950">Campus Building Directory</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Select a building to inspect scheduled events.
                </p>
              </div>

              <div className="divide-y divide-zinc-100 max-h-[450px] overflow-y-auto">
                {buildings.map((b) => {
                  const buildingEvents = events.filter((e) => e.buildingCode === b.code);
                  return (
                    <button
                      key={b.code}
                      type="button"
                      onClick={() => {
                        if (buildingEvents[0]) {
                          setSelectedEventId(buildingEvents[0].id);
                        }
                      }}
                      className="w-full py-2.5 px-2 text-left hover:bg-zinc-50 rounded-lg transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-zinc-900 truncate">
                          {b.code} — {b.name}
                        </div>
                        <div className="text-xs text-zinc-500">{b.zone}</div>
                      </div>
                      <span className="font-mono text-xs tabular-nums text-zinc-700 shrink-0">
                        {buildingEvents.length} evt
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* BUDDY FINDER TAB */}
        {activeTab === 'buddies' && (
          <div className="space-y-8">
            {/* Optional Server-Side Gemini Smart Match Helper */}
            <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-zinc-950 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Campus Match Assistant
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Share your faculty and interests to get matched to upcoming events and buddy groups.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <select
                  aria-label="Your Waterloo Faculty"
                  value={aiFaculty}
                  onChange={(e) => setAiFaculty(e.target.value)}
                  className="md:col-span-3 px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="Mathematics">Mathematics</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Science">Science</option>
                  <option value="Arts">Arts</option>
                  <option value="Environment">Environment</option>
                  <option value="Health">Health</option>
                </select>

                <input
                  type="text"
                  value={aiInterests}
                  onChange={(e) => setAiInterests(e.target.value)}
                  placeholder="Interests (e.g., AI build nights, badminton, board games, co-op prep)"
                  className="md:col-span-7 px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                />

                <button
                  type="button"
                  onClick={handleAiRecommend}
                  disabled={aiLoading}
                  className="md:col-span-2 px-4 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  {aiLoading ? 'Matching...' : 'Match Me'}
                </button>
              </div>

              {aiError && (
                <p className="text-xs text-red-600">{aiError}</p>
              )}

              {aiResult && (
                <div className="pt-3 border-t border-zinc-100 space-y-2 text-sm text-zinc-700">
                  <p>{aiResult.summary}</p>
                  {aiResult.recommendedEventIds?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {aiResult.recommendedEventIds.map((eid) => {
                        const evt = events.find((e) => e.id === eid);
                        if (!evt) return null;
                        return (
                          <button
                            key={eid}
                            type="button"
                            onClick={() => {
                              setSelectedEventId(eid);
                              setActiveTab('discover');
                            }}
                            className="px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-900 border border-amber-200 rounded-lg hover:bg-amber-100"
                          >
                            View {evt.title}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <BuddyPanel
              buddies={buddies}
              events={events}
              selectedEventId={buddyFilterEventId}
              onClearEventFilter={() => setBuddyFilterEventId(null)}
              onConnectBuddy={handleConnectBuddy}
              onCreateBuddy={handleCreateBuddy}
            />
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-500">
          <span>WatHive · University of Waterloo Campus Events & Buddy Network</span>
          <span>
            {syncStatus?.lastSourceMessage || 'Waterloo campus feed ready'}
          </span>
        </div>
      </footer>

      {showPromoteModal && (
        <PromoteModal
          buildings={buildings}
          onClose={() => setShowPromoteModal(false)}
          onSubmit={handleCreateEvent}
        />
      )}
    </div>
  );
}
