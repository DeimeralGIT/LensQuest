import React from 'react';
import { X, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface UploadLimitErrorModalProps {
    isOpen: boolean;
    onClose: () => void;
    usedMB: number;
    totalMB: number;
    remainingMB: number;
    resetDate: Date;
}

export default function UploadLimitErrorModal({
    isOpen,
    onClose,
    usedMB,
    totalMB,
    remainingMB,
    resetDate,
}: UploadLimitErrorModalProps) {
    if (!isOpen) return null;

    const resetDateStr = resetDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-primary-bg border border-editorial-black/10 rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl"
            >
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-red-600" />
                        </div>
                        <h2 className="text-lg font-bold text-editorial-black">Upload Limit Reached</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-editorial-black/5 rounded-md transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <p className="text-sm text-editorial-black/70">
                        You've reached your monthly upload limit for this billing period.
                    </p>

                    <div className="bg-editorial-black/3 rounded-lg p-4 space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-xs uppercase tracking-widest font-semibold text-editorial-black/60">
                                Used This Month
                            </span>
                            <span className="font-bold text-editorial-black">{usedMB.toFixed(1)}MB</span>
                        </div>
                        <div className="w-full bg-editorial-black/10 rounded-full h-2">
                            <div
                                className="bg-accent rounded-full h-2 transition-all"
                                style={{ width: `${(usedMB / totalMB) * 100}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-xs text-editorial-black/60">
                            <span>{usedMB.toFixed(1)}MB</span>
                            <span>{totalMB}MB limit</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-xs uppercase tracking-widest font-semibold text-editorial-black/60">
                            Next Reset
                        </p>
                        <p className="text-sm font-semibold text-editorial-black">{resetDateStr}</p>
                        <p className="text-xs text-editorial-black/60">
                            You'll be able to upload {remainingMB.toFixed(1)}MB more starting on this date.
                        </p>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="w-full mt-6 py-2.5 bg-editorial-black text-white text-sm uppercase tracking-[0.1em] font-bold hover:bg-accent transition-colors rounded-md"
                >
                    Got it
                </button>
            </motion.div>
        </motion.div>
    );
}
