import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { CampusBuilding, CampusEvent } from '../types.ts';

interface CampusMapProps {
  events: CampusEvent[];
  buildings: CampusBuilding[];
  selectedEventId: string | null;
  onSelectEvent: (eventId: string) => void;
  heightClass?: string;
}

const UW_CENTER: [number, number] = [43.4718, -80.5435];

export function CampusMap({
  events,
  buildings,
  selectedEventId,
  onSelectEvent,
  heightClass = 'h-[440px]',
}: CampusMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: UW_CENTER,
      zoom: 16,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const eventsByBuilding = new Map<string, CampusEvent[]>();
    for (const evt of events) {
      const list = eventsByBuilding.get(evt.buildingCode) ?? [];
      list.push(evt);
      eventsByBuilding.set(evt.buildingCode, list);
    }

    buildings.forEach((b) => {
      const buildingEvents = eventsByBuilding.get(b.code) ?? [];
      const hasSelected = buildingEvents.some((e) => e.id === selectedEventId);
      const countLabel = buildingEvents.length > 0 ? `${b.code} (${buildingEvents.length})` : b.code;

      const icon = L.divIcon({
        className: '',
        html: `<div class="wathive-pin ${hasSelected ? 'is-selected' : ''}" style="${
          buildingEvents.length === 0 ? 'opacity:0.58;background:#52525b;color:#fafafa;' : ''
        }">${countLabel}</div>`,
        iconSize: [54, 24],
        iconAnchor: [27, 12],
      });

      const marker = L.marker([b.lat, b.lng], { icon });

      if (buildingEvents.length > 0) {
        const firstEvent = buildingEvents[0];
        const popupHtml = `
          <div style="min-width:190px;font-family:inherit;">
            <div style="font-weight:600;font-size:13px;color:#18181b;margin-bottom:4px;">${b.code} — ${b.name}</div>
            <div style="font-size:12px;color:#52525b;margin-bottom:6px;">${buildingEvents.length} upcoming event${buildingEvents.length > 1 ? 's' : ''}</div>
            <div style="font-size:12px;font-weight:500;color:#b45309;">${firstEvent.title}</div>
          </div>
        `;
        marker.bindPopup(popupHtml);
        marker.on('click', () => {
          onSelectEvent(firstEvent.id);
        });
      } else {
        marker.bindPopup(
          `<div style="font-size:12px;"><strong>${b.code}</strong> — ${b.name}<br/><span style="color:#71717a;">No scheduled events</span></div>`,
        );
      }

      marker.addTo(group);
    });

    if (selectedEventId) {
      const target = events.find((e) => e.id === selectedEventId);
      if (target) {
        map.panTo([target.lat, target.lng], { animate: true, duration: 0.35 });
      }
    }
  }, [events, buildings, selectedEventId, onSelectEvent]);

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
      <div ref={containerRef} className={`w-full ${heightClass}`} aria-label="University of Waterloo interactive campus map" />
      <div className="px-4 py-2.5 border-t border-zinc-200 flex items-center justify-between text-xs text-zinc-500">
        <span>University of Waterloo Campus · Click a building pin to inspect events</span>
        <span className="font-mono tabular-nums">{events.length} active pins</span>
      </div>
    </div>
  );
}
