import { useEffect, useRef, useState } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';

export const BUKSU_MAIN_CAMPUS = { lat: 8.157416, lng: 125.12485 };
const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || '';

type MapsEvent = { latLng?: { lat: () => number; lng: () => number } };
type GoogleMapInstance = {
  addListener: (name: string, callback: (event: MapsEvent) => void) => { remove: () => void };
  setCenter: (position: { lat: number; lng: number }) => void;
  setZoom: (zoom: number) => void;
};
type GoogleMarkerInstance = {
  addListener: (name: string, callback: (event: MapsEvent) => void) => { remove: () => void };
  setMap: (map: GoogleMapInstance | null) => void;
  setPosition: (position: { lat: number; lng: number }) => void;
};
type GoogleMapsNamespace = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
  Marker: new (options: Record<string, unknown>) => GoogleMarkerInstance;
};

let mapsLoadPromise: Promise<GoogleMapsNamespace> | null = null;
const getGoogleMaps = () => (window as unknown as { google?: { maps?: GoogleMapsNamespace } }).google?.maps;

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsNamespace> {
  const existingMaps = getGoogleMaps();
  if (existingMaps) return Promise.resolve(existingMaps);
  if (mapsLoadPromise) return mapsLoadPromise;
  mapsLoadPromise = new Promise((resolve, reject) => {
    const callbackName = `__googleMapsReady_${Date.now()}`;
    const globalWindow = window as unknown as Record<string, unknown>;
    const script = document.createElement('script');
    globalWindow[callbackName] = () => {
      const maps = getGoogleMaps();
      delete globalWindow[callbackName];
      if (maps) resolve(maps);
      else reject(new Error('Google Maps did not initialize.'));
    };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${callbackName}&loading=async`;
    script.async = true;
    script.onerror = () => {
      delete globalWindow[callbackName];
      mapsLoadPromise = null;
      reject(new Error('Google Maps could not load. Check the API key and enabled Maps JavaScript API.'));
    };
    document.head.appendChild(script);
  });
  return mapsLoadPromise;
}

interface PickerProps {
  latitude?: number;
  longitude?: number;
  onChange: (latitude: number, longitude: number) => void;
}

export function GoogleMapPicker({ latitude, longitude, onChange }: PickerProps) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<GoogleMapInstance | null>(null);
  const marker = useRef<GoogleMarkerInstance | null>(null);
  const onChangeRef = useRef(onChange);
  const locationRef = useRef<{ lat: number; lng: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  onChangeRef.current = onChange;
  locationRef.current = Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { lat: latitude as number, lng: longitude as number }
    : null;

  useEffect(() => {
    if (!mapsApiKey || !element.current) return;
    let mounted = true;
    let clickListener: { remove: () => void } | undefined;
    loadGoogleMaps(mapsApiKey).then(maps => {
      if (!mounted || !element.current) return;
      map.current = new maps.Map(element.current, {
        center: locationRef.current || BUKSU_MAIN_CAMPUS,
        zoom: 18,
        mapTypeId: 'roadmap',
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
      });
      clickListener = map.current.addListener('click', event => {
        if (!event.latLng) return;
        const point = { lat: event.latLng.lat(), lng: event.latLng.lng() };
        if (!marker.current) {
          marker.current = new maps.Marker({ map: map.current, position: point, draggable: true, title: 'Event location' });
          marker.current.addListener('dragend', dragged => {
            if (dragged.latLng) onChangeRef.current(dragged.latLng.lat(), dragged.latLng.lng());
          });
        } else marker.current.setPosition(point);
        onChangeRef.current(point.lat, point.lng);
      });
      setReady(true);
    }).catch(caught => {
      if (mounted) setError(caught instanceof Error ? caught.message : 'Google Maps could not load.');
    });
    return () => {
      mounted = false;
      clickListener?.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !map.current) return;
    if (!locationRef.current) {
      marker.current?.setMap(null);
      marker.current = null;
      return;
    }
    map.current.setCenter(locationRef.current);
    if (marker.current) marker.current.setPosition(locationRef.current);
    else {
      void loadGoogleMaps(mapsApiKey).then(maps => {
        if (!map.current || !locationRef.current || marker.current) return;
        marker.current = new maps.Marker({ map: map.current, position: locationRef.current, draggable: true, title: 'Event location' });
        marker.current.addListener('dragend', event => {
          if (event.latLng) onChangeRef.current(event.latLng.lat(), event.latLng.lng());
        });
      });
    }
  }, [latitude, longitude, ready]);

  if (!mapsApiKey) return <MapSetupMessage />;
  return <div className="space-y-2">
    <div ref={element} className="h-64 w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]" aria-label="Choose the event location on Google Maps" />
    {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    <p className="text-xs text-white/50">Click the exact spot on campus or drag the pin. Zoom in with the map controls to choose a building or entrance.</p>
  </div>;
}

export function GoogleMapPreview({ latitude, longitude, venue }: { latitude?: number; longitude?: number; venue: string }) {
  const hasPin = Number.isFinite(latitude) && Number.isFinite(longitude);
  const coordinates = hasPin ? `${latitude},${longitude}` : '';
  const query = hasPin ? coordinates : `${venue}, Bukidnon State University, Malaybalay, Bukidnon`;
  const openUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.025]">
    {mapsApiKey ? <iframe
      title={`Google Map showing ${venue}`}
      src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(mapsApiKey)}&q=${encodeURIComponent(query)}&zoom=${hasPin ? 18 : 16}`}
      className="h-56 w-full border-0"
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
    /> : <div className="flex h-32 flex-col items-center justify-center gap-2 px-4 text-center">
      <MapPin size={22} className="text-orange-400" />
      <p className="text-xs text-white/55">Add the Maps API key to show the embedded map.{hasPin ? ` Pin: ${coordinates}` : ' Location: BukSU main campus.'}</p>
    </div>}
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="truncate text-xs text-white/50">{hasPin ? `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}` : `${venue} · BukSU campus`}</span>
      <a href={openUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-orange-300 hover:text-orange-200">
        Open in Maps <ExternalLink size={13} />
      </a>
    </div>
  </div>;
}

function MapSetupMessage() {
  return <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.025] px-5 text-center">
    <MapPin size={22} className="text-orange-400" />
    <p className="text-sm font-semibold text-white/70">Google Maps picker needs an API key</p>
    <p className="text-xs leading-5 text-white/45">Set VITE_GOOGLE_MAPS_API_KEY in frontend/.env.local. You can also enter coordinates below and open Maps to find a spot.</p>
  </div>;
}
