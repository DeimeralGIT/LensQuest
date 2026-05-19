import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Loader2, MapPin, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, storage } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { PhotoSpot, SPOT_CATEGORIES } from '../types';
import { checkUploadLimit, recordUpload, UploadLimitError } from '../lib/uploadLimit';
import UploadLimitErrorModal from './UploadLimitErrorModal';
import ActionLoadingOverlay from './ActionLoadingOverlay';

interface AddSpotModalProps {
  isOpen: boolean;
  onClose: () => void;
  location: { lat: number; lng: number } | null;
  spotToEdit?: PhotoSpot | null;
}

declare global {
  interface Window {
    google: any;
  }
}

export default function AddSpotModal({ isOpen, onClose, location, spotToEdit }: AddSpotModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(location);
  const [placeSuggestions, setPlaceSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const autocompleteRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(spotToEdit);

  // Initialize Places Autocomplete Service
  useEffect(() => {
    if (isOpen && window.google?.maps?.places?.AutocompleteService) {
      try {
        autocompleteRef.current = new window.google.maps.places.AutocompleteService();
      } catch (e) {
        console.error('Failed to initialize AutocompleteService:', e);
      }
    }
  }, [isOpen]);

  // Pre-fill location if available
  useEffect(() => {
    if (spotToEdit) {
      return;
    }

    if (location) {
      setCoordinates(location);
      // Reverse geocode to get place name
      if (window.google?.maps?.Geocoder) {
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ location }, (results: any[], status: string) => {
          if (status === 'OK' && results[0]) {
            const result = results[0];
            // Extract street number and route
            let streetNumber = '';
            let route = '';
            let city = '';
            let country = '';

            if (result.address_components) {
              result.address_components.forEach((component: any) => {
                const types = component.types || [];
                if (types.includes('street_number')) streetNumber = component.long_name;
                if (types.includes('route')) route = component.long_name;
                if (types.includes('locality')) city = component.long_name;
                if (types.includes('country')) country = component.long_name;
              });
            }

            // Create clean title
            const streetPart = [streetNumber, route].filter(Boolean).join(' ');
            const title = [streetPart, city, country].filter(Boolean).join(', ');
            setTitle(title || result.formatted_address || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`);
          } else {
            setTitle(`${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`);
          }
        });
      } else {
        setTitle(`${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`);
      }
    }
  }, [location, isOpen, spotToEdit]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (spotToEdit) {
      setTitle(spotToEdit.title || '');
      setDescription(spotToEdit.description || '');
      setCategory(spotToEdit.category || '');
      setCoordinates(spotToEdit.location || null);
      setPreview(spotToEdit.imageUrl || null);
      setImage(null);
      setPlaceSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setTitle('');
    setDescription('');
    setCategory('');
    setShowCategoryMenu(false);
    setImage(null);
    setPreview(null);
    setCoordinates(location || null);
    setPlaceSuggestions([]);
    setShowSuggestions(false);
  }, [isOpen, spotToEdit, location]);

  const handlePlaceSearch = (input: string) => {
    if (!input.trim()) {
      setPlaceSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    try {
      if (window.google?.maps?.places?.AutocompleteService) {
        const service = autocompleteRef.current || new window.google.maps.places.AutocompleteService();
        service.getPlacePredictions(
          {
            input,
            types: ['address'],
          },
          (predictions: any[] = [], status: string) => {
            if (status === 'OK' && predictions.length > 0) {
              setPlaceSuggestions(predictions);
              setShowSuggestions(true);
            } else {
              setPlaceSuggestions([]);
              setShowSuggestions(false);
            }
          }
        );
      }
    } catch (err) {
      console.error('Places error:', err);
      setShowSuggestions(false);
    }
  };

  const geocodeTitleToCoordinates = async (queryText: string): Promise<{ lat: number; lng: number } | null> => {
    if (!queryText.trim() || !window.google?.maps?.Geocoder) {
      return null;
    }

    return new Promise((resolve) => {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: queryText.trim() }, (results: any[], status: string) => {
        if (status === 'OK' && results?.[0]?.geometry?.location) {
          resolve({
            lat: results[0].geometry.location.lat(),
            lng: results[0].geometry.location.lng(),
          });
          return;
        }
        resolve(null);
      });
    });
  };

  const handlePlaceSelect = (prediction: any) => {
    // Use the full description as title (has city, country, etc)
    setTitle(prediction.description);
    setPlaceSuggestions([]);
    setShowSuggestions(false);

    // Get place details to get coordinates and formatted address
    try {
      if (window.google?.maps?.places?.PlacesService) {
        const map = new window.google.maps.Map(document.createElement('div'));
        const service = new window.google.maps.places.PlacesService(map);
        service.getDetails(
          { placeId: prediction.place_id, fields: ['geometry', 'formatted_address', 'address_components'] },
          (result: any, status: string) => {
            if (status === 'OK' && result?.geometry?.location) {
              const loc = {
                lat: result.geometry.location.lat(),
                lng: result.geometry.location.lng(),
              };
              setCoordinates(loc);
              // Extract street number and route from address components
              let streetNumber = '';
              let route = '';
              let city = '';
              let country = '';

              if (result.address_components) {
                result.address_components.forEach((component: any) => {
                  const types = component.types || [];
                  if (types.includes('street_number')) streetNumber = component.long_name;
                  if (types.includes('route')) route = component.long_name;
                  if (types.includes('locality')) city = component.long_name;
                  if (types.includes('country')) country = component.long_name;
                });
              }

              // Create clean title: "Street Name, Number, City, Country"
              const streetPart = [streetNumber, route].filter(Boolean).join(' ');
              const title = [streetPart, city, country].filter(Boolean).join(', ');
              if (title.length > 0) {
                setTitle(title);
              } else if (result.formatted_address) {
                setTitle(result.formatted_address);
              }
            }
          }
        );
      }
    } catch (err) {
      console.error('Place details error:', err);
    }
  };

  const tryResolveTypedAddress = async (rawInput: string) => {
    const candidate = rawInput.trim();
    if (!candidate || coordinates) {
      return;
    }

    const match = await geocodeTitleToCoordinates(candidate);
    if (match) {
      setCoordinates(match);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isEditing) {
      return;
    }

    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !title.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    if (!isEditing && !image) {
      alert('Please select an image');
      return;
    }

    setLoading(true);
    try {
      let resolvedCoordinates = coordinates;
      if (!resolvedCoordinates) {
        resolvedCoordinates = await geocodeTitleToCoordinates(title);
        if (resolvedCoordinates) {
          setCoordinates(resolvedCoordinates);
        }
      }

      if (!resolvedCoordinates) {
        alert('Please pick a suggested address or enter a more specific location.');
        setLoading(false);
        return;
      }

      if (isEditing && spotToEdit) {
        if (spotToEdit.userId !== auth.currentUser.uid) {
          alert('You can only edit your own spots');
          setLoading(false);
          return;
        }

        const spotRef = doc(db, 'spots', spotToEdit.id);
        await updateDoc(spotRef, {
          ...(category ? { category } : { category: '' }),
          title: title.trim(),
          description: description.trim(),
          location: resolvedCoordinates,
        });

        onClose();
        return;
      }

      // 1. Upload Image to Storage
      const timestamp = Date.now();
      const fileName = `spots/${timestamp}_${image.name}`;
      const storageRef = ref(storage, fileName);

      await uploadBytes(storageRef, image);
      const imageUrl = await getDownloadURL(storageRef);

      // 2. Save to Firestore
      const spotsRef = collection(db, 'spots');

      const spotData = {
        userId: auth.currentUser.uid,
        userName: auth.currentUser.displayName || 'Anonymous',
        userPhotoURL: auth.currentUser.photoURL || '',
        ...(category ? { category } : {}),
        title: title.trim(),
        description: description.trim(),
        location: resolvedCoordinates,
        imageUrl,
        tags: [],
        createdAt: serverTimestamp(),
        reviewCount: 0,
        averageRating: 0,
      };

      try {
        const docRef = await addDoc(spotsRef, spotData);
        console.log('Spot saved successfully:', docRef.id);
      } catch (dbErr) {
        console.error('Database error:', dbErr);
        throw new Error('Failed to save to database: ' + (dbErr instanceof Error ? dbErr.message : String(dbErr)));
      }

      // Reset form
      setTitle('');
      setDescription('');
      setCategory('');
      setShowCategoryMenu(false);
      setImage(null);
      setPreview(null);
      setCoordinates(null);

      onClose();
    } catch (err) {
      console.error('Submit error:', err);
      alert('Failed to save spot. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-editorial-black/60 backdrop-blur-md">
      <ActionLoadingOverlay isOpen={loading} label={isEditing ? 'Updating Asset' : 'Adding Asset'} />
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-primary-bg rounded-none w-full max-w-xl overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.3)] flex flex-col max-h-[95vh] border border-editorial-black/10"
      >
        <div className="p-4 md:p-8 border-b border-editorial-black/5 flex justify-between items-center bg-primary-bg">
          <div className="space-y-0.5 md:space-y-1">
            <p className="text-[8px] md:text-[9px] uppercase tracking-[0.2em] md:tracking-[0.3em] font-bold text-accent">Archive Entry</p>
            <h2 className="text-2xl md:text-4xl font-serif italic tracking-tighter">{isEditing ? 'Edit Perspective' : 'New Perspective'}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-editorial-black/5 rounded-full transition-colors flex-shrink-0">
            <X className="w-4 md:w-5 h-4 md:h-5 opacity-40 hover:opacity-100" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-4 md:space-y-6 overflow-y-auto">
          <div className="space-y-4 md:space-y-5">
            {/* Address with Places Autocomplete */}
            <div className="relative">
              <label className="block text-[9px] md:text-[10px] uppercase tracking-[0.15em] md:tracking-[0.2em] font-black text-editorial-black/40 mb-1.5 md:mb-2">Address</label>
              <div className="relative">
                <MapPin className="absolute left-0 top-1/2 -translate-y-1/2 w-3 md:w-3.5 h-3 md:h-3.5 text-accent opacity-40" />
                <input
                  ref={inputRef}
                  type="text"
                  required
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setCoordinates(null);
                    handlePlaceSearch(e.target.value);
                  }}
                  onBlur={(e) => {
                    // If user typed an existing address without selecting a suggestion, try to resolve it.
                    void tryResolveTypedAddress(e.target.value);
                  }}
                  onFocus={() => title && setShowSuggestions(true)}
                  className="w-full pl-5 md:pl-6 bg-transparent border-b border-editorial-black/10 py-2 md:py-3 text-base md:text-lg font-serif italic outline-none focus:border-accent transition-colors"
                  placeholder="Where did the moment occur?"
                />
              </div>

              {/* Places Suggestions Dropdown */}
              <AnimatePresence>
                {showSuggestions && placeSuggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 right-0 mt-1 bg-primary-bg border border-editorial-black/10 shadow-lg z-20 rounded-none"
                  >
                    {placeSuggestions.map((prediction, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handlePlaceSelect(prediction)}
                        className="w-full text-left px-4 py-2 text-[10px] border-b border-editorial-black/5 hover:bg-secondary-bg transition-colors last:border-b-0"
                      >
                        <p className="font-semibold text-editorial-black">{prediction.structured_formatting?.main_text || prediction.description}</p>
                        <p className="text-editorial-black/50 text-[9px]">{prediction.structured_formatting?.secondary_text || ''}</p>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {coordinates && (
                <p className="text-[8px] text-accent mt-2 opacity-60">
                  Coordinates: {coordinates.lat.toFixed(4)}, {coordinates.lng.toFixed(4)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-[9px] md:text-[10px] uppercase tracking-[0.15em] md:tracking-[0.2em] font-black text-editorial-black/40 mb-1.5 md:mb-2">Observation Notes</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-transparent border border-editorial-black/5 p-2.5 md:p-4 text-xs md:text-sm font-light leading-relaxed outline-none focus:border-accent transition-colors resize-none"
                placeholder="Describe the atmosphere, light, and geometry..."
              />
            </div>

            <div className="relative">
              <label className="block text-[9px] md:text-[10px] uppercase tracking-[0.15em] md:tracking-[0.2em] font-black text-editorial-black/40 mb-1.5 md:mb-2">Category (Optional)</label>
              <button
                type="button"
                onClick={() => setShowCategoryMenu((prev) => !prev)}
                className="w-full border border-editorial-black/10 px-3 py-2 md:px-4 md:py-3 text-left text-xs md:text-sm flex items-center justify-between hover:border-accent transition-colors"
              >
                <span className={category ? 'text-editorial-black' : 'text-editorial-black/40'}>
                  {category || 'Select category'}
                </span>
                <ChevronDown className={`w-4 h-4 opacity-60 transition-transform ${showCategoryMenu ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showCategoryMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute z-30 mt-1 w-full max-h-52 overflow-y-auto border border-editorial-black/10 bg-primary-bg shadow-xl"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setCategory('');
                        setShowCategoryMenu(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs md:text-sm hover:bg-secondary-bg"
                    >
                      None
                    </button>
                    {SPOT_CATEGORIES.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          setCategory(option);
                          setShowCategoryMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs md:text-sm hover:bg-secondary-bg"
                      >
                        {option}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* AI Metadata removed */}

          <div
            onClick={() => {
              if (!isEditing) {
                document.getElementById('image-upload')?.click();
              }
            }}
            className={`group relative border border-editorial-black/5 bg-secondary-bg aspect-video flex flex-col items-center justify-center overflow-hidden ${isEditing ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {preview ? (
              <>
                <img src={preview} alt="Preview" className="w-full h-full object-cover transition-all duration-700" />
                {!isEditing && (
                  <div className="absolute inset-0 bg-editorial-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <p className="text-white text-[10px] uppercase tracking-widest font-bold">Replace Asset</p>
                  </div>
                )}
                {isEditing && (
                  <div className="absolute inset-0 bg-editorial-black/35 flex items-center justify-center">
                    <p className="text-white text-[10px] uppercase tracking-widest font-bold">Image locked in edit mode</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center p-8">
                <Upload className="w-6 h-6 text-accent mx-auto mb-4 opacity-40" />
                <p className="text-[10px] uppercase tracking-[0.3em] font-bold opacity-30">Import Visual Asset</p>
              </div>
            )}
            <input
              id="image-upload"
              type="file"
              accept="image/*"
              className="hidden"
              disabled={isEditing}
              onChange={handleImageChange}
            />
          </div>

          <div className="pt-4 md:pt-6 flex gap-3 md:gap-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 md:py-4 text-[9px] md:text-[10px] uppercase tracking-[0.15em] md:tracking-[0.2em] font-bold opacity-40 hover:opacity-100 transition-opacity"
            >
              Discard
            </button>
            <button
              type="submit"
              disabled={loading || !coordinates || !title.trim() || (!isEditing && !image)}
              className="flex-[2] py-3 md:py-4 bg-editorial-black text-white text-[9px] md:text-[10px] uppercase tracking-[0.2em] md:tracking-[0.3em] font-bold hover:bg-accent transition-all shadow-2xl disabled:opacity-30"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : isEditing ? 'Update Text' : 'Commit Asset'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
