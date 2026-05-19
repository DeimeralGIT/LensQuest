const crypto = require('crypto');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { onDocumentCreated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');

dotenv.config();
admin.initializeApp();

const region = 'us-central1';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_REPORTS_CHAT_ID = process.env.TELEGRAM_REPORTS_CHAT_ID || '';
const TELEGRAM_IMAGE_REPORTS_CHAT_ID = process.env.TELEGRAM_IMAGE_REPORTS_CHAT_ID || TELEGRAM_REPORTS_CHAT_ID;
const TELEGRAM_REPORTS_REPLY_TO = Number(process.env.TELEGRAM_REPORTS_REPLY_TO || '0') || undefined;
const TELEGRAM_IMAGE_REPORTS_REPLY_TO = Number(process.env.TELEGRAM_IMAGE_REPORTS_REPLY_TO || process.env.TELEGRAM_REPORTS_REPLY_TO || '0') || undefined;
const TELEGRAM_IMAGE_REPORTS_THREAD_ID = Number(process.env.TELEGRAM_IMAGE_REPORTS_THREAD_ID || process.env.TELEGRAM_IMAGE_REPORTS_REPLY_TO || process.env.TELEGRAM_REPORTS_REPLY_TO || '0') || undefined;
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || '(default)';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const MODERATION_ACTION_BASE_URL = (process.env.MODERATION_ACTION_BASE_URL || '').replace(/\/$/, '');
const TELEGRAM_ACTION_SECRET = process.env.TELEGRAM_ACTION_SECRET || '';

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function signAction(spotId, userId, action) {
    if (!TELEGRAM_ACTION_SECRET) {
        return '';
    }
    return crypto.createHmac('sha256', TELEGRAM_ACTION_SECRET).update(`${spotId}:${userId}:${action}`).digest('hex');
}

function isValidActionSignature(spotId, userId, action, sig) {
    if (!TELEGRAM_ACTION_SECRET || !sig) {
        return false;
    }
    const expected = signAction(spotId, userId, action);
    return expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

async function sendTelegramMessage(payload) {
    if (!TELEGRAM_BOT_TOKEN || !payload.chat_id) {
        throw new Error('Telegram env vars are missing for Cloud Functions');
    }

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Telegram API error: ${response.status} ${body}`);
    }
}

function extractStoragePathFromUrl(fileUrl) {
    try {
        const parsed = new URL(fileUrl);
        const marker = '/o/';
        const idx = parsed.pathname.indexOf(marker);
        if (idx === -1) {
            return null;
        }
        return decodeURIComponent(parsed.pathname.slice(idx + marker.length));
    } catch {
        return null;
    }
}

function getFunctionBaseUrl() {
    if (MODERATION_ACTION_BASE_URL) {
        return MODERATION_ACTION_BASE_URL;
    }

    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'lensquest-6f1b7';
    return `https://us-central1-${projectId}.cloudfunctions.net`;
}

async function handleImageReportCreated(event) {
    console.log('onImageReportCreated invoked', {
        eventId: event?.id || null,
        database: event?.database || null,
        params: event?.params || null,
    });

    const snap = event.data;
    if (!snap) {
        console.log('onImageReportCreated: no snapshot data');
        return;
    }

    const data = snap.data();
    if (data.status && data.status !== 'pending') {
        console.log('onImageReportCreated: skipping non-pending report', { status: data.status });
        return;
    }
    const spotId = String(data.spotId || '');
    const ownerUserId = String(data.ownerUserId || '');
    const ownerUserName = String(data.ownerUserName || 'Unknown');
    const imageUrl = String(data.imageUrl || '');
    const title = String(data.title || 'Untitled');
    const reason = String(data.reason || '');
    const reporterUserId = data.reporterUserId == null ? 'anonymous' : String(data.reporterUserId);
    const reporterUserName = String(data.reporterUserName || 'anonymous');

    const deleteSig = signAction(spotId, ownerUserId, 'delete');
    const blockSig = signAction(spotId, ownerUserId, 'block');
    const actionBaseUrl = getFunctionBaseUrl();
    const deleteUrl = `${actionBaseUrl}/moderationDeleteImage?spotId=${encodeURIComponent(spotId)}&userId=${encodeURIComponent(ownerUserId)}&sig=${encodeURIComponent(deleteSig)}`;
    const blockUrl = `${actionBaseUrl}/moderationBlockUser?spotId=${encodeURIComponent(spotId)}&userId=${encodeURIComponent(ownerUserId)}&sig=${encodeURIComponent(blockSig)}`;

    const text = [
        '🚨 <b>Image Report</b>',
        `Reported by: <b>${escapeHtml(reporterUserName)}</b> (${escapeHtml(reporterUserId)})`,
        `Author: <b>${escapeHtml(ownerUserName)}</b> (${escapeHtml(ownerUserId)})`,
        `Spot: <b>${escapeHtml(title)}</b>`,
        `Spot ID: <code>${escapeHtml(spotId)}</code>`,
        '',
        `<b>Description:</b> ${escapeHtml(reason)}`,
        '',
        `Image: ${escapeHtml(imageUrl)}`,
    ].join('\n');

    try {
        console.log('onImageReportCreated: sending full telegram message');
        await sendTelegramMessage({
            chat_id: TELEGRAM_IMAGE_REPORTS_CHAT_ID,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: false,
            ...(TELEGRAM_IMAGE_REPORTS_THREAD_ID ? { message_thread_id: TELEGRAM_IMAGE_REPORTS_THREAD_ID } : {}),
            ...(TELEGRAM_IMAGE_REPORTS_REPLY_TO ? { reply_to_message_id: TELEGRAM_IMAGE_REPORTS_REPLY_TO } : {}),
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🗑 Remove Image', url: deleteUrl }],
                    [{ text: '⛔ Block User', url: blockUrl }],
                ],
            },
        });

        await snap.ref.set({ status: 'sent', sentAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        console.log('onImageReportCreated: status set to sent');
    } catch (error) {
        console.error('onImageReportCreated error:', error);
        await snap.ref.set({ status: 'failed', error: String(error), failedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        throw error;
    }
}

exports.reportImage = onRequest({ region, cors: true, invoker: 'public' }, async (req, res) => {
    try {
        if (req.method !== 'POST') {
            res.status(405).send('Method not allowed');
            return;
        }

        const body = req.body || {};
        const spotId = String(body.spotId || '');
        const ownerUserId = String(body.ownerUserId || '');
        const ownerUserName = String(body.ownerUserName || 'Unknown');
        const imageUrl = String(body.imageUrl || '');
        const title = String(body.title || 'Untitled');
        const reason = String(body.reason || '');
        const reporterUserId = body.reporterUserId == null ? 'anonymous' : String(body.reporterUserId);
        const reporterUserName = String(body.reporterUserName || 'anonymous');

        if (!spotId || !ownerUserId || !imageUrl || !reason.trim()) {
            res.status(400).send('Missing required fields');
            return;
        }

        const deleteSig = signAction(spotId, ownerUserId, 'delete');
        const blockSig = signAction(spotId, ownerUserId, 'block');
        const actionBaseUrl = getFunctionBaseUrl();
        const deleteUrl = `${actionBaseUrl}/moderationDeleteImage?spotId=${encodeURIComponent(spotId)}&userId=${encodeURIComponent(ownerUserId)}&sig=${encodeURIComponent(deleteSig)}`;
        const blockUrl = `${actionBaseUrl}/moderationBlockUser?spotId=${encodeURIComponent(spotId)}&userId=${encodeURIComponent(ownerUserId)}&sig=${encodeURIComponent(blockSig)}`;

        const simpleText = [
            'Image report received',
            `spotId: ${spotId}`,
            `reporter: ${reporterUserName}`,
            `owner: ${ownerUserName}`,
        ].join('\n');

        const text = [
            '🚨 <b>Image Report</b>',
            `Reported by: <b>${escapeHtml(reporterUserName)}</b> (${escapeHtml(reporterUserId)})`,
            `Author: <b>${escapeHtml(ownerUserName)}</b> (${escapeHtml(ownerUserId)})`,
            `Spot: <b>${escapeHtml(title)}</b>`,
            `Spot ID: <code>${escapeHtml(spotId)}</code>`,
            '',
            `<b>Description:</b> ${escapeHtml(reason)}`,
            '',
            `Image: ${escapeHtml(imageUrl)}`,
        ].join('\n');

        await sendTelegramMessage({
            chat_id: TELEGRAM_IMAGE_REPORTS_CHAT_ID,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: false,
            ...(TELEGRAM_IMAGE_REPORTS_THREAD_ID ? { message_thread_id: TELEGRAM_IMAGE_REPORTS_THREAD_ID } : {}),
            ...(TELEGRAM_IMAGE_REPORTS_REPLY_TO ? { reply_to_message_id: TELEGRAM_IMAGE_REPORTS_REPLY_TO } : {}),
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🗑 Remove Image', url: deleteUrl }],
                    [{ text: '⛔ Block User', url: blockUrl }],
                ],
            },
        });

        const reportDb = getFirestore(undefined, FIRESTORE_DATABASE_ID);
        await reportDb.collection('imageReports').add({
            spotId,
            ownerUserId,
            ownerUserName,
            imageUrl,
            title,
            reason,
            reporterUserId: body.reporterUserId == null ? null : String(body.reporterUserId),
            reporterUserName,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'sent',
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            via: 'reportImageEndpoint',
        });

        res.status(200).json({ ok: true });
    } catch (error) {
        console.error('reportImage endpoint error:', error);
        res.status(500).send(`Report failed: ${error.message || error}`);
    }
});

exports.onImageReportCreated = onDocumentCreated({ document: 'imageReports/{reportId}', region, database: FIRESTORE_DATABASE_ID }, handleImageReportCreated);

if (FIRESTORE_DATABASE_ID !== '(default)') {
    exports.onImageReportCreatedDefault = onDocumentCreated({ document: 'imageReports/{reportId}', region, database: '(default)' }, handleImageReportCreated);
}

exports.syncSpotReviewStats = onDocumentWritten({ document: 'reviews/{spotId}/reviews/{reviewId}', region, database: FIRESTORE_DATABASE_ID }, async (event) => {
    const { spotId } = event.params;
    const db = admin.firestore();
    const reviewsSnap = await db.collection('reviews').doc(spotId).collection('reviews').get();

    let reviewCount = 0;
    let ratingSum = 0;
    reviewsSnap.forEach((doc) => {
        const review = doc.data();
        if (typeof review.rating === 'number') {
            reviewCount += 1;
            ratingSum += review.rating;
        }
    });

    const averageRating = reviewCount > 0 ? ratingSum / reviewCount : 0;
    await db.collection('spots').doc(spotId).set({ reviewCount, averageRating }, { merge: true });
});

exports.moderationDeleteImage = onRequest({ region, invoker: 'public' }, async (req, res) => {
    try {
        const spotId = String(req.query.spotId || '');
        const userId = String(req.query.userId || '');
        const sig = String(req.query.sig || '');
        if (!spotId || !userId || !isValidActionSignature(spotId, userId, 'delete', sig)) {
            res.status(401).send('Invalid or unauthorized action signature.');
            return;
        }

        const db = admin.firestore();
        const bucket = admin.storage().bucket();
        const spotRef = db.collection('spots').doc(spotId);
        const spotSnap = await spotRef.get();

        if (!spotSnap.exists) {
            res.send('Spot already deleted.');
            return;
        }

        const spotData = spotSnap.data() || {};
        if (spotData.userId && spotData.userId !== userId) {
            res.status(409).send('Spot owner mismatch.');
            return;
        }

        if (spotData.imageUrl) {
            const storagePath = extractStoragePathFromUrl(spotData.imageUrl);
            if (storagePath) {
                await bucket.file(storagePath).delete({ ignoreNotFound: true }).catch(() => { });
            }
        }

        const reviewsSnap = await db.collection('reviews').doc(spotId).collection('reviews').get();
        const batch = db.batch();
        reviewsSnap.docs.forEach((doc) => batch.delete(doc.ref));
        batch.delete(spotRef);
        await batch.commit();

        res.send('Image and spot deleted successfully.');
    } catch (error) {
        console.error('moderationDeleteImage error:', error);
        res.status(500).send(`Delete failed: ${error.message || error}`);
    }
});

exports.moderationBlockUser = onRequest({ region, invoker: 'public' }, async (req, res) => {
    try {
        const spotId = String(req.query.spotId || '');
        const userId = String(req.query.userId || '');
        const sig = String(req.query.sig || '');
        if (!spotId || !userId || !isValidActionSignature(spotId, userId, 'block', sig)) {
            res.status(401).send('Invalid or unauthorized action signature.');
            return;
        }

        const db = admin.firestore();
        const bucket = admin.storage().bucket();

        // Mark user as blocked
        await db.doc(`users/${userId}/profile/public`).set({
            blocked: true,
            blockedAt: Date.now(),
            blockedReason: 'Telegram moderation action',
        }, { merge: true });

        // Disable auth account
        await admin.auth().updateUser(userId, { disabled: true }).catch(() => { });

        // Delete all content belonging to the user
        const spotsSnap = await db.collection('spots').where('userId', '==', userId).get();
        const deletions = spotsSnap.docs.map(async (spotDoc) => {
            const spotData = spotDoc.data() || {};
            // Delete storage image
            if (spotData.imageUrl) {
                const storagePath = extractStoragePathFromUrl(spotData.imageUrl);
                if (storagePath) {
                    await bucket.file(storagePath).delete({ ignoreNotFound: true }).catch(() => { });
                }
            }
            // Delete reviews subcollection
            const reviewsSnap = await db.collection('reviews').doc(spotDoc.id).collection('reviews').get();
            const batch = db.batch();
            reviewsSnap.docs.forEach((r) => batch.delete(r.ref));
            batch.delete(spotDoc.ref);
            await batch.commit();
        });
        await Promise.all(deletions);

        res.send('User blocked and all content deleted.');
    } catch (error) {
        console.error('moderationBlockUser error:', error);
        res.status(500).send(`Block failed: ${error.message || error}`);
    }
});
