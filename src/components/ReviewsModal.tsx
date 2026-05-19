import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Loader2, Star } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { PhotoSpot, Review } from '../types';
import ActionLoadingOverlay from './ActionLoadingOverlay';

interface ReviewsModalProps {
    isOpen: boolean;
    onClose: () => void;
    spot: PhotoSpot | null;
    onReviewAdded: () => void;
    existingReview?: Review | null;
}

export default function ReviewsModal({ isOpen, onClose, spot, onReviewAdded, existingReview }: ReviewsModalProps) {
    const [rating, setRating] = useState(5);
    const [text, setText] = useState('');
    const [loading, setLoading] = useState(false);
    const [hoveredRating, setHoveredRating] = useState(0);

    React.useEffect(() => {
        if (!isOpen) {
            return;
        }

        setRating(existingReview?.rating || 5);
        setText(existingReview?.text || '');
    }, [isOpen, existingReview]);

    if (!isOpen || !spot) return null;

    const handleSubmitReview = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!auth.currentUser || !text.trim()) return;

        setLoading(true);
        try {
            const reviewRef = doc(db, 'reviews', spot.id, 'reviews', auth.currentUser.uid);
            const persistedReview = await getDoc(reviewRef);

            if (!existingReview && persistedReview.exists()) {
                alert('You already reviewed this item. Only one review per account is allowed.');
                setLoading(false);
                return;
            }

            const reviewData: Record<string, unknown> = {
                id: auth.currentUser.uid,
                spotId: spot.id,
                userId: auth.currentUser.uid,
                userName: auth.currentUser.displayName || 'Anonymous',
                userPhotoURL: auth.currentUser.photoURL || '',
                rating,
                text: text.trim(),
            };

            if (!persistedReview.exists()) {
                reviewData.createdAt = serverTimestamp();
            }

            await setDoc(reviewRef, reviewData, { merge: true });

            setText('');
            setRating(5);
            onReviewAdded();
            onClose();
        } catch (err) {
            console.error('Review submission error:', err);
            alert('Failed to submit review. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-editorial-black/60 backdrop-blur-md">
            <ActionLoadingOverlay isOpen={loading} label={existingReview ? 'Updating Review' : 'Adding Review'} />
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-primary-bg rounded-none w-full max-w-xl overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.3)] flex flex-col max-h-[95vh] border border-editorial-black/10"
            >
                <div className="p-8 border-b border-editorial-black/5 flex justify-between items-center bg-primary-bg">
                    <div className="space-y-1">
                        <p className="text-[9px] uppercase tracking-[0.3em] font-bold text-accent">Share Your Perspective</p>
                        <h2 className="text-4xl font-serif italic tracking-tighter">{existingReview ? 'Edit Review' : 'Review'}</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-editorial-black/5 rounded-full transition-colors">
                        <X className="w-5 h-5 opacity-40 hover:opacity-100" />
                    </button>
                </div>

                <form onSubmit={handleSubmitReview} className="p-10 space-y-8 overflow-y-auto">
                    <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-[0.2em] font-black text-editorial-black/40">Location</p>
                        <p className="font-serif italic text-lg text-editorial-black">{spot.title}</p>
                        <p className="text-[10px] text-editorial-black/50">{spot.description}</p>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-editorial-black/40 mb-4">
                                Rating
                            </label>
                            <div className="flex gap-3 justify-center">
                                {[1, 2, 3, 4, 5].map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setRating(value)}
                                        onMouseEnter={() => setHoveredRating(value)}
                                        onMouseLeave={() => setHoveredRating(0)}
                                        className="transition-transform hover:scale-110"
                                    >
                                        <Star
                                            className={`w-8 h-8 ${value <= (hoveredRating || rating)
                                                ? 'fill-accent text-accent'
                                                : 'text-editorial-black/20'
                                                }`}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-editorial-black/40 mb-2">
                                Your Thoughts
                            </label>
                            <textarea
                                rows={5}
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                maxLength={500}
                                required
                                className="w-full bg-transparent border border-editorial-black/5 p-4 text-xs font-light leading-relaxed outline-none focus:border-accent transition-colors resize-none"
                                placeholder="Share your experience at this location..."
                            />
                            <p className="text-[8px] text-editorial-black/40 mt-2">{text.length}/500</p>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !text.trim()}
                        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-editorial-black text-white text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-accent transition-colors disabled:opacity-30"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : existingReview ? 'Update Review' : 'Submit Review'}
                    </button>
                </form>
            </motion.div>
        </div>
    );
}
