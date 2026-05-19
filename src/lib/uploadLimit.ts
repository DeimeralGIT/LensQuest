import { db, auth } from './firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const MONTHLY_LIMIT_MB = 100;
const MONTHLY_LIMIT_BYTES = MONTHLY_LIMIT_MB * 1024 * 1024;

export interface UploadLimitError {
    exceeded: boolean;
    currentUsage: number;
    limit: number;
    remainingBytes: number;
    resetDate: Date;
    message: string;
}

function getCurrentMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getNextMonthResetDate(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

export async function checkUploadLimit(fileSizeBytes: number): Promise<UploadLimitError | null> {
    if (!auth.currentUser) {
        throw new Error('User not authenticated');
    }

    const monthKey = getCurrentMonthKey();
    const usageRef = doc(db, 'users', auth.currentUser.uid, 'uploadUsage', monthKey);

    try {
        const usageDoc = await getDoc(usageRef);
        let currentUsage = 0;

        if (usageDoc.exists()) {
            currentUsage = usageDoc.data().totalBytes || 0;
        }

        const newUsage = currentUsage + fileSizeBytes;

        if (newUsage > MONTHLY_LIMIT_BYTES) {
            const resetDate = getNextMonthResetDate();
            const remainingBytes = MONTHLY_LIMIT_BYTES - currentUsage;

            return {
                exceeded: true,
                currentUsage,
                limit: MONTHLY_LIMIT_BYTES,
                remainingBytes: Math.max(0, remainingBytes),
                resetDate,
                message: `Upload limit exceeded. You have used ${(currentUsage / (1024 * 1024)).toFixed(1)}MB of your ${MONTHLY_LIMIT_MB}MB monthly limit. Limit resets on ${resetDate.toLocaleDateString()}.`,
            };
        }

        return null;
    } catch (error) {
        console.error('Error checking upload limit:', error);
        throw error;
    }
}

export async function recordUpload(fileSizeBytes: number): Promise<void> {
    if (!auth.currentUser) {
        throw new Error('User not authenticated');
    }

    const monthKey = getCurrentMonthKey();
    const usageRef = doc(db, 'users', auth.currentUser.uid, 'uploadUsage', monthKey);

    try {
        const usageDoc = await getDoc(usageRef);

        if (usageDoc.exists()) {
            await updateDoc(usageRef, {
                totalBytes: (usageDoc.data().totalBytes || 0) + fileSizeBytes,
                lastUploadAt: serverTimestamp(),
            });
        } else {
            await setDoc(usageRef, {
                totalBytes: fileSizeBytes,
                createdAt: serverTimestamp(),
                lastUploadAt: serverTimestamp(),
                month: monthKey,
            });
        }
    } catch (error) {
        console.error('Error recording upload:', error);
        throw error;
    }
}

export function formatUploadLimitError(error: UploadLimitError): string {
    const usedMB = (error.currentUsage / (1024 * 1024)).toFixed(1);
    const remainingMB = (error.remainingBytes / (1024 * 1024)).toFixed(1);
    const resetDate = error.resetDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });

    return `You've reached your 100MB monthly upload limit.\n\nUsed: ${usedMB}MB\nRemaining this month: ${remainingMB}MB\n\nYour limit will reset on ${resetDate}.`;
}
