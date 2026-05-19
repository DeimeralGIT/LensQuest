import React, { useState, useEffect, useMemo } from 'react';
import { auth, db, storage } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy, doc, getDoc, deleteDoc, updateDoc, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { PhotoSpot, SPOT_CATEGORIES, UserProfile, Review } from './types';
import MapComponent from './components/MapComponent';
import AddSpotModal from './components/AddSpotModal';
import ReviewsModal from './components/ReviewsModal';
import ReviewsListModal from './components/ReviewsListModal';
import ActionLoadingOverlay from './components/ActionLoadingOverlay';
import ProfileMenu from './components/ProfileMenu';
import ItemMenu from './components/ItemMenu';
import { Camera, Map as MapIcon, Grid, Plus, LogIn, LogOut, Search, Sparkles, LocateFixed, Aperture, X, Info, ChevronDown, TriangleAlert, Trophy, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { BUY_ME_A_COFFEE_ICON_URL, buildBuyMeCoffeeUrl } from './lib/buyMeCoffee';

const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  import.meta.env.GOOGLE_MAPS_PLATFORM_KEY ||
  '';

const ADSENSE_CLIENT = 'ca-pub-2562096237368251';
const ADSENSE_BANNER_SLOT = import.meta.env.VITE_ADSENSE_BANNER_SLOT || '';
const ADSENSE_GALLERY_SLOT = import.meta.env.VITE_ADSENSE_GALLERY_SLOT || '';

type CreatorSummary = {
  userId: string;
  userName: string;
  userPhotoURL?: string;
  totalReviews: number;
  latestPhotos: PhotoSpot[];
  topWorks: PhotoSpot[];
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [spots, setSpots] = useState<PhotoSpot[]>([]);
  const [view, setView] = useState<'map' | 'gallery' | 'creators'>('map');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReviewsListOpen, setIsReviewsListOpen] = useState(false);
  const [isReviewsModalOpen, setIsReviewsModalOpen] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<PhotoSpot | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 40.7128, lng: -74.0060 });
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mapZoom, setMapZoom] = useState(12);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [previewSpot, setPreviewSpot] = useState<PhotoSpot | null>(null);
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isMapInfoOpen, setIsMapInfoOpen] = useState(false);
  const [filterMine, setFilterMine] = useState(false);
  const [filterNearMe, setFilterNearMe] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('');
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const [editingSpot, setEditingSpot] = useState<PhotoSpot | null>(null);
  const [isDeletingSpot, setIsDeletingSpot] = useState(false);
  const [galleryImageOrientations, setGalleryImageOrientations] = useState<Record<string, boolean>>({}); // true = portrait
  const [filterByUser, setFilterByUser] = useState<{ userId: string; userName: string } | null>(null);
  const [reportingSpot, setReportingSpot] = useState<PhotoSpot | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [isLocatingUser, setIsLocatingUser] = useState(false);
  const [isDeletingReview, setIsDeletingReview] = useState(false);
  const [previewCoffeeUrl, setPreviewCoffeeUrl] = useState<string | null>(null);
  const [openCreatorId, setOpenCreatorId] = useState<string | null>(null);
  const [creatorCarouselIndex, setCreatorCarouselIndex] = useState(0);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        loadUserProfile(u.uid);
      }
    });

    if (navigator.geolocation) {
      setIsLocatingUser(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(coords);
          setMapCenter({
            lat: coords.lat,
            lng: coords.lng
          });
          setIsLocatingUser(false);
        },
        (error) => {
          console.error("Error getting location", error);
          setIsLocatingUser(false);
        }
      );
    } else {
      setIsLocatingUser(false);
    }

    // Listen to spots from Firestore
    const spotsRef = collection(db, 'spots');
    const q = query(spotsRef, orderBy('createdAt', 'desc'));
    const unsubSpots = onSnapshot(q, (snapshot) => {
      const data: PhotoSpot[] = [];
      snapshot.forEach((doc) => {
        data.push({
          ...doc.data(),
          id: doc.id,
        } as PhotoSpot);
      });
      setSpots(data);
    }, (error) => {
      console.error('Database error:', error);
    });

    return () => {
      unsubAuth();
      unsubSpots();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPreviewCoffee = async () => {
      if (!previewSpot?.userId) {
        setPreviewCoffeeUrl(null);
        return;
      }

      try {
        const snap = await getDoc(doc(db, 'users', previewSpot.userId, 'profile', 'public'));
        if (!cancelled) {
          const data = snap.exists() ? snap.data() : null;
          setPreviewCoffeeUrl(buildBuyMeCoffeeUrl(data?.buyMeCoffeeUrl));
        }
      } catch {
        if (!cancelled) {
          setPreviewCoffeeUrl(null);
        }
      }
    };

    loadPreviewCoffee();
    return () => { cancelled = true; };
  }, [previewSpot]);

  useEffect(() => {
    if (view !== 'gallery') {
      setIsCategoryFilterOpen(false);
    }
    if (view !== 'map') {
      setIsMapInfoOpen(false);
    }
  }, [view]);

  // Calculate filtered gallery spots early (needed by useEffect below)
  const searchedSpots = spots.filter(s =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.userName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.location && (s.location.lat.toString().includes(searchQuery) || s.location.lng.toString().includes(searchQuery)))
  );

  // Spots shown on the map — additionally filtered by user when a name is clicked
  const mapSpots = filterByUser
    ? searchedSpots.filter(s => s.userId === filterByUser.userId)
    : searchedSpots;

  const handleFilterByUser = (userId: string, userName: string) => {
    setFilterByUser({ userId, userName });
    setView('map');
    setSearchQuery('');
  };

  const getDistanceKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * (2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
  };

  const gallerySpots = searchedSpots.filter((spot) => {
    if (filterMine && (!user || spot.userId !== user.uid)) {
      return false;
    }

    if (filterNearMe) {
      const origin = userLocation || mapCenter;
      if (!origin || getDistanceKm(origin, spot.location) > 25) {
        return false;
      }
    }

    if (selectedCategoryFilter && (spot.category || '') !== selectedCategoryFilter) {
      return false;
    }

    return true;
  });

  const creators = useMemo<CreatorSummary[]>(() => {
    const byUser = new Map<string, { userName: string; userPhotoURL?: string; spots: PhotoSpot[] }>();

    spots.forEach((spot) => {
      const existing = byUser.get(spot.userId);
      if (existing) {
        existing.spots.push(spot);
        if (!existing.userPhotoURL && spot.userPhotoURL) {
          existing.userPhotoURL = spot.userPhotoURL;
        }
      } else {
        byUser.set(spot.userId, {
          userName: spot.userName,
          userPhotoURL: spot.userPhotoURL,
          spots: [spot],
        });
      }
    });

    return [...byUser.entries()]
      .map(([userId, data]) => {
        const latestPhotos = [...data.spots].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
        const topWorks = [...data.spots]
          .sort((a, b) => {
            const reviewDiff = Number(b.reviewCount || 0) - Number(a.reviewCount || 0);
            if (reviewDiff !== 0) {
              return reviewDiff;
            }
            const ratingDiff = Number(b.averageRating || 0) - Number(a.averageRating || 0);
            if (ratingDiff !== 0) {
              return ratingDiff;
            }
            return Number(b.createdAt || 0) - Number(a.createdAt || 0);
          })
          .slice(0, 5);

        return {
          userId,
          userName: data.userName,
          userPhotoURL: data.userPhotoURL,
          totalReviews: data.spots.reduce((sum, spot) => sum + Number(spot.reviewCount || 0), 0),
          latestPhotos,
          topWorks,
        };
      })
      .sort((a, b) => {
        const byReviews = b.totalReviews - a.totalReviews;
        if (byReviews !== 0) {
          return byReviews;
        }
        const aLatest = Number(a.latestPhotos[0]?.createdAt || 0);
        const bLatest = Number(b.latestPhotos[0]?.createdAt || 0);
        return bLatest - aLatest;
      });
  }, [spots]);

  const openCreator = creators.find((creator) => creator.userId === openCreatorId) || null;

  // Pre-load gallery image orientations
  useEffect(() => {
    gallerySpots.forEach(spot => {
      if (!galleryImageOrientations[spot.id]) {
        const img = new Image();
        img.onload = () => {
          const isPortrait = img.naturalHeight > img.naturalWidth;
          setGalleryImageOrientations(prev => ({ ...prev, [spot.id]: isPortrait }));
        };
        img.src = spot.imageUrl;
      }
    });
  }, [gallerySpots, galleryImageOrientations]);

  const handleLocateUser = () => {
    if (navigator.geolocation) {
      setIsLocatingUser(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setUserLocation(coords);
          setMapCenter({
            lat: coords.lat,
            lng: coords.lng
          });
          setMapZoom(15);
          setIsLocatingUser(false);
        },
        () => {
          setIsLocatingUser(false);
          alert("Could not access your location. Please check permissions.");
        }
      );
    }
  };

  // Load user profile including buyMeCoffeeUrl
  const loadUserProfile = async (userId: string) => {
    try {
      const profileRef = doc(db, 'users', userId, 'profile', 'public');
      const profileSnap = await getDoc(profileRef);
      if (profileSnap.exists()) {
        setUserProfile(profileSnap.data() as UserProfile);
      }
    } catch (err) {
      console.error('Error loading user profile:', err);
    }
  };

  // Initialize dark mode from localStorage
  useEffect(() => {
    const savedDarkMode = localStorage.getItem('lensquest-dark-mode') === 'true';
    setIsDarkMode(savedDarkMode);
    if (savedDarkMode) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  // Handle dark mode toggle
  const handleToggleDarkMode = (isDark: boolean) => {
    setIsDarkMode(isDark);
    localStorage.setItem('lensquest-dark-mode', isDark.toString());
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
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
    // Single click - find and show spot at this location
    const spotAtLocation = spots.find(s =>
      Math.abs(s.location.lat - latLng.lat) < 0.0001 &&
      Math.abs(s.location.lng - latLng.lng) < 0.0001
    );
    if (spotAtLocation) {
      setSelectedSpot(spotAtLocation);
      setIsReviewsModalOpen(false); // Close reviews modal if open
    }
  };

  const handleMapLongClick = (latLng: { lat: number; lng: number }) => {
    // Long click (right click) - open add spot modal
    if (!user) {
      handleLogin();
      return;
    }
    setEditingSpot(null);
    setSelectedLocation(latLng);
    setIsModalOpen(true);
  };

  const handleDeleteSpot = async (spotId: string) => {
    if (!user) return;

    setIsDeletingSpot(true);
    try {
      const spot = spots.find(s => s.id === spotId);
      if (!spot || spot.userId !== user.uid) {
        alert('You can only delete your own spots');
        return;
      }

      // Delete image from storage
      if (spot.imageUrl) {
        try {
          const imageRef = ref(storage, `spots/${spotId}`);
          await deleteObject(imageRef);
        } catch (err) {
          console.error('Error deleting image:', err);
        }
      }

      // Delete spot from Firestore
      await deleteDoc(doc(db, 'spots', spotId));

      // Close modals
      setSelectedSpot(null);
      setIsReviewsListOpen(false);
    } catch (err) {
      console.error('Error deleting spot:', err);
      alert('Failed to delete spot');
    } finally {
      setIsDeletingSpot(false);
    }
  };

  const handleEditSpot = (spot: PhotoSpot) => {
    if (!user || spot.userId !== user.uid) {
      alert('You can only edit your own spots');
      return;
    }
    setEditingSpot(spot);
    setIsModalOpen(true);
  };

  const handleDeleteReview = async (spotId: string, review: Review) => {
    if (!user || review.userId !== user.uid) {
      alert('You can only delete your own reviews');
      return;
    }

    setIsDeletingReview(true);
    try {
      await deleteDoc(doc(db, 'reviews', spotId, 'reviews', review.id));

      const remainingReviewsSnapshot = await getDocs(collection(db, 'reviews', spotId, 'reviews'));
      let reviewCount = 0;
      let ratingSum = 0;

      remainingReviewsSnapshot.forEach((reviewDoc) => {
        const review = reviewDoc.data() as Review;
        if (typeof review.rating === 'number') {
          reviewCount += 1;
          ratingSum += review.rating;
        }
      });

      await updateDoc(doc(db, 'spots', spotId), {
        reviewCount,
        averageRating: reviewCount > 0 ? ratingSum / reviewCount : 0,
      });
    } catch (err) {
      console.error('Error deleting review:', err);
      alert('Failed to delete review');
    } finally {
      setIsDeletingReview(false);
    }
  };

  const handleEditReview = (spot: PhotoSpot, review: Review) => {
    setSelectedSpot(spot);
    setSelectedReview(review);
    setIsReviewsModalOpen(true);
    setIsReviewsListOpen(false);
  };

  const openReportModal = (spot: PhotoSpot) => {
    if (user && spot.userId === user.uid) {
      alert('You cannot report your own image.');
      return;
    }
    setReportingSpot(spot);
    setReportReason('');
  };

  const handleSubmitImageReport = async () => {
    if (!reportingSpot || !reportReason.trim()) {
      return;
    }

    try {
      setIsSubmittingReport(true);
      const response = await fetch('/api/report-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spotId: reportingSpot.id,
          ownerUserId: reportingSpot.userId,
          ownerUserName: reportingSpot.userName,
          imageUrl: reportingSpot.imageUrl,
          title: reportingSpot.title,
          reason: reportReason.trim(),
          reporterUserId: user?.uid || null,
          reporterUserName: user?.displayName || user?.email || 'anonymous',
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(body || 'Report endpoint failed');
      }

      setReportingSpot(null);
      setReportReason('');
      alert('Report sent. Thank you.');
    } catch (err) {
      console.error('Report error:', err);
      alert('Could not send report right now.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const globalLoadingLabel = isSubmittingReport
    ? 'Sending Report'
    : isDeletingSpot
      ? 'Deleting Asset'
      : isDeletingReview
        ? 'Deleting Review'
        : isLocatingUser
          ? 'Locating You'
          : null;

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly" libraries={['places']}>
      <div className="flex flex-col h-[calc(100dvh-90px)] bg-primary-bg overflow-hidden font-sans text-editorial-black">
        {/* Navbar */}
        <header className="bg-primary-bg border-b border-editorial-black/10 px-4 md:px-10 h-16 md:h-20 flex items-center justify-between z-10 gap-2 md:gap-4">
          <div className="flex items-center gap-2 md:gap-4 min-w-0">
            <div className="w-8 md:w-10 h-8 md:h-10 bg-editorial-black dark:bg-accent rounded-lg flex items-center justify-center text-white shadow-xl shadow-editorial-black/20 flex-shrink-0">
              <Aperture className="w-5 md:w-6 h-5 md:h-6 animate-[spin_10s_linear_infinite]" />
            </div>
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="font-serif italic text-lg md:text-2xl lg:text-3xl tracking-tighter whitespace-nowrap">LensQuest</span>
              <span className="text-[7px] md:text-[9px] uppercase tracking-[0.3em] md:tracking-[0.4em] font-bold opacity-30 hidden xl:inline">Aesthetics Discovery</span>
            </div>
          </div>

          <div className="flex-1 max-w-[220px] md:max-w-xs lg:max-w-sm mx-0 md:mx-4 lg:mx-8 hidden md:block">
            <div className="relative group">
              <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-editorial-black opacity-30 group-focus-within:opacity-100 transition-opacity" />
              <input
                type="text"
                placeholder="SEARCH LOCATIONS..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-6 pr-4 py-2 bg-transparent border-b border-editorial-black/5 focus:border-editorial-black/20 text-[9px] md:text-[10px] tracking-widest uppercase outline-none transition-all"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setView('gallery');
                  }
                }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-8">
            <nav className="flex gap-2 md:gap-5 lg:gap-8 text-[8px] md:text-[10px] uppercase tracking-[0.2em] md:tracking-[0.25em] font-bold whitespace-nowrap">
              <button
                onClick={() => setView('map')}
                className={`hover:text-accent transition-colors ${view === 'map' ? 'text-accent' : 'opacity-40'}`}
              >
                Map
              </button>
              <button
                onClick={() => setView('gallery')}
                className={`hover:text-accent transition-colors ${view === 'gallery' ? 'text-accent' : 'opacity-40'}`}
              >
                Gallery
              </button>
              <button
                onClick={() => setView('creators')}
                className={`hover:text-accent transition-colors ${view === 'creators' ? 'text-accent' : 'opacity-40'}`}
              >
                Top Creators
              </button>
            </nav>

            <div className="h-3 md:h-4 w-px bg-editorial-black/10 mx-1 md:mx-2" />

            {user ? (
              <div className="flex items-center gap-2 md:gap-4 relative">
                <button
                  onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                  className="w-6 md:w-8 h-6 md:h-8 rounded-full border-2 border-editorial-black/10 hover:border-accent transition-colors overflow-hidden hover:shadow-lg"
                >
                  <img src={user.photoURL || ''} alt="" className="w-full h-full object-cover" />
                </button>
                <ProfileMenu
                  isOpen={isProfileMenuOpen}
                  onClose={() => setIsProfileMenuOpen(false)}
                  onLogout={() => auth.signOut()}
                  isDarkMode={isDarkMode}
                  onToggleDarkMode={handleToggleDarkMode}
                  buyMeCoffeeUrl={userProfile?.buyMeCoffeeUrl}
                />
              </div>
            ) : (
              <button
                onClick={handleLogin}
                className="bg-editorial-black text-white px-3 md:px-6 py-1.5 md:py-2 rounded-full text-[8px] md:text-[10px] uppercase tracking-[0.15em] md:tracking-[0.2em] font-bold hover:bg-accent transition-colors shadow-xl shadow-editorial-black/10"
              >
                Sign In
              </button>
            )}
          </div>
        </header>

        {/* Mobile search below appbar */}
        <div className="md:hidden absolute top-16 left-0 right-0 z-10 px-4 pt-4 pointer-events-none">
          <div className={`rounded-xl border border-editorial-black/15 bg-primary-bg/95 backdrop-blur-md shadow-lg px-3 py-2 ${isProfileMenuOpen ? 'pointer-events-none' : 'pointer-events-auto'}`}>
            <div className="relative group">
              <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-editorial-black/60 group-focus-within:text-editorial-black transition-colors" />
              <input
                type="text"
                placeholder="SEARCH LOCATIONS..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-6 pr-2 py-1.5 bg-transparent text-[9px] tracking-widest uppercase outline-none transition-all"
                readOnly={isProfileMenuOpen}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setView('gallery');
                  }
                }}
              />
            </div>
          </div>
        </div>

        {/* User filter banner */}
        {filterByUser && (
          <div className="absolute top-[calc(4rem+80px)] md:top-[calc(5rem+16px)] left-0 right-0 flex justify-center z-30 pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-2 bg-accent px-4 py-2 rounded-full shadow-lg">
              <span className="text-[11px] md:text-[12px] font-black uppercase tracking-widest text-editorial-black">
                {filterByUser.userName}
              </span>
              <button
                type="button"
                onClick={() => setFilterByUser(null)}
                className="w-4 h-4 flex items-center justify-center rounded-full bg-editorial-black/10 hover:bg-editorial-black/20 transition-colors"
              >
                <X className="w-2.5 h-2.5 text-editorial-black" />
              </button>
            </div>
          </div>
        )}

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
                  spots={mapSpots}
                  onSpotSelect={(s) => {
                    setSelectedSpot(s);
                  }}
                  onOpenReviews={(s) => {
                    setSelectedSpot(s);
                    setIsReviewsListOpen(true);
                  }}
                  onOpenPreview={(s) => {
                    setPreviewSpot(s);
                  }}
                  onMapClick={handleMapClick}
                  onMapRightClick={handleMapLongClick}
                  center={mapCenter}
                  zoom={mapZoom}
                  onCameraChange={(ev) => {
                    setMapCenter(ev.detail.center);
                    setMapZoom(ev.detail.zoom);
                  }}
                  onFilterByUser={handleFilterByUser}
                  currentUserId={user?.uid}
                  onReportSpot={(spot) => {
                    openReportModal(spot);
                  }}
                />

                <button
                  type="button"
                  onClick={() => setIsMapInfoOpen((prev) => !prev)}
                  className="md:hidden absolute top-20 left-4 z-20 w-10 h-10 rounded-full bg-primary-bg/95 border border-editorial-black/10 shadow-lg flex items-center justify-center"
                  title="Map Info"
                >
                  <Info className="w-4 h-4 text-editorial-black/70" />
                </button>

                <div className="hidden md:block absolute top-4 md:top-10 left-4 md:left-10 p-4 md:p-6 bg-primary-bg/95 backdrop-blur-lg border border-editorial-black/5 shadow-2xl max-w-xs pointer-events-none">
                  <p className="text-[8px] md:text-[9px] uppercase tracking-[0.2em] font-black mb-2 text-accent">Active Exploration</p>
                  <p className="font-serif italic text-sm md:text-lg leading-snug">Long press on any location to share a photo of that place.</p>
                  <p className="text-[9px] md:text-[10px] opacity-60 mt-2 md:mt-3 border-t border-editorial-black/5 pt-2 md:pt-3 tracking-wide leading-relaxed">Explore other photographers' work to discover inspirational locations near you.</p>
                </div>

                {isMapInfoOpen && (
                  <>
                    <div
                      className="md:hidden fixed inset-0 z-[19]"
                      onClick={() => setIsMapInfoOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="md:hidden absolute top-16 left-4 right-4 z-20 p-4 bg-primary-bg/95 backdrop-blur-lg border border-editorial-black/5 shadow-2xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="text-[8px] uppercase tracking-[0.2em] font-black mb-2 text-accent">Active Exploration</p>
                      <p className="font-serif italic text-sm leading-snug">Long press on any location to share a photo of that place.</p>
                      <p className="text-[9px] opacity-60 mt-2 border-t border-editorial-black/5 pt-2 tracking-wide leading-relaxed">Explore other photographers' work to discover inspirational locations near you.</p>
                    </motion.div>
                  </>
                )}


              </motion.div>
            ) : view === 'gallery' ? (
              <motion.div
                key="gallery"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute inset-0 overflow-y-auto px-4 md:px-8 pt-4 md:pt-8"
              >
                <div className="max-w-7xl mx-auto">
                  <div className="mb-4 flex flex-wrap items-center gap-2 md:gap-3">
                    <button
                      type="button"
                      onClick={() => setFilterMine((prev) => !prev)}
                      className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] font-bold transition-colors ${filterMine ? 'bg-editorial-black text-white' : 'bg-secondary-bg text-editorial-black/70'}`}
                    >
                      My Perspectives
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterNearMe((prev) => !prev)}
                      className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] font-bold transition-colors ${filterNearMe ? 'bg-editorial-black text-white' : 'bg-secondary-bg text-editorial-black/70'}`}
                    >
                      Near Me
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsCategoryFilterOpen((prev) => !prev)}
                        className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] font-bold transition-colors flex items-center gap-1.5 ${selectedCategoryFilter ? 'bg-editorial-black text-white' : 'bg-secondary-bg text-editorial-black/70'}`}
                      >
                        {selectedCategoryFilter || 'Category'}
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {isCategoryFilterOpen && (
                        <>
                          <div className="fixed inset-0 z-20" onClick={() => setIsCategoryFilterOpen(false)} />
                          <div className="absolute top-full left-0 mt-1 z-30 w-48 bg-primary-bg border border-editorial-black/10 shadow-lg">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCategoryFilter('');
                                setIsCategoryFilterOpen(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-secondary-bg"
                            >
                              All Categories
                            </button>
                            {SPOT_CATEGORIES.map((cat) => (
                              <button
                                key={cat}
                                type="button"
                                onClick={() => {
                                  setSelectedCategoryFilter(cat);
                                  setIsCategoryFilterOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-secondary-bg"
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-6 items-start">
                    {(() => {
                      const items: React.ReactNode[] = [];
                      let rendered = 0;
                      const total = gallerySpots.filter(s => galleryImageOrientations[s.id] !== undefined).length;
                      gallerySpots.forEach((spot) => {
                        const isPortrait = galleryImageOrientations[spot.id];
                        if (isPortrait === undefined) return;
                        rendered++;
                        items.push(
                          <SpotCard
                            key={spot.id}
                            spot={spot}
                            user={user}
                            isPortrait={isPortrait}
                            onPreviewClick={() => setPreviewSpot(spot)}
                            onReviewClick={() => {
                              setSelectedSpot(spot);
                              setIsReviewsListOpen(true);
                            }}
                            onEdit={handleEditSpot}
                            onDelete={handleDeleteSpot}
                            onFilterByUser={handleFilterByUser}
                            onReport={() => { openReportModal(spot); }}
                          />
                        );
                        const isLast = rendered === total;
                        if (rendered % 20 === 0 || (isLast && total < 20)) {
                          items.push(<GalleryAdCard key={`ad-${rendered}`} />);
                        }
                      });
                      return items;
                    })()}

                    {gallerySpots.length === 0 && (
                      <div className="col-span-full py-20 flex flex-col items-center justify-center text-slate-400">
                        <Camera className="w-16 h-16 mb-4 opacity-20" />
                        <p className="text-lg font-medium">No spots found yet.</p>
                        <button onClick={() => setView('map')} className="mt-4 text-editorial-black font-bold underline">Go to Map</button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="creators"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute inset-0 overflow-y-auto px-4 md:px-8 pt-4 md:pt-8"
              >
                <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-accent" />
                    <h2 className="font-serif italic text-2xl md:text-3xl tracking-tight">Top Creators</h2>
                  </div>

                  {creators.length === 0 ? (
                    <div className="py-20 text-center text-editorial-black/40">
                      No creator data yet.
                    </div>
                  ) : (
                    creators.map((creator, idx) => (
                      <div key={creator.userId} className="bg-primary-bg border border-editorial-black/10 p-4 md:p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[8px] uppercase tracking-[0.2em] font-black text-accent">#{idx + 1} Creator</p>
                            <button
                              type="button"
                              onClick={() => handleFilterByUser(creator.userId, creator.userName)}
                              className="font-serif italic text-lg md:text-xl leading-tight hover:underline text-left"
                            >
                              {creator.userName}
                            </button>
                          </div>
                          <div className="text-right">
                            <p className="text-[8px] uppercase tracking-[0.2em] font-black text-editorial-black/40">Total Reviews</p>
                            <p className="text-xl md:text-2xl font-black text-accent">{creator.totalReviews}</p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setOpenCreatorId(creator.userId);
                            setCreatorCarouselIndex(0);
                          }}
                          className="mt-4 w-full text-left"
                        >
                          <CreatorPhotoStack photos={creator.topWorks} title={creator.userName} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Floating Action Buttons */}
          <div className="fixed bottom-[106px] right-4 flex flex-col gap-3 z-30 pointer-events-auto">
            {view === 'map' && (
              <button
                onClick={handleLocateUser}
                className="w-12 md:w-14 h-12 md:h-14 bg-primary-bg text-editorial-black rounded-full shadow-2xl flex items-center justify-center hover:bg-accent hover:text-white transition-all group border border-editorial-black/5"
                title="My Location"
              >
                <LocateFixed className="w-5 md:w-6 h-5 md:h-6 group-hover:scale-110 transition-transform" />
              </button>
            )}

            {user && (
              <button
                onClick={() => {
                  setEditingSpot(null);
                  setSelectedLocation(null);
                  setIsModalOpen(true);
                }}
                className="w-12 md:w-14 h-12 md:h-14 bg-editorial-black dark:bg-accent text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-accent dark:hover:brightness-90 hover:scale-110 active:scale-95 transition-all group"
                title="Add Spot"
              >
                <Plus className="w-5 md:w-6 h-5 md:h-6 group-hover:rotate-90 transition-transform duration-500" />
              </button>
            )}
          </div>
        </main>

        <AddSpotModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingSpot(null);
          }}
          location={selectedLocation}
          spotToEdit={editingSpot}
        />
        <ReviewsModal
          isOpen={isReviewsModalOpen}
          onClose={() => {
            setIsReviewsModalOpen(false);
            setSelectedReview(null);
          }}
          spot={selectedSpot}
          existingReview={selectedReview}
          onReviewAdded={() => {
            // Refresh spots to get updated review counts
            setSpots([...spots]);
          }}
        />
        <ReviewsListModal
          isOpen={isReviewsListOpen}
          onClose={() => setIsReviewsListOpen(false)}
          onAddReview={() => {
            setSelectedReview(null);
            setIsReviewsModalOpen(true);
          }}
          currentUserId={user?.uid}
          onEditReview={(review) => {
            if (!selectedSpot) return;
            handleEditReview(selectedSpot, review);
          }}
          onDeleteReview={(review) => {
            if (!selectedSpot) return;
            handleDeleteReview(selectedSpot.id, review);
          }}
          spot={selectedSpot}
        />

        {previewSpot && (
          <div className="fixed inset-0 z-50 bg-editorial-black/70 backdrop-blur-md flex items-center justify-center p-6 md:p-8">
            <div className="relative w-full max-w-4xl bg-primary-bg/95 shadow-2xl max-h-[88vh] overflow-y-auto">
              <button
                type="button"
                onClick={() => setPreviewSpot(null)}
                className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-editorial-black dark:bg-accent text-white flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
              <img
                src={previewSpot.imageUrl}
                alt={previewSpot.title}
                className="w-full h-auto max-h-[60vh] object-contain bg-secondary-bg"
              />

              <div className="p-4 md:p-6 border-t border-editorial-black/10 space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewSpot(null);
                    handleFilterByUser(previewSpot.userId, previewSpot.userName);
                  }}
                  className="text-[9px] uppercase tracking-widest font-black text-accent hover:underline"
                >
                  {previewSpot.userName}
                </button>

                <h3 className="font-serif italic text-xl md:text-2xl leading-tight">
                  {previewSpot.title}
                </h3>

                <p className="text-sm text-editorial-black/70 leading-relaxed">
                  {previewSpot.description}
                </p>

                <div className="flex items-center gap-1.5 text-[11px] font-bold text-editorial-black/70">
                  <Star className="w-3.5 h-3.5 text-accent" />
                  {Number(previewSpot.reviewCount || 0) > 0
                    ? `${Number(previewSpot.averageRating || 0).toFixed(1)} • ${Number(previewSpot.reviewCount || 0)} reviews`
                    : 'No reviews yet'}
                </div>

                <div className="flex flex-col md:flex-row gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewSpot(null);
                      setSelectedSpot(previewSpot);
                      setIsReviewsListOpen(true);
                    }}
                    className="flex-1 py-2 bg-editorial-black dark:bg-accent dark:hover:brightness-90 text-white text-[10px] uppercase tracking-[0.12em] font-bold hover:bg-accent transition-colors"
                  >
                    Open Reviews
                  </button>

                  {previewCoffeeUrl && previewSpot.userId !== user?.uid && (
                    <a
                      href={previewCoffeeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 bg-[#FFDD00] text-[#000000] text-[10px] uppercase tracking-[0.12em] font-bold hover:brightness-95 transition-all flex items-center justify-center gap-1.5"
                    >
                      <img src={BUY_ME_A_COFFEE_ICON_URL} alt="" className="w-4 h-4" />
                      Buy Me a Coffee
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {reportingSpot && (
          <div className="fixed inset-0 z-[70] bg-editorial-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !isSubmittingReport && setReportingSpot(null)}>
            <div className="w-full max-w-md bg-primary-bg border border-editorial-black/10 shadow-2xl p-4 md:p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <p className="text-[9px] uppercase tracking-widest font-black text-accent">Report Image</p>
                  <h3 className="font-serif italic text-lg leading-tight">{reportingSpot.title}</h3>
                </div>
                <button
                  type="button"
                  disabled={isSubmittingReport}
                  onClick={() => setReportingSpot(null)}
                  className="p-2 hover:bg-editorial-black/5 rounded-full disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <textarea
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Describe the issue with this image..."
                rows={4}
                className="w-full bg-secondary-bg border border-editorial-black/10 p-3 text-sm outline-none focus:border-accent"
              />

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={isSubmittingReport}
                  onClick={() => setReportingSpot(null)}
                  className="flex-1 py-2 border border-editorial-black/20 text-[10px] uppercase tracking-[0.12em] font-bold hover:bg-editorial-black/5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmittingReport || !reportReason.trim()}
                  onClick={handleSubmitImageReport}
                  className="flex-1 py-2 bg-editorial-black text-white text-[10px] uppercase tracking-[0.12em] font-bold hover:bg-accent disabled:opacity-50"
                >
                  {isSubmittingReport ? 'Sending...' : 'Send Report'}
                </button>
              </div>
            </div>
          </div>
        )}

        {openCreator && (
          <div
            className="fixed inset-0 z-[75] bg-editorial-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setOpenCreatorId(null)}
          >
            <div
              className="w-full max-w-4xl bg-primary-bg border border-editorial-black/10 shadow-2xl p-4 md:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-[8px] uppercase tracking-[0.2em] font-black text-accent">Top Works</p>
                  <h3 className="font-serif italic text-xl md:text-2xl leading-tight">{openCreator.userName}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenCreatorId(null)}
                  className="p-2 hover:bg-editorial-black/5 rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="relative bg-secondary-bg">
                <img
                  src={openCreator.topWorks[Math.min(creatorCarouselIndex, Math.max(0, openCreator.topWorks.length - 1))].imageUrl}
                  alt={openCreator.topWorks[Math.min(creatorCarouselIndex, Math.max(0, openCreator.topWorks.length - 1))].title}
                  className="w-full h-[50vh] object-contain"
                />

                {openCreator.topWorks.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setCreatorCarouselIndex((i) => (i - 1 + openCreator.topWorks.length) % openCreator.topWorks.length)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-editorial-black/80 text-white flex items-center justify-center"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreatorCarouselIndex((i) => (i + 1) % openCreator.topWorks.length)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-editorial-black/80 text-white flex items-center justify-center"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-editorial-black/60">
                <span>{openCreator.topWorks[Math.min(creatorCarouselIndex, Math.max(0, openCreator.topWorks.length - 1))].title}</span>
                <span>{Math.min(creatorCarouselIndex, Math.max(0, openCreator.topWorks.length - 1)) + 1} / {openCreator.topWorks.length}</span>
              </div>
            </div>
          </div>
        )}

        {/* Search Modal */}
        {isSearchModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSearchModalOpen(false)}
            className="fixed inset-0 z-40 bg-editorial-black/60 backdrop-blur-md flex items-end"
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-primary-bg border-t border-editorial-black/10 p-6 space-y-4 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-serif italic">Search Spots</h2>
                <button
                  onClick={() => setIsSearchModalOpen(false)}
                  className="p-2 hover:bg-editorial-black/5 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <input
                autoFocus
                type="text"
                placeholder="Search by location, address, title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-3 border border-editorial-black/10 focus:border-accent outline-none rounded text-sm"
              />
              <div className="space-y-3">
                {searchedSpots.map(spot => (
                  <div
                    key={spot.id}
                    onClick={() => {
                      setMapCenter(spot.location);
                      setView('map');
                      setIsSearchModalOpen(false);
                    }}
                    className="p-4 bg-secondary-bg hover:bg-editorial-black/5 cursor-pointer rounded transition-colors border-l-4 border-accent"
                  >
                    <p className="font-semibold text-sm text-accent">{spot.title}</p>
                    <p className="text-xs text-editorial-black/60 mt-2">{spot.description.substring(0, 80)}...</p>
                    <div className="flex items-center gap-2 mt-3 text-[10px] text-editorial-black/50">
                      <span>📍 {spot.location.lat.toFixed(4)}°, {spot.location.lng.toFixed(4)}°</span>
                      {Number(spot.reviewCount || 0) > 0 ? (
                        <span className="ml-auto">⭐ {Number(spot.averageRating || 0).toFixed(1)} ({Number(spot.reviewCount || 0)})</span>
                      ) : (
                        <span className="ml-auto text-[9px] font-bold uppercase tracking-[0.08em] text-accent">
                          No reviews yet
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {searchedSpots.length === 0 && (
                  <p className="text-center text-editorial-black/40 py-8">No spots found</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {globalLoadingLabel && (
          <ActionLoadingOverlay isOpen={true} label={globalLoadingLabel} />
        )}
      </div>

      {/* Fixed bottom ad banner */}
      <AdSenseBanner />
    </APIProvider>
  );
}

function SpotCard({
  spot,
  user,
  isPortrait,
  onPreviewClick,
  onReviewClick,
  onEdit,
  onDelete,
  onFilterByUser,
  onReport,
}: {
  key?: unknown
  spot: PhotoSpot
  user: User | null
  isPortrait: boolean
  onPreviewClick: () => void
  onReviewClick: () => void
  onEdit: (spot: PhotoSpot) => void
  onDelete: (spotId: string) => void
  onFilterByUser: (userId: string, userName: string) => void
  onReport: () => void
}) {
  const isOwnSpot = user && spot.userId === user.uid;
  const reviewCount = Number(spot.reviewCount || 0);
  const hasReviews = reviewCount > 0;
  const averageRating = Number(spot.averageRating || 0);

  if (isPortrait) {
    // Editorial horizontal layout for portrait images with room for longer names and addresses
    return (
      <motion.div
        layout
        onClick={onPreviewClick}
        className="group bg-primary-bg overflow-hidden flex h-full cursor-pointer hover:shadow-lg transition-all border border-editorial-black/5 relative items-stretch"
      >
        {isOwnSpot && (
          <div className="absolute top-2 right-2 z-[1]">
            <ItemMenu onEdit={() => onEdit(spot)} onDelete={() => onDelete(spot.id)} />
          </div>
        )}
        <div className="w-1/2 p-3 md:p-4 flex flex-col min-w-0">
          <div className="space-y-2 md:space-y-2.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onFilterByUser(spot.userId, spot.userName); }}
              className="text-[8px] uppercase tracking-[0.08em] font-bold text-accent line-clamp-2 leading-[1.45] pr-6 [word-break:normal] [overflow-wrap:normal] text-left hover:underline"
            >
              {spot.userName}
            </button>
            <h3 className="font-serif italic text-sm md:text-base text-editorial-black leading-[1.25] line-clamp-5 break-words text-balance pr-2">
              {spot.title}
            </h3>
          </div>
          <div className="mt-3 pt-2 border-t border-editorial-black/5 min-h-8">
            {hasReviews ? (
              <>
                <p className="text-[8px] font-bold text-accent text-left">
                  {reviewCount} • ⭐ {averageRating.toFixed(1)}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReviewClick();
                  }}
                  className="mt-1 text-[8px] font-bold uppercase tracking-[0.08em] text-editorial-black/70 hover:text-accent transition-colors text-left"
                >
                  Open reviews
                </button>
              </>
            ) : (
              <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-accent">
                No reviews yet
              </span>
            )}
          </div>
        </div>
        <div className="w-1/2 flex-shrink-0 bg-secondary-bg overflow-hidden">
          <img
            src={spot.imageUrl}
            alt={spot.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500"
          />
        </div>
        {!isOwnSpot && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReport();
            }}
            className="absolute bottom-2 right-2 z-[2] w-7 h-7 rounded-full bg-editorial-black/85 text-white text-[10px] font-black hover:bg-accent transition-colors"
            title="Report image"
          >
            <TriangleAlert className="w-3.5 h-3.5 mx-auto" />
          </button>
        )}
      </motion.div>
    );
  } else {
    // Compact vertical layout for landscape images
    return (
      <motion.div
        layout
        onClick={onPreviewClick}
        className="group bg-primary-bg overflow-hidden flex flex-col h-full cursor-pointer hover:shadow-lg transition-all border border-editorial-black/5 relative"
      >
        {isOwnSpot && (
          <div className="absolute top-2 right-2 z-[1]">
            <ItemMenu onEdit={() => onEdit(spot)} onDelete={() => onDelete(spot.id)} />
          </div>
        )}
        <div className="aspect-video bg-secondary-bg overflow-hidden">
          <img
            src={spot.imageUrl}
            alt={spot.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500"
          />
        </div>
        <div className="p-3 md:p-4 flex-1 flex flex-col justify-between min-w-0">
          <div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onFilterByUser(spot.userId, spot.userName); }}
              className="text-[8px] uppercase tracking-widest font-bold text-accent mb-1 line-clamp-1 text-left hover:underline"
            >
              {spot.userName}
            </button>
            <h3 className="font-serif italic text-sm md:text-base text-editorial-black leading-tight line-clamp-2">{spot.title}</h3>
          </div>
          {hasReviews ? (
            <div className="mt-2">
              <p className="text-[8px] font-bold text-accent text-left">
                {reviewCount} • ⭐ {averageRating.toFixed(1)}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReviewClick();
                }}
                className="mt-1 text-[8px] font-bold uppercase tracking-[0.08em] text-editorial-black/70 hover:text-accent transition-colors text-left"
              >
                Open reviews
              </button>
            </div>
          ) : (
            <span className="text-[8px] font-bold uppercase tracking-[0.1em] text-accent mt-2">
              No reviews yet
            </span>
          )}
        </div>
        {!isOwnSpot && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReport();
            }}
            className="absolute bottom-2 right-2 z-[2] w-7 h-7 rounded-full bg-editorial-black/85 text-white text-[10px] font-black hover:bg-accent transition-colors"
            title="Report image"
          >
            <TriangleAlert className="w-3.5 h-3.5 mx-auto" />
          </button>
        )}
      </motion.div>
    );
  }
}

function CreatorPhotoStack({ photos, title }: { photos: PhotoSpot[]; title: string }) {
  if (photos.length === 0) {
    return (
      <div className="h-44 md:h-52 bg-secondary-bg border border-editorial-black/10 flex items-center justify-center text-editorial-black/40 text-sm">
        No photos yet
      </div>
    );
  }

  if (photos.length === 1) {
    return (
      <div className="relative h-44 md:h-52 bg-secondary-bg border border-editorial-black/10 overflow-hidden">
        <img src={photos[0].imageUrl} alt={`${title} showcase`} className="w-full h-full object-cover" />
      </div>
    );
  }

  const stack = photos.slice(0, 3);
  return (
    <div className="relative h-44 md:h-52">
      {stack.map((photo, index) => {
        const offset = (stack.length - 1 - index) * 10;
        const rotate = (index - 1) * 2;
        return (
          <div
            key={photo.id}
            className="absolute inset-0 border border-editorial-black/10 bg-secondary-bg overflow-hidden shadow-lg"
            style={{
              transform: `translate(${offset}px, ${offset * 0.4}px) rotate(${rotate}deg)`,
              zIndex: index + 1,
            }}
          >
            <img src={photo.imageUrl} alt={photo.title} className="w-full h-full object-cover" />
          </div>
        );
      })}
    </div>
  );
}

function MapPinIcon({ className }: { className?: string }) {
  return <MapIcon className={className} />;
}

function AdSenseUnit({ slot, style }: { slot: string; style?: React.CSSProperties }) {
  const pushed = React.useRef(false);

  React.useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch {
      // ad blocked or not loaded
    }
  }, []);

  return (
    <ins
      className="adsbygoogle"
      style={{ display: 'block', ...style }}
      data-ad-client={ADSENSE_CLIENT}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}

function GalleryAdCard() {
  return (
    <div className="bg-editorial-black/[0.06] dark:bg-white/[0.04] border border-editorial-black/5 overflow-hidden flex items-stretch justify-center h-[220px] md:h-[260px]">
      {ADSENSE_GALLERY_SLOT
        ? <AdSenseUnit slot={ADSENSE_GALLERY_SLOT} style={{ width: '100%', height: '100%' }} />
        : null}
    </div>
  );
}

function AdSenseBanner() {
  const pushed = React.useRef(false);

  React.useEffect(() => {
    if (!ADSENSE_BANNER_SLOT) return;
    if (pushed.current) return;
    pushed.current = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch {
      // ad blocked or not loaded
    }
  }, []);

  return (
    <div className="fixed bottom-0 left-0 right-0 h-[90px] z-40 bg-editorial-black/[0.07] dark:bg-white/[0.04] border-t border-editorial-black/10 flex items-center justify-center overflow-hidden pointer-events-none">
      {ADSENSE_BANNER_SLOT && (
        <div className="w-full h-[90px] overflow-hidden pointer-events-auto">
          <ins
            className="adsbygoogle"
            style={{ display: 'block', width: '100%', height: '90px', minHeight: '90px', maxHeight: '90px' }}
            data-ad-client={ADSENSE_CLIENT}
            data-ad-slot={ADSENSE_BANNER_SLOT}
            data-ad-format="horizontal"
          />
        </div>
      )}
    </div>
  );
}
