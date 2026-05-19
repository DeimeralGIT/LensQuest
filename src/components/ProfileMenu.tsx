import React, { useCallback, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Moon, Sun, LogOut, Link2, Aperture } from 'lucide-react';
import { motion } from 'motion/react';
import ProfileSettingsModal from './ProfileSettingsModal';

interface ProfileMenuProps {
    isOpen: boolean;
    onClose: () => void;
    onLogout: () => void;
    isDarkMode: boolean;
    onToggleDarkMode: (isDark: boolean) => void;
    buyMeCoffeeUrl?: string;
    triggerRef: React.RefObject<HTMLButtonElement | null>;
}

export default function ProfileMenu({
    isOpen,
    onClose,
    onLogout,
    isDarkMode,
    onToggleDarkMode,
    buyMeCoffeeUrl,
    triggerRef,
}: ProfileMenuProps) {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isOpeningSettings, setIsOpeningSettings] = useState(false);
    const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
    const openingTimeoutRef = React.useRef<number | null>(null);

    const updateMenuPosition = useCallback(() => {
        const trigger = triggerRef.current;
        if (!trigger) {
            setMenuPosition(null);
            return;
        }

        const rect = trigger.getBoundingClientRect();
        const menuWidth = 224;
        const viewportPadding = 16;

        setMenuPosition({
            top: rect.bottom + 8,
            left: Math.min(
                window.innerWidth - menuWidth - viewportPadding,
                Math.max(viewportPadding, rect.right - menuWidth)
            ),
        });
    }, [triggerRef]);

    React.useEffect(() => {
        return () => {
            if (openingTimeoutRef.current !== null) {
                window.clearTimeout(openingTimeoutRef.current);
            }
        };
    }, []);

    useLayoutEffect(() => {
        if (!isOpen) {
            setMenuPosition(null);
            return;
        }

        updateMenuPosition();
        window.addEventListener('resize', updateMenuPosition);
        window.addEventListener('scroll', updateMenuPosition, true);

        return () => {
            window.removeEventListener('resize', updateMenuPosition);
            window.removeEventListener('scroll', updateMenuPosition, true);
        };
    }, [isOpen, updateMenuPosition]);

    const handleOpenBuyMeCoffeeSettings = () => {
        if (isOpeningSettings) {
            return;
        }

        setIsOpeningSettings(true);
        onClose();

        openingTimeoutRef.current = window.setTimeout(() => {
            setIsOpeningSettings(false);
            setIsSettingsOpen(true);
            openingTimeoutRef.current = null;
        }, 500);
    };

    if (!isOpen && !isSettingsOpen && !isOpeningSettings) return null;

    return (
        <>
            {createPortal(
                <>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[9000] bg-editorial-black/20 backdrop-blur-[1px]"
                            onClick={onClose}
                        />
                    )}

                    {isOpen && menuPosition && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            onClick={(e) => e.stopPropagation()}
                            className="fixed z-[9200] bg-primary-bg border border-editorial-black/10 rounded-lg shadow-lg overflow-hidden w-56"
                            style={{ top: menuPosition.top, left: menuPosition.left }}
                        >
                            <div className="p-4 space-y-2">
                                <button
                                    onClick={() => onToggleDarkMode(!isDarkMode)}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-editorial-black/5 transition-colors text-editorial-black"
                                >
                                    {isDarkMode ? (
                                        <>
                                            <Sun className="w-4 h-4" />
                                            <span>Light Mode</span>
                                        </>
                                    ) : (
                                        <>
                                            <Moon className="w-4 h-4" />
                                            <span>Dark Mode</span>
                                        </>
                                    )}
                                </button>

                                <button
                                    onClick={handleOpenBuyMeCoffeeSettings}
                                    disabled={isOpeningSettings}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-editorial-black/5 transition-colors text-editorial-black disabled:opacity-60"
                                >
                                    <Link2 className="w-4 h-4" />
                                    <span>Link Buy Me a Coffee account</span>
                                </button>

                                <div className="border-t border-editorial-black/10 my-2" />

                                <button
                                    onClick={() => {
                                        onLogout();
                                        onClose();
                                    }}
                                    className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-red-500/15 transition-colors text-red-600"
                                >
                                    <LogOut className="w-4 h-4" />
                                    <span>Log out</span>
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {isOpeningSettings && (
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
                                <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/90">Preparing Creator Link</p>
                            </motion.div>
                        </motion.div>
                    )}
                </>,
                document.body
            )}

            <ProfileSettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                initialBuyMeCoffeeUrl={buyMeCoffeeUrl}
            />
        </>
    );
}
