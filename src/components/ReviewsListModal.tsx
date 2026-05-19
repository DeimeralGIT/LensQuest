import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Star } from 'lucide-react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PhotoSpot, Review } from '../types';
import ItemMenu from './ItemMenu';

interface ReviewsListModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddReview: () => void;
    spot: PhotoSpot | null;
    currentUserId?: string;
    onEditReview: (review: Review) => void;
    onDeleteReview: (review: Review) => void;
}

export default function ReviewsListModal({
    isOpen,
    onClose,
    onAddReview,
    spot,
    currentUserId,
    onEditReview,
    onDeleteReview,
}: ReviewsListModalProps) {
    const [reviews, setReviews] = useState<Review[]>([]);

    useEffect(() => {
        if (!isOpen || !spot) {
            setReviews([]);
            return;
        }

        const reviewsRef = collection(db, 'reviews', spot.id, 'reviews');
        const q = query(reviewsRef, orderBy('createdAt', 'desc'));

        const unsub = onSnapshot(q, (snapshot) => {
            const list: Review[] = [];
            snapshot.forEach((doc) => {
                list.push({
                    ...(doc.data() as Review),
                    id: doc.id,
                });
            });
            setReviews(list);
        });

        return () => unsub();
    }, [isOpen, spot]);

    if (!isOpen || !spot) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-editorial-black/60 backdrop-blur-md">
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-primary-bg w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-[0_30px_90px_rgba(0,0,0,0.25)] border border-editorial-black/10 flex flex-col"
            >
                <div className="p-4 md:p-6 border-b border-editorial-black/10 flex items-start justify-between gap-3">
                    <div>
                        <p className="text-[9px] uppercase tracking-[0.2em] font-black text-accent">Reviews</p>
                        <h2 className="font-serif italic text-xl md:text-2xl leading-tight">{spot.title}</h2>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 hover:bg-editorial-black/5 rounded-full">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-4 md:p-6 overflow-y-auto overflow-x-visible space-y-3">
                    {reviews.length === 0 && currentUserId !== spot.userId && (
                        <p className="text-sm text-editorial-black/50">No reviews yet. Be the first to add one.</p>
                    )}

                    {reviews.map((review) => (
                        <div key={review.id} className="relative bg-secondary-bg p-3 md:p-4 overflow-visible">
                            <div className="flex items-center justify-between gap-3 mb-2 overflow-visible">
                                <p className="min-w-0 truncate text-xs md:text-sm font-bold text-editorial-black">{review.userName}</p>
                                <div className="relative z-[2] flex flex-shrink-0 items-center gap-2">
                                    <div className="flex items-center gap-0.5">
                                        {[...Array(5)].map((_, i) => (
                                            <Star
                                                key={i}
                                                className={`w-3 h-3 ${i < review.rating ? 'fill-accent text-accent' : 'text-editorial-black/20'}`}
                                            />
                                        ))}
                                    </div>
                                    {currentUserId === review.userId && (
                                        <ItemMenu
                                            onEdit={() => onEditReview(review)}
                                            onDelete={() => onDeleteReview(review)}
                                        />
                                    )}
                                </div>
                            </div>
                            <p className="text-xs md:text-sm text-editorial-black/70 leading-relaxed">{review.text}</p>
                        </div>
                    ))}
                </div>

                {currentUserId !== spot.userId && (
                    <div className="p-4 md:p-6 border-t border-editorial-black/10">
                        <button
                            type="button"
                            onClick={onAddReview}
                            className="w-full py-3 bg-editorial-black text-white text-[10px] uppercase tracking-[0.15em] font-bold hover:bg-accent transition-colors"
                        >
                            Add a Review
                        </button>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
