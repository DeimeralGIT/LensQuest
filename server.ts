import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import crypto from "crypto";
import { initializeApp as initializeAdminApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";

dotenv.config();

type TelegramPayload = {
  chat_id: string;
  text: string;
  parse_mode?: "HTML";
  disable_web_page_preview?: boolean;
  reply_to_message_id?: number;
  reply_markup?: {
    inline_keyboard: Array<Array<{ text: string; url: string }>>;
  };
};

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_STATUS_CHAT_ID = process.env.TELEGRAM_STATUS_CHAT_ID || "";
const TELEGRAM_REPORTS_CHAT_ID = process.env.TELEGRAM_REPORTS_CHAT_ID || "";
const TELEGRAM_STATUS_REPLY_TO = Number(process.env.TELEGRAM_STATUS_REPLY_TO || "0") || undefined;
const TELEGRAM_REPORTS_REPLY_TO = Number(process.env.TELEGRAM_REPORTS_REPLY_TO || "0") || undefined;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";
const TELEGRAM_ACTION_SECRET = process.env.TELEGRAM_ACTION_SECRET || "";

function ensureAdminInitialized() {
  if (getApps().length > 0) {
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) {
    return;
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  initializeAdminApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

async function sendTelegramMessage(payload: TelegramPayload) {
  if (!TELEGRAM_BOT_TOKEN || !payload.chat_id) {
    return;
  }

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function notifyServerStatus(event: string, details?: string) {
  const lines = [
    `🟢 <b>LensQuest Server Event</b>`,
    `Event: <b>${event}</b>`,
    `Time: ${new Date().toISOString()}`,
  ];

  if (details) {
    lines.push(`Details: ${details}`);
  }

  await sendTelegramMessage({
    chat_id: TELEGRAM_STATUS_CHAT_ID,
    text: lines.join("\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_to_message_id: TELEGRAM_STATUS_REPLY_TO,
  });
}

function signAction(spotId: string, userId: string, action: "delete" | "block") {
  if (!TELEGRAM_ACTION_SECRET) {
    return "";
  }

  return crypto
    .createHmac("sha256", TELEGRAM_ACTION_SECRET)
    .update(`${spotId}:${userId}:${action}`)
    .digest("hex");
}

function isValidActionSignature(spotId: string, userId: string, action: "delete" | "block", sig: string) {
  if (!TELEGRAM_ACTION_SECRET) {
    return false;
  }
  const expected = signAction(spotId, userId, action);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

function extractStoragePathFromUrl(fileUrl: string): string | null {
  try {
    const parsed = new URL(fileUrl);
    const marker = "/o/";
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) {
      return null;
    }
    const encodedPath = parsed.pathname.slice(idx + marker.length);
    return decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Gemini
  const genAI = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API to get photography tips for a location
  app.post("/api/spot-tips", async (req, res) => {
    try {
      const { locationName, description } = req.body;
      if (!locationName) {
        return res.status(400).json({ error: "Location name is required" });
      }

      const model = "gemini-2.0-flash";
      const prompt = `You are an expert travel photographer. Provide 3 specific, actionable photography tips for the following location: "${locationName}".
      Context: ${description || "No description provided."}
      Format your response as a short list with emojis. Focus on lighting, composition, and best time of day.`;

      const result = await genAI.models.generateContent({
        model,
        contents: prompt,
      });

      res.json({ tips: result.text });
    } catch (error: any) {
      console.error("Gemini Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/report-image", async (req, res) => {
    try {
      const { spotId, ownerUserId, ownerUserName, imageUrl, title, reason, reporterUserId, reporterUserName } = req.body || {};

      if (!spotId || !ownerUserId || !imageUrl || !reason) {
        return res.status(400).json({ error: "spotId, ownerUserId, imageUrl, and reason are required" });
      }

      if (reporterUserId && reporterUserId === ownerUserId) {
        return res.status(400).json({ error: "You cannot report your own image" });
      }

      if (!PUBLIC_BASE_URL || !TELEGRAM_REPORTS_CHAT_ID) {
        return res.status(500).json({ error: "Server reporting configuration is missing" });
      }

      const deleteSig = signAction(spotId, ownerUserId, "delete");
      const blockSig = signAction(spotId, ownerUserId, "block");
      if (!deleteSig || !blockSig) {
        return res.status(500).json({ error: "Moderation signature secret is not configured" });
      }

      const baseUrl = PUBLIC_BASE_URL.replace(/\/$/, "");
      const deleteUrl = `${baseUrl}/api/moderation/delete-image?spotId=${encodeURIComponent(spotId)}&userId=${encodeURIComponent(ownerUserId)}&sig=${encodeURIComponent(deleteSig)}`;
      const blockUrl = `${baseUrl}/api/moderation/block-user?spotId=${encodeURIComponent(spotId)}&userId=${encodeURIComponent(ownerUserId)}&sig=${encodeURIComponent(blockSig)}`;

      const lines = [
        `🚨 <b>Image Report</b>`,
        `Reported by: <b>${reporterUserName || "Unknown"}</b> (${reporterUserId || "anonymous"})`,
        `Author: <b>${ownerUserName || "Unknown"}</b> (${ownerUserId})`,
        `Spot: <b>${title || "Untitled"}</b>`,
        `Spot ID: <code>${spotId}</code>`,
        "",
        `<b>Description:</b> ${reason}`,
        "",
        `Image: ${imageUrl}`,
      ];

      await sendTelegramMessage({
        chat_id: TELEGRAM_REPORTS_CHAT_ID,
        text: lines.join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: false,
        reply_to_message_id: TELEGRAM_REPORTS_REPLY_TO,
        reply_markup: {
          inline_keyboard: [
            [{ text: "🗑 Delete Image", url: deleteUrl }],
            [{ text: "⛔ Block User", url: blockUrl }],
          ],
        },
      });

      return res.json({ ok: true });
    } catch (error: any) {
      console.error("Image report error:", error);
      return res.status(500).json({ error: error?.message || "Failed to send report" });
    }
  });

  app.get("/api/moderation/delete-image", async (req, res) => {
    try {
      const spotId = String(req.query.spotId || "");
      const userId = String(req.query.userId || "");
      const sig = String(req.query.sig || "");

      if (!spotId || !userId || !sig || !isValidActionSignature(spotId, userId, "delete", sig)) {
        return res.status(401).send("Invalid or unauthorized action signature.");
      }

      ensureAdminInitialized();
      if (getApps().length === 0) {
        return res.status(500).send("Firebase Admin is not configured on server.");
      }

      const db = getFirestore();
      const storage = getStorage();

      const spotRef = db.collection("spots").doc(spotId);
      const spotSnap = await spotRef.get();

      if (!spotSnap.exists) {
        return res.send("Spot already deleted.");
      }

      const spotData = spotSnap.data() as { userId?: string; imageUrl?: string };
      if (spotData.userId && spotData.userId !== userId) {
        return res.status(409).send("Spot owner mismatch.");
      }

      if (spotData.imageUrl) {
        const storagePath = extractStoragePathFromUrl(spotData.imageUrl);
        if (storagePath) {
          try {
            await storage.bucket().file(storagePath).delete({ ignoreNotFound: true });
          } catch (err) {
            console.error("Storage delete error:", err);
          }
        }
      }

      const reviewsCollection = db.collection("reviews").doc(spotId).collection("reviews");
      const reviewsSnap = await reviewsCollection.get();
      const batch = db.batch();
      reviewsSnap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(spotRef);
      await batch.commit();

      await notifyServerStatus("moderation_delete_image", `spotId=${spotId}, userId=${userId}`);
      return res.send("Image and spot deleted successfully.");
    } catch (error: any) {
      console.error("Moderation delete error:", error);
      return res.status(500).send(`Delete failed: ${error?.message || "unknown error"}`);
    }
  });

  app.get("/api/moderation/block-user", async (req, res) => {
    try {
      const spotId = String(req.query.spotId || "");
      const userId = String(req.query.userId || "");
      const sig = String(req.query.sig || "");

      if (!spotId || !userId || !sig || !isValidActionSignature(spotId, userId, "block", sig)) {
        return res.status(401).send("Invalid or unauthorized action signature.");
      }

      ensureAdminInitialized();
      if (getApps().length === 0) {
        return res.status(500).send("Firebase Admin is not configured on server.");
      }

      const db = getFirestore();
      const auth = getAuth();

      await db.doc(`users/${userId}/profile/public`).set(
        {
          blocked: true,
          blockedAt: Date.now(),
          blockedReason: "Telegram moderation action",
        },
        { merge: true }
      );

      try {
        await auth.updateUser(userId, { disabled: true });
      } catch (err) {
        console.error("Auth disable error:", err);
      }

      await notifyServerStatus("moderation_block_user", `spotId=${spotId}, userId=${userId}`);
      return res.send("User has been blocked (profile flagged, auth disabled).");
    } catch (error: any) {
      console.error("Moderation block error:", error);
      return res.status(500).send(`Block failed: ${error?.message || "unknown error"}`);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    await notifyServerStatus("server_started", `port=${PORT}`);
  });

  process.on("SIGINT", async () => {
    await notifyServerStatus("server_sigint");
    server.close(() => process.exit(0));
  });

  process.on("SIGTERM", async () => {
    await notifyServerStatus("server_sigterm");
    server.close(() => process.exit(0));
  });

  process.on("uncaughtException", async (error) => {
    await notifyServerStatus("uncaught_exception", error.message);
    console.error(error);
  });

  process.on("unhandledRejection", async (reason: any) => {
    await notifyServerStatus("unhandled_rejection", typeof reason === "string" ? reason : JSON.stringify(reason));
    console.error(reason);
  });
}

startServer().catch(console.error);
