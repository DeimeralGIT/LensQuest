import { Map, Marker, useMap } from '@vis.gl/react-google-maps';
import React, { useState, useMemo } from 'react';
import { PhotoSpot } from '../types';
import { Star, X, ChevronDown, ChevronUp, TriangleAlert } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { BUY_ME_A_COFFEE_ICON_URL, buildBuyMeCoffeeUrl } from '../lib/buyMeCoffee';

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD_PX = 10;
const LENSQUEST_MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#ebe3cd' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#523735' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f1e6' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#c9b2a6' }] },
  { featureType: 'administrative.land_parcel', elementType: 'geometry.stroke', stylers: [{ color: '#dcd2be' }] },
  { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#ae9e90' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#dfd2ae' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#dfd2ae' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#93817c' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#a5b076' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#447530' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#f5f1e6' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#fdfcf8' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#f8c967' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#e9bc62' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#e98d58' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry.stroke', stylers: [{ color: '#db8555' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#806b63' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#dfd2ae' }] },
  { featureType: 'transit.line', elementType: 'labels.text.fill', stylers: [{ color: '#8f7d77' }] },
  { featureType: 'transit.line', elementType: 'labels.text.stroke', stylers: [{ color: '#ebe3cd' }] },
  { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#dfd2ae' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#b9d3c2' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#92998d' }] },
];

interface MapComponentProps {
  spots: PhotoSpot[];
  onSpotSelect: (spot: PhotoSpot) => void;
  onOpenReviews: (spot: PhotoSpot) => void;
  onOpenPreview: (spot: PhotoSpot) => void;
  onReportSpot?: (spot: PhotoSpot) => void;
  currentUserId?: string;
  onMapClick: (latLng: { lat: number; lng: number }) => void;
  onMapRightClick: (latLng: { lat: number; lng: number }) => void;
  center: { lat: number; lng: number };
  zoom: number;
  onCameraChange: (ev: { detail: { center: { lat: number; lng: number }; zoom: number } }) => void;
  onFilterByUser?: (userId: string, userName: string) => void;
}

// Helper function to calculate distance between two coordinates (in km)
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getCreatedAtMillis(spot: PhotoSpot): number {
  const createdAt = spot.createdAt as unknown;

  if (typeof createdAt === 'number') {
    return createdAt;
  }

  if (
    createdAt &&
    typeof createdAt === 'object' &&
    'toMillis' in createdAt &&
    typeof createdAt.toMillis === 'function'
  ) {
    return createdAt.toMillis();
  }

  return 0;
}

// Filter spots based on zoom level
function filterSpotsByZoom(spots: PhotoSpot[], center: { lat: number; lng: number }, zoom: number): PhotoSpot[] {
  const MAX_DISPLAY = 30;

  if (spots.length <= MAX_DISPLAY) {
    return spots;
  }

  // Calculate visibility radius based on zoom level
  // Lower zoom = larger area = need to filter more
  let radiusKm = 100;
  if (zoom >= 15) radiusKm = 5;
  else if (zoom >= 13) radiusKm = 15;
  else if (zoom >= 11) radiusKm = 30;
  else if (zoom >= 9) radiusKm = 60;

  // Filter spots within radius and sort by popularity/recency
  const filtered = spots.filter(spot => {
    const distance = calculateDistance(center.lat, center.lng, spot.location.lat, spot.location.lng);
    return distance <= radiusKm;
  });

  // Sort by review count (popularity) first, then by creation date
  const sorted = filtered.sort((a, b) => {
    const reviewDiff = (b.reviewCount || 0) - (a.reviewCount || 0);
    if (reviewDiff !== 0) return reviewDiff;

    const timeA = getCreatedAtMillis(a);
    const timeB = getCreatedAtMillis(b);
    return timeB - timeA;
  });

  return sorted.slice(0, MAX_DISPLAY);
}

interface SpotCluster {
  id: string;
  center: { lat: number; lng: number };
  spots: PhotoSpot[];
  primarySpot: PhotoSpot;
}

function getClusterPrimarySpot(spots: PhotoSpot[]): PhotoSpot {
  return [...spots].sort((a, b) => {
    const reviewDiff = (b.reviewCount || 0) - (a.reviewCount || 0);
    if (reviewDiff !== 0) {
      return reviewDiff;
    }

    const timeA = getCreatedAtMillis(a);
    const timeB = getCreatedAtMillis(b);
    return timeB - timeA;
  })[0];
}

function clusterSpotsByDistance(spots: PhotoSpot[], maxDistanceKm = 0.05): SpotCluster[] {
  const clusters: Array<{ center: { lat: number; lng: number }; spots: PhotoSpot[] }> = [];

  for (const spot of spots) {
    let clusterIndex = -1;

    for (let i = 0; i < clusters.length; i += 1) {
      const cluster = clusters[i];
      const distance = calculateDistance(
        spot.location.lat,
        spot.location.lng,
        cluster.center.lat,
        cluster.center.lng
      );

      if (distance <= maxDistanceKm) {
        clusterIndex = i;
        break;
      }
    }

    if (clusterIndex === -1) {
      clusters.push({
        center: { lat: spot.location.lat, lng: spot.location.lng },
        spots: [spot],
      });
      continue;
    }

    const cluster = clusters[clusterIndex];
    cluster.spots.push(spot);

    const latSum = cluster.spots.reduce((sum, s) => sum + s.location.lat, 0);
    const lngSum = cluster.spots.reduce((sum, s) => sum + s.location.lng, 0);
    cluster.center = {
      lat: latSum / cluster.spots.length,
      lng: lngSum / cluster.spots.length,
    };
  }

  return clusters.map((cluster, index) => {
    const primarySpot = getClusterPrimarySpot(cluster.spots);
    return {
      id: `cluster-${index}-${primarySpot.id}`,
      center: cluster.center,
      spots: cluster.spots,
      primarySpot,
    };
  });
}

function getClusterDistanceKmForZoom(zoom: number): number {
  if (zoom >= 16) return 0.04;
  if (zoom >= 14) return 0.08;
  if (zoom >= 12) return 0.2;
  if (zoom >= 10) return 0.45;
  return 0.9;
}

export default function MapComponent({ spots, onSpotSelect, onOpenReviews, onOpenPreview, onReportSpot, currentUserId, onMapClick, onMapRightClick, center, zoom, onCameraChange, onFilterByUser }: MapComponentProps) {
  const [selectedClusterSpots, setSelectedClusterSpots] = useState<PhotoSpot[] | null>(null);
  const [selectedClusterPrimary, setSelectedClusterPrimary] = useState<PhotoSpot | null>(null);
  const [imageOrientations, setImageOrientations] = useState<Record<string, boolean>>({}); // true = portrait

  // Memoize filtered spots to avoid recalculation on every render
  const filteredSpots = useMemo(() => filterSpotsByZoom(spots, center, zoom), [spots, center, zoom]);
  const clusterDistanceKm = useMemo(() => getClusterDistanceKmForZoom(zoom), [zoom]);
  const clusteredSpots = useMemo(() => clusterSpotsByDistance(filteredSpots, clusterDistanceKm), [filteredSpots, clusterDistanceKm]);
  // Pre-load image orientations for all visible spots in clusters
  React.useEffect(() => {
    clusteredSpots.forEach((cluster) => {
      cluster.spots.forEach((clusterSpot) => {
        if (imageOrientations[clusterSpot.id] !== undefined) {
          return;
        }

        const img = new Image();
        img.onload = () => {
          const isPortrait = img.naturalHeight > img.naturalWidth;
          setImageOrientations(prev => ({ ...prev, [clusterSpot.id]: isPortrait }));
        };
        img.src = clusterSpot.imageUrl;
      });
    });
  }, [clusteredSpots, imageOrientations]);

  return (
    <div className="w-full h-full">
      <Map
        center={center}
        zoom={zoom}
        onCameraChanged={onCameraChange}
        styles={LENSQUEST_MAP_STYLES}
        renderingType="RASTER"
        className="w-full h-full"
        disableDefaultUI={true}
        clickableIcons={false}
        gestureHandling="greedy"
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
      >
        <MapEventHandler
          onMapClick={onMapClick}
          onMapRightClick={onMapRightClick}
          onClearSelectedSpot={() => {
            setSelectedClusterSpots(null);
            setSelectedClusterPrimary(null);
          }}
        />
        <MapLongPressHandler onLongPress={onMapRightClick} />
        {clusteredSpots.map((cluster) => {
          const primarySpot = cluster.primarySpot;

          return (
            <SpotMarker
              key={cluster.id}
              position={cluster.center}
              count={cluster.spots.length}
              onSelect={() => {
                setSelectedClusterSpots([...cluster.spots]);
                setSelectedClusterPrimary(primarySpot);
                onSpotSelect(primarySpot);
              }}
            />
          );
        })}
      </Map>

      {selectedClusterSpots && selectedClusterPrimary && (
        <div
          className="fixed inset-0 z-50 bg-editorial-black/60 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => {
            setSelectedClusterSpots(null);
            setSelectedClusterPrimary(null);
          }}
        >
          <div
            className="bg-primary-bg w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.25)] border border-editorial-black/10 flex flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-4 md:p-6 border-b border-editorial-black/10 flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] uppercase tracking-[0.2em] font-black text-accent">Spot Details</p>
                <h2 className="font-serif italic text-xl md:text-2xl leading-tight">
                  {selectedClusterSpots.length > 1 ? `${selectedClusterSpots.length} nearby assets` : selectedClusterPrimary.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedClusterSpots(null);
                  setSelectedClusterPrimary(null);
                }}
                className="p-2 hover:bg-editorial-black/5 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 md:p-6 overflow-y-auto space-y-3">
              {selectedClusterSpots.map((spot) => (
                <SpotDetailsCard
                  key={spot.id}
                  spot={spot}
                  isPortrait={imageOrientations[spot.id] === true}
                  onOpenReviews={(spotForAction) => {
                    onSpotSelect(spotForAction);
                    onOpenReviews(spotForAction);
                  }}
                  onReportSpot={onReportSpot}
                  currentUserId={currentUserId}
                  onFilterByUser={onFilterByUser ? (userId, userName) => {
                    setSelectedClusterSpots(null);
                    setSelectedClusterPrimary(null);
                    onFilterByUser(userId, userName);
                  } : undefined}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MapEventHandler({
  onMapClick,
  onMapRightClick,
  onClearSelectedSpot,
}: {
  onMapClick: (latLng: { lat: number; lng: number }) => void;
  onMapRightClick: (latLng: { lat: number; lng: number }) => void;
  onClearSelectedSpot: () => void;
}) {
  const map = useMap();
  const handlersRef = React.useRef({
    onMapClick,
    onMapRightClick,
    onClearSelectedSpot,
  });

  React.useEffect(() => {
    handlersRef.current = {
      onMapClick,
      onMapRightClick,
      onClearSelectedSpot,
    };
  }, [onMapClick, onMapRightClick, onClearSelectedSpot]);

  React.useEffect(() => {
    if (!map) {
      return;
    }

    const clickListener = map.addListener('click', (event: google.maps.MapMouseEvent) => {
      const { onMapClick: handleMapClick, onClearSelectedSpot: handleClearSelectedSpot } = handlersRef.current;
      const clickTarget = event.domEvent?.target;
      if (clickTarget instanceof Element && clickTarget.closest('[data-map-marker="true"]')) {
        // Marker click is handled by the marker itself.
        return;
      }

      if (!event.latLng) {
        handleClearSelectedSpot();
        return;
      }

      handleClearSelectedSpot();
      handleMapClick(event.latLng.toJSON());
    });

    const contextMenuListener = map.addListener('contextmenu', (event: google.maps.MapMouseEvent) => {
      const { onMapRightClick: handleMapRightClick, onClearSelectedSpot: handleClearSelectedSpot } = handlersRef.current;
      if (!event.latLng) {
        return;
      }

      handleClearSelectedSpot();
      handleMapRightClick(event.latLng.toJSON());
    });

    return () => {
      clickListener.remove();
      contextMenuListener.remove();
    };
  }, [map]);

  return null;
}

function MapLongPressHandler({ onLongPress }: { onLongPress: (latLng: { lat: number; lng: number }) => void }) {
  const map = useMap();
  const longPressTimeoutRef = React.useRef<number | null>(null);
  const pointerStartRef = React.useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const activePointerCountRef = React.useRef(0);
  const onLongPressRef = React.useRef(onLongPress);

  React.useEffect(() => {
    onLongPressRef.current = onLongPress;
  }, [onLongPress]);

  React.useEffect(() => {
    if (!map) {
      return;
    }

    const mapDiv = map.getDiv();

    const clearLongPress = () => {
      if (longPressTimeoutRef.current !== null) {
        window.clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
      pointerStartRef.current = null;
    };

    const handlePointerDown = (event: PointerEvent) => {
      activePointerCountRef.current += 1;

      // Any multi-touch (pinch/zoom) cancels the long press
      if (activePointerCountRef.current > 1) {
        clearLongPress();
        return;
      }

      if (event.button !== 0) {
        clearLongPress();
        return;
      }

      const target = event.target;
      if (target instanceof Element && target.closest('[data-map-marker="true"]')) {
        clearLongPress();
        return;
      }

      pointerStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
      };

      longPressTimeoutRef.current = window.setTimeout(() => {
        const point = pointerStartRef.current;
        const bounds = map.getBounds();
        const rect = mapDiv.getBoundingClientRect();

        if (!point || !bounds || rect.width === 0 || rect.height === 0) {
          clearLongPress();
          return;
        }

        const percentX = (point.x - rect.left) / rect.width;
        const percentY = (point.y - rect.top) / rect.height;

        if (percentX < 0 || percentX > 1 || percentY < 0 || percentY > 1) {
          clearLongPress();
          return;
        }

        const northEast = bounds.getNorthEast();
        const southWest = bounds.getSouthWest();

        onLongPressRef.current({
          lat: northEast.lat() - (northEast.lat() - southWest.lat()) * percentY,
          lng: southWest.lng() + (northEast.lng() - southWest.lng()) * percentX,
        });

        clearLongPress();
      }, LONG_PRESS_MS);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const startPoint = pointerStartRef.current;

      if (!startPoint || event.pointerId !== startPoint.pointerId) {
        return;
      }

      const distance = Math.hypot(event.clientX - startPoint.x, event.clientY - startPoint.y);
      if (distance > MOVE_THRESHOLD_PX) {
        clearLongPress();
      }
    };

    const handlePointerEnd = (event: PointerEvent) => {
      activePointerCountRef.current = Math.max(0, activePointerCountRef.current - 1);

      const startPoint = pointerStartRef.current;
      if (!startPoint || event.pointerId !== startPoint.pointerId) {
        return;
      }

      clearLongPress();
    };

    mapDiv.addEventListener('pointerdown', handlePointerDown, { passive: true });
    mapDiv.addEventListener('pointermove', handlePointerMove, { passive: true });
    mapDiv.addEventListener('pointerup', handlePointerEnd, { passive: true });
    mapDiv.addEventListener('pointercancel', handlePointerEnd, { passive: true });
    mapDiv.addEventListener('pointerleave', handlePointerEnd, { passive: true });

    return () => {
      clearLongPress();
      mapDiv.removeEventListener('pointerdown', handlePointerDown);
      mapDiv.removeEventListener('pointermove', handlePointerMove);
      mapDiv.removeEventListener('pointerup', handlePointerEnd);
      mapDiv.removeEventListener('pointercancel', handlePointerEnd);
      mapDiv.removeEventListener('pointerleave', handlePointerEnd);
    };
  }, [map]);

  return null;
}

const SINGLE_PIN_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">` +
  `<path d="M14 0C6.268 0 0 6.268 0 14c0 9.917 14 26 14 26S28 23.917 28 14C28 6.268 21.732 0 14 0z" fill="#1A1A1A"/>` +
  `<circle cx="14" cy="14" r="6" fill="#C48F5D"/>` +
  `<circle cx="14" cy="14" r="2.5" fill="#1A1A1A"/>` +
  `</svg>`
);

const CLUSTER_PIN_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">` +
  `<circle cx="22" cy="22" r="20" fill="#1A1A1A" stroke="#C48F5D" stroke-width="3"/>` +
  `</svg>`
);

function SpotMarker({ position, count, onSelect }: {
  key?: unknown;
  position: { lat: number; lng: number };
  count: number;
  onSelect: () => void;
}) {
  const didSelectRef = React.useRef(false);

  const handleSelect = (event?: React.MouseEvent | google.maps.MapMouseEvent) => {
    event?.domEvent?.stopPropagation?.();
    (event as React.MouseEvent)?.stopPropagation?.();
    (event as google.maps.MapMouseEvent)?.stop?.();

    if (didSelectRef.current) {
      return;
    }

    didSelectRef.current = true;
    window.setTimeout(() => {
      didSelectRef.current = false;
    }, 0);
    onSelect();
  };

  const isCluster = count > 1;

  const singleIcon: google.maps.Icon = {
    url: `data:image/svg+xml;charset=UTF-8,${SINGLE_PIN_SVG}`,
    scaledSize: new window.google.maps.Size(28, 40),
    anchor: new window.google.maps.Point(14, 40),
  };

  const clusterIcon: google.maps.Icon = {
    url: `data:image/svg+xml;charset=UTF-8,${CLUSTER_PIN_SVG}`,
    scaledSize: new window.google.maps.Size(44, 44),
    anchor: new window.google.maps.Point(22, 22),
  };

  return (
    <Marker
      position={position}
      clickable={true}
      onClick={handleSelect}
      icon={isCluster ? clusterIcon : singleIcon}
      label={isCluster ? { text: String(count), color: '#ffffff', fontWeight: '700', fontSize: '13px' } : undefined}
    />
  );
}

function SpotDetailsCard({
  spot,
  isPortrait,
  onOpenReviews,
  onReportSpot,
  currentUserId,
  onFilterByUser,
}: {
  key?: unknown;
  spot: PhotoSpot;
  isPortrait: boolean;
  onOpenReviews: (spot: PhotoSpot) => void;
  onReportSpot?: (spot: PhotoSpot) => void;
  currentUserId?: string;
  onFilterByUser?: (userId: string, userName: string) => void;
}) {
  const reviewCount = Number(spot.reviewCount || 0);
  const averageRating = Number(spot.averageRating || 0);
  const hasReviews = reviewCount > 0;
  const [descExpanded, setDescExpanded] = React.useState(false);
  const [isClamped, setIsClamped] = React.useState(false);
  const descRef = React.useRef<HTMLParagraphElement>(null);
  const [coffeeUrl, setCoffeeUrl] = React.useState<string | null>(null);
  const isOwnSpot = Boolean(currentUserId && spot.userId === currentUserId);

  // Detect whether the description text is actually overflowing its clamp
  React.useLayoutEffect(() => {
    if (!descExpanded && descRef.current) {
      setIsClamped(descRef.current.scrollHeight > descRef.current.clientHeight);
    }
  }, [spot.description, isPortrait, descExpanded]);

  React.useEffect(() => {
    let cancelled = false;
    const fetchProfile = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', spot.userId, 'profile', 'public'));
        if (!cancelled && snap.exists()) {
          const data = snap.data();
          const url = buildBuyMeCoffeeUrl(data?.buyMeCoffeeUrl);
          setCoffeeUrl(url);
        }
      } catch {
        // profile fetch is best-effort
      }
    };
    fetchProfile();
    return () => { cancelled = true; };
  }, [spot.userId]);

  const RatingRow = (
    <div className="flex items-center gap-1 mb-1.5">
      {hasReviews ? (
        <>
          <div className="flex items-center gap-0.5">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                className={`w-2.5 h-2.5 md:w-3 md:h-3 ${i < Math.round(averageRating) ? 'fill-accent text-accent' : 'text-editorial-black/20'}`}
              />
            ))}
          </div>
          <span className="text-[9px] md:text-[10px] font-bold text-editorial-black/60">{averageRating.toFixed(1)} • {reviewCount}</span>
        </>
      ) : (
        <div className="inline-flex items-center gap-1.5 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
          <Star className="w-2.5 h-2.5 md:w-3 md:h-3 text-accent" />
          No reviews yet
        </div>
      )}
    </div>
  );

  const ReviewBtn = (
    <button
      type="button"
      onClick={() => onOpenReviews(spot)}
      className="flex-1 py-1.5 md:py-2 bg-editorial-black dark:bg-accent text-white text-[9px] md:text-[10px] uppercase tracking-[0.12em] md:tracking-[0.15em] font-bold hover:bg-accent dark:hover:brightness-90 transition-colors"
    >
      Open Reviews
    </button>
  );

  const CoffeeBtn = coffeeUrl && !isOwnSpot ? (
    <a
      href={coffeeUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex items-center justify-center gap-1.5 flex-1 py-1.5 md:py-2 bg-[#FFDD00] text-[#000000] text-[9px] md:text-[10px] uppercase tracking-[0.12em] font-bold hover:brightness-95 transition-all"
    >
      <img src={BUY_ME_A_COFFEE_ICON_URL} alt="" className="w-3.5 h-3.5" />
      Support
    </a>
  ) : null;

  return (
    <div className="border border-editorial-black/10 p-2 md:p-2.5 bg-primary-bg">
      {isPortrait ? (
        <div className="flex gap-2 md:gap-3 items-stretch">
          <div className="flex-1 flex flex-col gap-1.5 md:gap-2 min-w-0">
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onFilterByUser?.(spot.userId, spot.userName); }}
                className="text-[7px] md:text-[8px] uppercase tracking-widest font-black text-accent text-left hover:underline"
              >
                {spot.userName}
              </button>
              <h3 className="font-serif italic text-sm md:text-base text-editorial-black leading-tight line-clamp-2">{spot.title}</h3>
            </div>

            <div className="border-t border-editorial-black/5 pt-1.5">
              <p
                ref={descRef}
                className={`text-[9px] md:text-[10px] text-editorial-black/55 leading-relaxed italic ${descExpanded ? '' : 'line-clamp-3'}`}
              >
                {spot.description}
              </p>
              {(isClamped || descExpanded) && (
                <button
                  type="button"
                  onClick={() => setDescExpanded((v) => !v)}
                  className="flex items-center gap-0.5 mt-0.5 text-[8px] font-bold uppercase tracking-widest text-accent hover:opacity-70 transition-opacity"
                >
                  {descExpanded ? <><ChevronUp className="w-2.5 h-2.5" />Less</> : <><ChevronDown className="w-2.5 h-2.5" />More</>}
                </button>
              )}
            </div>

            <div className="border-t border-editorial-black/5 pt-1.5 mt-0.5">
              {RatingRow}
              <div className="flex flex-col gap-1.5">
                {ReviewBtn}
                {CoffeeBtn}
                {!isOwnSpot && (
                  <button
                    type="button"
                    onClick={() => onReportSpot?.(spot)}
                    className="w-full py-1.5 md:py-2 border border-editorial-black/20 text-editorial-black text-[9px] md:text-[10px] uppercase tracking-[0.12em] font-bold hover:bg-editorial-black/5 transition-colors"
                  >
                    Report Image
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="w-[82px] md:w-[110px] bg-secondary-bg flex items-center justify-center overflow-hidden flex-shrink-0 relative">
            <img
              src={spot.imageUrl}
              alt={spot.title}
              className="w-full h-full object-contain aspect-[9/16]"
            />
            {!isOwnSpot && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReportSpot?.(spot);
                }}
                className="absolute bottom-1.5 right-1.5 z-[2] w-6 h-6 rounded-full bg-editorial-black/85 text-white hover:bg-accent transition-colors flex items-center justify-center"
                title="Report image"
              >
                <TriangleAlert className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 md:gap-2">
          <div className="w-full bg-secondary-bg flex items-center justify-center overflow-hidden aspect-video relative">
            <img
              src={spot.imageUrl}
              alt={spot.title}
              className="w-full h-full object-contain"
            />
            {!isOwnSpot && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReportSpot?.(spot);
                }}
                className="absolute bottom-1.5 right-1.5 z-[2] w-6 h-6 rounded-full bg-editorial-black/85 text-white hover:bg-accent transition-colors flex items-center justify-center"
                title="Report image"
              >
                <TriangleAlert className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onFilterByUser?.(spot.userId, spot.userName); }}
              className="text-[7px] md:text-[8px] uppercase tracking-widest font-black text-accent text-left hover:underline"
            >
              {spot.userName}
            </button>
            <h3 className="font-serif italic text-sm md:text-lg text-editorial-black leading-tight line-clamp-2">{spot.title}</h3>
          </div>

          <div className="border-t border-editorial-black/5 pt-1.5 md:pt-2">
            <p
              ref={descRef}
              className={`text-[9px] md:text-[10px] text-editorial-black/55 leading-relaxed italic ${descExpanded ? '' : 'line-clamp-2'}`}
            >
              {spot.description}
            </p>
            {(isClamped || descExpanded) && (
              <button
                type="button"
                onClick={() => setDescExpanded((v) => !v)}
                className="flex items-center gap-0.5 mt-0.5 text-[8px] font-bold uppercase tracking-widest text-accent hover:opacity-70 transition-opacity"
              >
                {descExpanded ? <><ChevronUp className="w-2.5 h-2.5" />Less</> : <><ChevronDown className="w-2.5 h-2.5" />More</>}
              </button>
            )}
          </div>

          <div className="border-t border-editorial-black/5 pt-1.5 md:pt-2 mt-0.5 md:mt-1">
            {RatingRow}
            <div className="flex gap-1.5">
              {ReviewBtn}
              {CoffeeBtn}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
