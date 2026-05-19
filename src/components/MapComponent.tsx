import { APIProvider, Map, AdvancedMarker, Pin, InfoWindow, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import React, { useState } from 'react';
import { PhotoSpot } from '../types';
import { Camera, MapPin } from 'lucide-react';

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';

interface MapComponentProps {
  spots: PhotoSpot[];
  onSpotSelect: (spot: PhotoSpot) => void;
  onMapClick: (latLng: { lat: number; lng: number }) => void;
  center: { lat: number; lng: number };
  zoom: number;
  onCameraChange: (ev: { detail: { center: { lat: number; lng: number }; zoom: number } }) => void;
}

export default function MapComponent({ spots, onSpotSelect, onMapClick, center, zoom, onCameraChange }: MapComponentProps) {
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);

  const selectedSpot = spots.find(s => s.id === selectedSpotId);

  return (
    <Map
      center={center}
      zoom={zoom}
      onCameraChanged={onCameraChange}
      mapId="LENSQUEST_MAP"
      className="w-full h-full"
      disableDefaultUI={true}
      onClick={(e) => {
        if (e.detail.latLng) {
          onMapClick(e.detail.latLng);
        }
      }}
      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
    >
      {spots.map(spot => (
        <SpotMarker 
          key={spot.id} 
          spot={spot} 
          isSelected={selectedSpotId === spot.id}
          onSelect={() => {
            setSelectedSpotId(spot.id);
            onSpotSelect(spot);
          }}
          onClose={() => setSelectedSpotId(null)}
        />
      ))}
    </Map>
  );
}

function SpotMarker({ spot, isSelected, onSelect, onClose, key }: { 
  spot: PhotoSpot; 
  isSelected: boolean; 
  onSelect: () => void;
  onClose: () => void;
  key?: string;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={spot.location}
        onClick={onSelect}
      >
        <Pin background={"#1A1A1A"} glyphColor={"#C48F5D"} borderColor={"#1A1A1A"}>
          <Camera className="w-3 h-3" />
        </Pin>
      </AdvancedMarker>
      
      {isSelected && (
        <InfoWindow anchor={marker} onCloseClick={onClose} headerDisabled={true}>
          <div className="p-4 min-w-[240px] bg-primary-bg overflow-hidden flex flex-col gap-3 border-none">
            <img 
              src={spot.imageUrl} 
              alt={spot.title} 
              className="w-full h-32 object-cover grayscale opacity-80"
            />
            <div className="space-y-1">
              <p className="text-[8px] uppercase tracking-widest font-black text-accent">{spot.userName}</p>
              <h3 className="font-serif italic text-xl text-editorial-black">{spot.title}</h3>
            </div>
            <p className="text-[10px] text-editorial-black/50 line-clamp-2 leading-relaxed italic border-t border-editorial-black/5 pt-3">
              {spot.description}
            </p>
          </div>
        </InfoWindow>
      )}
    </>
  );
}
