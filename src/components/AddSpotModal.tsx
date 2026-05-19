import React, { useState } from 'react';
import { Camera, X, Upload, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface AddSpotModalProps {
  isOpen: boolean;
  onClose: () => void;
  location: { lat: number; lng: number } | null;
}

export default function AddSpotModal({ isOpen, onClose, location }: AddSpotModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiTipsLoading, setAiTipsLoading] = useState(false);
  const [aiTips, setAiTips] = useState('');

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const getAiTips = async () => {
    if (!title) return;
    setAiTipsLoading(true);
    try {
      const res = await fetch('/api/spot-tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationName: title, description }),
      });
      const data = await res.json();
      setAiTips(data.tips);
    } catch (err) {
      console.error(err);
    } finally {
      setAiTipsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !location || !image) return;

    setLoading(true);
    try {
      // 1. Upload Image
      const storageRef = ref(storage, `spots/${Date.now()}_${image.name}`);
      await uploadBytes(storageRef, image);
      const imageUrl = await getDownloadURL(storageRef);

      // 2. Save to Firestore
      try {
        await addDoc(collection(db, 'spots'), {
          userId: auth.currentUser.uid,
          userName: auth.currentUser.displayName || 'Anonymous',
          title,
          description,
          location,
          imageUrl,
          tags: [],
          createdAt: serverTimestamp(),
          aiTips
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'spots');
      }

      onClose();
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.message.includes('authInfo')) {
        alert('Security error. Please ensure you are signed in.');
      } else {
        alert('Failed to save spot. Please check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-editorial-black/60 backdrop-blur-md">
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-primary-bg rounded-none w-full max-w-xl overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.3)] flex flex-col max-h-[95vh] border border-editorial-black/10"
      >
        <div className="p-8 border-b border-editorial-black/5 flex justify-between items-center bg-primary-bg">
          <div className="space-y-1">
            <p className="text-[9px] uppercase tracking-[0.3em] font-bold text-accent">Archive Entry</p>
            <h2 className="text-4xl font-serif italic tracking-tighter">New Perspective</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-editorial-black/5 rounded-full transition-colors">
            <X className="w-5 h-5 opacity-40 hover:opacity-100" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-10 space-y-8 overflow-y-auto">
          <div className="space-y-6">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-editorial-black/40 mb-2">Location Identifier</label>
              <input 
                type="text" 
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-transparent border-b border-editorial-black/10 py-3 text-lg font-serif italic outline-none focus:border-accent transition-colors" 
                placeholder="Where did the moment occur?"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-editorial-black/40 mb-2">Observation Notes</label>
              <textarea 
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-transparent border border-editorial-black/5 p-4 text-xs font-light leading-relaxed outline-none focus:border-accent transition-colors resize-none"
                placeholder="Describe the atmosphere, light, and geometry..."
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={getAiTips}
              disabled={!title || aiTipsLoading}
              className="flex items-center justify-center gap-3 px-6 py-4 border border-editorial-black/10 text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-secondary-bg transition-colors disabled:opacity-30"
            >
              {aiTipsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-accent" />}
              Extract AI Metadata
            </button>

            {aiTips && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-6 bg-secondary-bg border-l-2 border-l-accent text-[11px] font-serif italic leading-relaxed text-editorial-black/70"
              >
                {aiTips}
              </motion.div>
            )}
          </div>

          <div 
            onClick={() => document.getElementById('image-upload')?.click()}
            className="group relative border border-editorial-black/5 bg-secondary-bg aspect-video flex flex-col items-center justify-center cursor-pointer overflow-hidden"
          >
            {preview ? (
              <>
                <img src={preview} alt="Preview" className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" />
                <div className="absolute inset-0 bg-editorial-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                   <p className="text-white text-[10px] uppercase tracking-widest font-bold">Replace Asset</p>
                </div>
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
              onChange={handleImageChange}
            />
          </div>

          <div className="pt-8 flex gap-6">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-4 text-[10px] uppercase tracking-[0.2em] font-bold opacity-40 hover:opacity-100 transition-opacity"
            >
              Discard
            </button>
            <button 
              type="submit"
              disabled={loading || !image}
              className="flex-[2] py-4 bg-editorial-black text-white text-[10px] uppercase tracking-[0.3em] font-bold hover:bg-accent transition-all shadow-2xl disabled:opacity-30 disabled:grayscale"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Commit Asset"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
