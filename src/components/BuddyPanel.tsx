import { useState, type FormEvent } from 'react';
import { Check, MapPin, UserPlus, Users } from 'lucide-react';
import type { BuddyPost, CampusEvent } from '../types.ts';

interface BuddyPanelProps {
  buddies: BuddyPost[];
  events: CampusEvent[];
  selectedEventId: string | null;
  onClearEventFilter: () => void;
  onConnectBuddy: (buddyId: string) => Promise<void>;
  onCreateBuddy: (payload: {
    eventId: string;
    studentName: string;
    faculty: string;
    year: string;
    note: string;
    meetupSpot: string;
    spotsOpen: number;
  }) => Promise<void>;
}

const FACULTIES = [
  'Mathematics',
  'Engineering',
  'Science',
  'Arts',
  'Environment',
  'Health',
];

export function BuddyPanel({
  buddies,
  events,
  selectedEventId,
  onClearEventFilter,
  onConnectBuddy,
  onCreateBuddy,
}: BuddyPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [eventId, setEventId] = useState(selectedEventId || events[0]?.id || '');
  const [studentName, setStudentName] = useState('');
  const [faculty, setFaculty] = useState('Mathematics');
  const [year, setYear] = useState('2A');
  const [meetupSpot, setMeetupSpot] = useState('SLC Turnkey Desk');
  const [spotsOpen, setSpotsOpen] = useState(2);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleBuddies = selectedEventId
    ? buddies.filter((b) => b.eventId === selectedEventId)
    : buddies;

  const activeEvent = selectedEventId
    ? events.find((e) => e.id === selectedEventId)
    : undefined;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const targetEventId = eventId || events[0]?.id;
    if (!targetEventId || !studentName.trim() || !note.trim()) {
      setError('Please pick an event, enter your name, and add a short meetup note.');
      return;
    }

    setSubmitting(true);
    try {
      await onCreateBuddy({
        eventId: targetEventId,
        studentName: studentName.trim(),
        faculty,
        year: year.trim() || '2A',
        meetupSpot: meetupSpot.trim() || 'SLC Turnkey Desk',
        spotsOpen,
        note: note.trim(),
      });
      setStudentName('');
      setNote('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to post buddy request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 tracking-tight">
            Student Buddy Board
          </h2>
          <p className="text-sm text-zinc-600 mt-1">
            {activeEvent
              ? `Showing students heading to ${activeEvent.title}`
              : 'Find another Waterloo student to walk over and attend an event with.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {selectedEventId && (
            <button
              type="button"
              onClick={onClearEventFilter}
              className="px-3 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors whitespace-nowrap shrink-0"
            >
              Show all events
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!eventId && events[0]) setEventId(events[0].id);
              setShowForm((prev) => !prev);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-3.5 h-3.5" />
            {showForm ? 'Close Form' : 'Look for a Buddy'}
          </button>
        </div>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-700">Target Event</span>
              <select
                value={eventId || events[0]?.id || ''}
                onChange={(e) => setEventId(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} ({ev.buildingCode})
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-700">Your Name</span>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="e.g., Jordan Lee"
                className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-700">Faculty</span>
                <select
                  value={faculty}
                  onChange={(e) => setFaculty(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {FACULTIES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-700">Term / Program</span>
                <input
                  type="text"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2A CS"
                  className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </label>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="col-span-2 block space-y-1.5">
                <span className="text-xs font-medium text-zinc-700">Campus Meetup Spot</span>
                <input
                  type="text"
                  value={meetupSpot}
                  onChange={(e) => setMeetupSpot(e.target.value)}
                  placeholder="SLC Turnkey Desk"
                  className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-zinc-700">Spots</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={spotsOpen}
                  onChange={(e) => setSpotsOpen(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </label>
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-zinc-700">Short Intro & Meetup Note</span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Where you are walking from, what you are excited for, or when you want to meet."
              className="w-full px-3 py-2 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </label>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? 'Posting...' : 'Post Buddy Request'}
            </button>
          </div>
        </form>
      )}

      {visibleBuddies.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center space-y-3">
          <Users className="w-6 h-6 text-zinc-400 mx-auto" />
          <p className="text-sm font-medium text-zinc-900">
            No buddy requests posted for this event yet.
          </p>
          <p className="text-xs text-zinc-500">
            Be the first student to suggest a meetup spot before the event starts.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="px-4 py-2 text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors"
          >
            Post Meetup Note
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleBuddies.map((buddy) => (
            <article
              key={buddy.id}
              className="bg-white border border-zinc-200 rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                  <span>
                    {buddy.faculty} · {buddy.year}
                  </span>
                  <span className="font-mono tabular-nums text-zinc-700">
                    {buddy.spotsOpen} spot{buddy.spotsOpen === 1 ? '' : 's'} left
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-zinc-900">
                    {buddy.studentName}
                  </h3>
                  <p className="text-xs font-medium text-amber-700 mt-0.5">
                    {buddy.eventTitle}
                  </p>
                </div>

                <p className="text-sm text-zinc-600 leading-relaxed">{buddy.note}</p>
              </div>

              <div className="pt-3 border-t border-zinc-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-xs text-zinc-500 min-w-0">
                  <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="truncate">{buddy.meetupSpot}</span>
                </div>

                <button
                  type="button"
                  onClick={() => onConnectBuddy(buddy.id)}
                  disabled={!buddy.connectedByMe && buddy.spotsOpen === 0}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    buddy.connectedByMe
                      ? 'bg-zinc-900 text-white'
                      : 'bg-zinc-100 text-zinc-900 hover:bg-amber-400'
                  } disabled:opacity-40`}
                >
                  {buddy.connectedByMe ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Joined ({buddy.connectedCount})
                    </>
                  ) : (
                    <>Join Group ({buddy.connectedCount})</>
                  )}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
