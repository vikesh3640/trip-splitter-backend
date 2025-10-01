const express = require("express");
const multer = require("multer");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/** Building model list  */
function getModelList() {
  const primary = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  const fallbacks = (process.env.GEMINI_FALLBACKS || "gemini-1.5-flash,gemini-1.5-flash-8b,gemini-1.5-pro")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  // de-dup but keep order
  const seen = new Set();
  return [primary, ...fallbacks].filter(m => !seen.has(m) && seen.add(m));
}

function requireApiKey() {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("Missing GOOGLE_API_KEY");
  return key;
}

async function callOnce({ modelName, apiKey, base64, mimeType }) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = `
Extract receipt info as strict JSON.

Fields:
- merchant: short name (e.g., "Domino's", "Zomato", "Cafe XYZ")
- category: one of ["Food","Travel","Stay","Shopping","Activity","Other"]
- items: array of up to 10 concise item names (strings). (Optional; short.)
- total: final bill total as number

Rules:
- Reply ONLY with JSON (no code fences, no extra text).
- If something missing, do best-effort guess; keep "Other" category if unsure.

Example:
{"merchant":"Domino's","category":"Food","items":["pizza","garlic bread","coke"],"total":1249}
`;

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64 } }
        ],
      },
    ],
  });

  const text = result?.response?.text?.();
  if (!text || typeof text !== "string") {
    throw new Error("Empty AI response");
  }
  let clean = text.trim();
  clean = clean.replace(/```json|```/g, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(clean.slice(start, end + 1));
      } catch (e2) {
        throw new Error("Failed to parse JSON from model response");
      }
    } else {
      throw new Error("Failed to parse JSON from model response");
    }
  }

  // Normalizing  shape
  const merchant = String(parsed.merchant || "").trim();
  const categoryRaw = String(parsed.category || "Other").trim();
  const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 10).map(x => String(x || "").trim()).filter(Boolean) : [];
  const total = Number(parsed.total);

  const category = ["Food","Travel","Stay","Shopping","Activity","Other"].includes(categoryRaw) ? categoryRaw : "Other";
  const safeTotal = Number.isFinite(total) && total >= 0 ? total : 0;

  return { merchant, category, items, total: safeTotal, _model: modelName };
}

async function callWithFallbacks({ base64, mimeType }) {
  const apiKey = requireApiKey();
  const models = getModelList();
  let lastErr;

  for (const m of models) {
    try {
      return await callOnce({ modelName: m, apiKey, base64, mimeType });
    } catch (e) {
      lastErr = e;
      // try next model
    }
  }
  throw lastErr || new Error("All model candidates failed");
}

/**
 * POST /api/ai/receipt
 * form-data: file=<image>
 */
router.post("/receipt", upload.single("file"), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "file is required (image)" });
    }
    const mimeType = req.file.mimetype || "image/jpeg";
    const base64 = req.file.buffer.toString("base64");

    const out = await callWithFallbacks({ base64, mimeType });
    const top = out.merchant || out.category || "Expense";
    const items = (out.items || []).slice(0, 6).join(", ");
    const title = items ? `${top}\n${items}` : top;

    return res.json({
      merchant: out.merchant,
      category: out.category,
      items: out.items,
      total: out.total,
      title,
      model: out._model,
    });
  } catch (err) {
    console.error("[ai.receipt] error:", err?.message || err);
    return res.status(500).json({ error: "AI parse failed" });
  }
});

module.exports = router;
