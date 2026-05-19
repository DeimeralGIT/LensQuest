import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { PhotoSpot } from './types';
import MapComponent from './components/MapComponent';
import AddSpotModal from './components/AddSpotModal';
import AdBanner from './components/AdBanner';
import { Camera, Map as MapIcon, Grid, Plus, LogIn, LogOut, Search, Sparkles, LocateFixed, Aperture } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { APIProvider } from '@vis.gl/react-google-maps';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [spots, setSpots] = useState<PhotoSpot[]>([]);
  const [view, setView] = useState<'map' | 'gallery'>('map');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 40.7128, lng: -74.0060 });
  const [mapZoom, setMapZoom] = useState(12);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => setUser(u));
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setMapCenter({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => console.error("Error getting location", error)
      );
    }

    const q = query(collection(db, 'spots'), orderBy('createdAt', 'desc'));
    const unsubSpots = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as PhotoSpot[];
      setSpots(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'spots');
    });

    return () => {
      unsubAuth();
      unsubSpots();
    };
  }, []);

  const handleLocateUser = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setMapCenter({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          setMapZoom(15);
        },
        (error) => alert("Could not access your location. Please check permissions.")
      );
    }
  };

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-primary-bg p-12 text-center">
        <div className="space-y-4 max-w-lg">
          <p className="text-[10px] uppercase font-bold tracking-[0.4em] text-accent">Internal Engine Locked</p>
          <h2 className="text-5xl font-serif italic tracking-tighter text-editorial-black">Missing Map Credentials</h2>
          <p className="text-sm font-light text-editorial-black/60 leading-relaxed pt-4">
            Integration with Google Maps Platform is required to visualize the LensQuest coordinate database. 
            Please configure <code>GOOGLE_MAPS_PLATFORM_KEY</code> in the project environment.
          </p>
        </div>
      </div>
    );
  }
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      console.error(err);
    }
  };

  const handleMapClick = (latLng: { lat: number; lng: number }) => {
    if (!user) {
      handleLogin();
      return;
    }
    setSelectedLocation(latLng);
    setIsModalOpen(true);
  };

  const filteredSpots = spots.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
      <div className="flex flex-col h-screen bg-primary-bg overflow-hidden font-sans text-editorial-black">
      {/* Navbar */}
      <header className="bg-primary-bg border-b border-editorial-black/10 px-10 h-20 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-editorial-black rounded-lg flex items-center justify-center text-white shadow-xl shadow-editorial-black/20">
            <Aperture className="w-6 h-6 animate-[spin_10s_linear_infinite]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-serif italic text-3xl tracking-tighter">LensQuest</span>
            <span className="text-[9px] uppercase tracking-[0.4em] font-bold opacity-30 hidden lg:inline">Aesthetics Discovery</span>
          </div>
        </div>

        <div className="flex-1 max-w-sm mx-12 hidden md:block">
          <div className="relative group">
            <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-editorial-black opacity-30 group-focus-within:opacity-100 transition-opacity" />
            <input 
              type="text" 
              placeholder="SEARCH LOCATIONS..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-6 pr-4 py-2 bg-transparent border-b border-editorial-black/5 focus:border-editorial-black/20 text-[10px] tracking-widest uppercase outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex items-center gap-8">
          <nav className="flex gap-8 text-[10px] uppercase tracking-[0.25em] font-bold">
            <button 
              onClick={() => setView('map')}
              className={`hover:text-accent transition-colors ${view === 'map' ? 'text-accent' : 'opacity-40'}`}
            >
              The Map
            </button>
            <button 
              onClick={() => setView('gallery')}
              className={`hover:text-accent transition-colors ${view === 'gallery' ? 'text-accent' : 'opacity-40'}`}
            >
              Collections
            </button>
          </nav>

          <div className="h-4 w-px bg-editorial-black/10 mx-2" />

          {user ? (
            <div className="flex items-center gap-4">
              <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full grayscale hover:grayscale-0 transition-all border border-editorial-black/10" />
              <button 
                onClick={() => auth.signOut()}
                className="text-[10px] uppercase tracking-widest font-bold opacity-40 hover:opacity-100 transition-opacity"
              >
                Exit
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="bg-editorial-black text-white px-6 py-2 rounded-full text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-accent transition-colors shadow-xl shadow-editorial-black/10"
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative">
        <AnimatePresence mode="wait">
          {view === 'map' ? (
            <motion.div 
              key="map"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-secondary-bg"
            >
              <MapComponent 
                spots={filteredSpots} 
                onSpotSelect={(s) => console.log('Selected spot', s)} 
                onMapClick={handleMapClick}
                center={mapCenter}
                zoom={mapZoom}
                onCameraChange={(ev) => {
                  setMapCenter(ev.detail.center);
                  setMapZoom(ev.detail.zoom);
                }}
              />
              
              <div className="absolute top-10 left-10 p-6 bg-white/95 backdrop-blur-lg border border-editorial-black/5 shadow-2xl max-w-xs pointer-events-none">
                <p className="text-[9px] uppercase tracking-[0.2em] font-black mb-2 text-accent">Active Exploration</p>
                <p className="font-serif italic text-lg leading-snug">Mark your coordinates to archive a new perspective.</p>
                <p className="text-[10px] opacity-40 mt-3 border-t border-editorial-black/5 pt-3 tracking-wide">Interactive Map Engine v1.0</p>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="gallery"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute inset-0 overflow-y-auto p-8"
            >
              <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredSpots.map(spot => (
                    <SpotCard key={spot.id} spot={spot} />
                  ))}
                  
                  {filteredSpots.length === 0 && (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400">
                      <Camera className="w-16 h-16 mb-4 opacity-20" />
                      <p className="text-lg font-medium">No spots found yet.</p>
                      <button onClick={() => setView('map')} className="mt-4 text-black font-bold underline">Go to Map</button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Action Buttons */}
        <div className="absolute bottom-32 right-12 flex flex-col gap-4 z-20">
          <button 
            onClick={handleLocateUser}
            className="w-14 h-14 bg-white text-editorial-black rounded-full shadow-2xl flex items-center justify-center hover:bg-accent hover:text-white transition-all group border border-editorial-black/5"
            title="My Location"
          >
            <LocateFixed className="w-6 h-6 group-hover:scale-110 transition-transform" />
          </button>
          
          {user && (
            <button 
              onClick={() => {
                setSelectedLocation(null);
                setIsModalOpen(true);
              }}
              className="w-14 h-14 bg-editorial-black text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-accent hover:scale-110 active:scale-95 transition-all group"
              title="Add Spot"
            >
              <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform duration-500" />
            </button>
          )}
        </div>
      </main>

      <AddSpotModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        location={selectedLocation}
      />
      <AdBanner />
    </div>
    </APIProvider>
  );
}

function SpotCard({ spot, key }: { spot: PhotoSpot, key?: string }) {
  return (
    <motion.div 
      layout
      className="group bg-white border border-editorial-black/5 overflow-hidden flex flex-col h-full"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-secondary-bg">
        <img 
          src={spot.imageUrl} 
          alt={spot.title}
          className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-1000 ease-out" 
        />
        <div className="absolute top-6 left-6">
           <span className="px-3 py-1 bg-white/90 backdrop-blur-md text-[9px] font-bold uppercase tracking-[0.25em] text-editorial-black border border-editorial-black/5">
             {spot.location.lat.toFixed(2)}° N / {spot.location.lng.toFixed(2)}° W
           </span>
        </div>
      </div>
      <div className="p-8 flex flex-col flex-1 justify-between">
        <div>
          <div className="flex items-center gap-3 mb-4">
             <span className="text-[10px] uppercase tracking-[0.3em] font-bold text-accent">{spot.userName}</span>
             <div className="h-px flex-1 bg-editorial-black/5" />
          </div>
          <h3 className="font-serif italic text-3xl text-editorial-black mb-3 leading-[0.9] tracking-tighter opacity-90 group-hover:opacity-100 group-hover:text-accent transition-all">{spot.title}</h3>
          <p className="text-editorial-black/60 text-xs leading-relaxed font-light line-clamp-3">{spot.description}</p>
        </div>
        
        {spot.aiTips && (
           <div className="mt-8 pt-8 border-t border-editorial-black/5">
             <div className="flex items-center gap-2 text-accent mb-2 text-[9px] font-black uppercase tracking-[0.2em]">
               <Sparkles className="w-3 h-3" />
               Archival Metadata
             </div>
             <p className="text-[11px] text-editorial-black/40 italic leading-snug line-clamp-2">"{spot.aiTips}"</p>
           </div>
        )}
      </div>
    </motion.div>
  );
}

function MapPinIcon({ className }: { className?: string }) {
  return <MapIcon className={className} />;
}
