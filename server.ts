import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

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

      const model = "gemini-3-flash-preview";
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
