import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { CampusBuilding, EventCategory } from '../types.ts';

interface PromoteModalProps {
  buildings: CampusBuilding[];
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    organizer: string;
    category: EventCategory;
    description: string;
    startTime: string;
    buildingCode: string;
    locationDetail: string;
    tags: string[];
  }) => Promise<void>;
}

const CATEGORIES: EventCategory[] = [
  'Tech & Hackathons',
  'Social & Clubs',
  'Career & Co-op',
  'Wellness & Rec',
  'Arts & Culture',
  'Academic',
];

export function PromoteModal({ buildings, onClose, onSubmit }: PromoteModalProps) {
  const defaultDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  defaultDate.setHours(18, 0, 0, 0);
  const defaultLocal = new Date(
    defaultDate.getTime() - defaultDate.getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 16);

  const [title, setTitle] = useState('');
  const [organizer, setOrganizer] = useState('');
  const [category, setCategory] = useState<EventCategory>('Social & Clubs');
  const [buildingCode, setBuildingCode] = useState(buildings[0]?.code || 'SLC');
  const [locationDetail, setLocationDetail] = useState('');
  const [startTime, setStartTime] = useState(defaultLocal);
  const [description, setDescription] = useState('');
  const [tagsRaw, setTagsRaw] = useState('Student Initiative, Free');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !organizer.trim()) {
      setError('Please enter both an event title and club or organizer name.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        title: title.trim(),
        organizer: organizer.trim(),
        category,
        buildingCode,
        locationDetail: locationDetail.trim() || buildingCode,
        startTime: new Date(startTime).toISOString(),
        description: description.trim(),
        tags: tagsRaw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish event.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="promote-modal-title"
    >
      <div className="bg-white border border-zinc-200 rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <div>
            <h2 id="promote-modal-title" className="text-lg font-bold text-zinc-900">
              Promote a Student Initiative
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Publish directly to the Waterloo campus feed and map.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-zinc-900 rounded-lg"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-zinc-700">Event Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Waterloo Design Critique & Portfolio Night"
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-700">Club / Organizer</span>
              <input
                type="text"
                value={organizer}
                onChange={(e) => setOrganizer(e.target.value)}
                placeholder="e.g., UW Blueprint"
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-700">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as EventCategory)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-700">Building</span>
              <select
                value={buildingCode}
                onChange={(e) => setBuildingCode(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {buildings.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.code} — {b.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-700">Room / Spot</span>
              <input
                type="text"
                value={locationDetail}
                onChange={(e) => setLocationDetail(e.target.value)}
                placeholder="e.g., E7 2317"
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-zinc-700">Start Date & Time</span>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-zinc-700">Description</span>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happens at the event, who should come, and whether snacks or gear are provided."
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-zinc-700">Tags (comma separated)</span>
            <input
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </label>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-600 hover:text-zinc-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? 'Publishing...' : 'Publish Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
