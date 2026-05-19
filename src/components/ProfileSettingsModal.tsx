import React, { useState } from 'react';
import { X, Loader2, ExternalLink, Unlink2 } from 'lucide-react';
import { motion } from 'motion/react';
import { auth, db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { BUY_ME_A_COFFEE_BASE_URL, BUY_ME_A_COFFEE_ICON_URL, buildBuyMeCoffeeUrl, formatBuyMeCoffeeHandle, normalizeBuyMeCoffeeHandle } from '../lib/buyMeCoffee';

interface ProfileSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialBuyMeCoffeeUrl?: string;
}

export default function ProfileSettingsModal({
    isOpen,
    onClose,
    initialBuyMeCoffeeUrl,
}: ProfileSettingsModalProps) {
    const [linkedHandle, setLinkedHandle] = useState(() => normalizeBuyMeCoffeeHandle(initialBuyMeCoffeeUrl));
    const [buyMeCoffeeHandle, setBuyMeCoffeeHandle] = useState(() => normalizeBuyMeCoffeeHandle(initialBuyMeCoffeeUrl));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const normalizedDraftHandle = normalizeBuyMeCoffeeHandle(buyMeCoffeeHandle);
    const profileUrl = buildBuyMeCoffeeUrl(linkedHandle);

    React.useEffect(() => {
        if (!isOpen) {
            return;
        }

        const normalizedInitialHandle = normalizeBuyMeCoffeeHandle(initialBuyMeCoffeeUrl);
        setLinkedHandle(normalizedInitialHandle);
        setBuyMeCoffeeHandle(normalizedInitialHandle);
        setError('');
    }, [initialBuyMeCoffeeUrl, isOpen]);

    const handleSave = async () => {
        if (!auth.currentUser) return;

        setError('');
        setLoading(true);

        try {
            const nextHandle = normalizeBuyMeCoffeeHandle(buyMeCoffeeHandle);

            if (!nextHandle) {
                setError('Enter only your Buy Me a Coffee account handle.');
                setLoading(false);
                return;
            }

            const userProfileRef = doc(db, 'users', auth.currentUser.uid, 'profile', 'public');
            await setDoc(
                userProfileRef,
                {
                    displayName: auth.currentUser.displayName || 'Anonymous',
                    photoURL: auth.currentUser.photoURL || '',
                    buyMeCoffeeUrl: nextHandle,
                },
                { merge: true }
            );

            setLinkedHandle(nextHandle);
            setBuyMeCoffeeHandle(nextHandle);
        } catch (err) {
            console.error('Error saving profile:', err);
            setError('Failed to save profile. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleUnlink = async () => {
        if (!auth.currentUser) return;

        setError('');
        setLoading(true);

        try {
            const userProfileRef = doc(db, 'users', auth.currentUser.uid, 'profile', 'public');
            await setDoc(
                userProfileRef,
                {
                    displayName: auth.currentUser.displayName || 'Anonymous',
                    photoURL: auth.currentUser.photoURL || '',
                    buyMeCoffeeUrl: null,
                },
                { merge: true }
            );

            setBuyMeCoffeeHandle('');
            setLinkedHandle('');
        } catch (err) {
            console.error('Error removing Buy Me a Coffee link:', err);
            setError('Failed to remove the linked account. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9200] p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-primary-bg border border-editorial-black/10 rounded-lg p-6 max-w-sm w-full shadow-xl"
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[#FFDD00]/20 rounded-lg border border-[#FFDD00]/40">
                            <img src={BUY_ME_A_COFFEE_ICON_URL} alt="Buy Me a Coffee" className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold text-editorial-black">Buy Me a Coffee</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-editorial-black/5 rounded-md transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div className="rounded-2xl border border-editorial-black/10 bg-secondary-bg/60 p-4 space-y-4">
                        {linkedHandle ? (
                            <div className="space-y-3">
                                {profileUrl && (
                                    <a
                                        href={profileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full inline-flex items-center justify-between gap-2 px-3 py-3 rounded-xl border border-[#FFDD00]/50 bg-[#FFF7BF] text-[#1A1A1A] hover:bg-[#FFEF86] transition-colors"
                                    >
                                        <span className="text-sm font-semibold">{formatBuyMeCoffeeHandle(linkedHandle)}</span>
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                )}
                                <button
                                    type="button"
                                    onClick={handleUnlink}
                                    disabled={loading}
                                    className="w-full py-2.5 border border-red-500/40 text-red-600 text-sm font-bold rounded-lg hover:bg-red-500/15 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink2 className="w-4 h-4" />}
                                    Unlink account
                                </button>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-editorial-black/10 bg-primary-bg p-3 space-y-3">
                                <p className="text-[11px] uppercase tracking-[0.16em] font-black text-editorial-black/45">
                                    {BUY_ME_A_COFFEE_BASE_URL}/
                                </p>
                                <input
                                    type="text"
                                    value={buyMeCoffeeHandle}
                                    onChange={(e) => setBuyMeCoffeeHandle(e.target.value)}
                                    placeholder="yourhandle"
                                    className="w-full px-3 py-2.5 text-sm border border-editorial-black/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={loading || !normalizedDraftHandle}
                                    className="w-full py-2.5 bg-[#FFDD00] text-editorial-black text-sm font-bold rounded-lg hover:brightness-95 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        'Link account'
                                    )}
                                </button>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}
                </div>

                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 border border-editorial-black/10 text-editorial-black text-sm uppercase tracking-[0.1em] font-bold hover:bg-editorial-black/5 transition-colors rounded-md"
                    >
                        Close
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
