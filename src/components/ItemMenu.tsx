import React, { useState } from 'react';
import { MoreVertical, Trash2, Edit2 } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ItemMenuProps {
    onEdit: () => void;
    onDelete: () => void;
    isDeleting?: boolean;
}

export default function ItemMenu({ onEdit, onDelete, isDeleting = false }: ItemMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = React.useRef<HTMLDivElement | null>(null);
    const triggerRef = React.useRef<HTMLButtonElement | null>(null);
    const popupRef = React.useRef<HTMLDivElement | null>(null);
    const [menuPosition, setMenuPosition] = React.useState<{ top: number; left: number } | null>(null);

    const updatePosition = React.useCallback(() => {
        const trigger = triggerRef.current;
        if (!trigger) {
            return null;
        }

        const rect = trigger.getBoundingClientRect();
        const menuWidth = 176;
        const menuHeight = 92;
        const viewportPadding = 8;
        const spaceBelow = window.innerHeight - rect.bottom;
        const top = spaceBelow >= menuHeight + viewportPadding
            ? rect.bottom + 6
            : Math.max(viewportPadding, rect.top - menuHeight - 6);
        const left = Math.min(
            window.innerWidth - menuWidth - viewportPadding,
            Math.max(viewportPadding, rect.right - menuWidth)
        );
        const position = { top, left };

        setMenuPosition(position);
        return position;
    }, []);

    React.useEffect(() => {
        if (!isOpen) {
            setMenuPosition(null);
            return;
        }

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        const handleOutsidePress = (event: MouseEvent | TouchEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) {
                return;
            }

            const clickedTrigger = menuRef.current?.contains(target) ?? false;
            const clickedPopup = popupRef.current?.contains(target) ?? false;

            if (!clickedTrigger && !clickedPopup) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleOutsidePress);
        document.addEventListener('touchstart', handleOutsidePress, { passive: true });

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
            document.removeEventListener('mousedown', handleOutsidePress);
            document.removeEventListener('touchstart', handleOutsidePress);
        };
    }, [isOpen, updatePosition]);

    return (
        <div ref={menuRef} className="relative z-[1] flex items-center">
            <button
                ref={triggerRef}
                onClick={(e) => {
                    e.stopPropagation();
                    if (isOpen) {
                        setIsOpen(false);
                        return;
                    }

                    updatePosition();
                    setIsOpen(true);
                }}
                className={`p-1.5 rounded-full transition-colors ${isOpen ? 'bg-editorial-black/10' : 'hover:bg-editorial-black/10'}`}
                title="More options"
            >
                <MoreVertical className="w-4 h-4 text-editorial-black/60" />
            </button>

            {isOpen && menuPosition && createPortal(
                <div>
                    <div
                        className="fixed inset-0"
                        style={{ zIndex: 9999 }}
                        onClick={() => setIsOpen(false)}
                    />
                    <div
                        ref={popupRef}
                        onClick={(e) => e.stopPropagation()}
                        className="fixed bg-primary-bg border border-editorial-black/10 rounded-lg shadow-[0_18px_50px_rgba(0,0,0,0.22)] overflow-hidden w-44"
                        style={{
                            top: menuPosition.top,
                            left: menuPosition.left,
                            zIndex: 10000,
                        }}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit();
                                setIsOpen(false);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-editorial-black hover:bg-editorial-black/5 transition-colors"
                        >
                            <Edit2 className="w-4 h-4" />
                            <span>Edit</span>
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm('Are you sure? This cannot be undone.')) {
                                    onDelete();
                                }
                                setIsOpen(false);
                            }}
                            disabled={isDeleting}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-500/15 transition-colors disabled:opacity-50"
                        >
                            <Trash2 className="w-4 h-4" />
                            <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
