import React from 'react';
import { motion } from 'motion/react';
import { Aperture } from 'lucide-react';

interface ActionLoadingOverlayProps {
    isOpen: boolean;
    label: string;
}

export default function ActionLoadingOverlay({ isOpen, label }: ActionLoadingOverlayProps) {
    if (!isOpen) {
        return null;
    }

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9150] bg-editorial-black/35 backdrop-blur-md flex items-center justify-center"
        >
            <motion.div
                animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                className="flex flex-col items-center gap-4"
            >
                <div className="w-16 h-16 rounded-full bg-editorial-black dark:bg-accent text-white flex items-center justify-center shadow-xl shadow-editorial-black/30">
                    <Aperture className="w-9 h-9 animate-[spin_10s_linear_infinite]" />
                </div>
                <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/90">{label}</p>
            </motion.div>
        </motion.div>
    );
}
