/**
 * AI Plant ID + Health Diagnosis
 * Uses OpenAI Vision API if NEXT_PUBLIC_OPENAI_KEY is set.
 * Otherwise returns a ready-to-wire placeholder response.
 */

export interface PlantIdResult {
  identified: boolean;
  commonName?: string;
  scientificName?: string;
  confidence?: number;
  notes?: string;
  careInstructions?: string;
  isPlaceholder?: boolean;
}

export interface HealthDiagResult {
  status: "healthy" | "needs_attention" | "unknown";
  issues?: string[];
  recommendations?: string[];
  confidence?: number;
  isPlaceholder?: boolean;
}

const OPENAI_KEY =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_OPENAI_KEY
    : undefined;

export async function identifyPlant(imageDataUrl: string): Promise<PlantIdResult> {
  if (!OPENAI_KEY) {
    // Placeholder — wire up your OpenAI key to activate
    return {
      identified: false,
      isPlaceholder: true,
      notes:
        "AI plant ID is ready — add NEXT_PUBLIC_OPENAI_KEY to .env.local to activate. " +
        "Will use GPT-4o Vision to identify plant species, provide care tips, and suggest zone placement.",
    };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are a plant identification expert. Identify this plant and respond in JSON with:
{
  "commonName": "string",
  "scientificName": "string", 
  "confidence": 0-1,
  "careInstructions": "brief care tip for zone 6b Boise Idaho",
  "notes": "1-2 sentence description"
}
If you cannot identify it, set confidence to 0.`,
              },
              {
                type: "image_url",
                image_url: { url: imageDataUrl, detail: "low" },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, ""));
    return {
      identified: (parsed.confidence || 0) > 0.3,
      commonName: parsed.commonName,
      scientificName: parsed.scientificName,
      confidence: parsed.confidence,
      notes: parsed.notes,
      careInstructions: parsed.careInstructions,
    };
  } catch (err) {
    console.error("Plant ID error:", err);
    return { identified: false, notes: "Identification failed. Try a clearer photo." };
  }
}

export async function diagnoseHealth(imageDataUrl: string, plantName?: string): Promise<HealthDiagResult> {
  if (!OPENAI_KEY) {
    return {
      status: "unknown",
      isPlaceholder: true,
      recommendations: [
        "AI health diagnosis is ready — add NEXT_PUBLIC_OPENAI_KEY to .env.local to activate.",
        "Will analyze photos for pest damage, disease, nutrient deficiencies, and watering issues.",
      ],
    };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are a plant health expert. Analyze this plant${plantName ? ` (${plantName})` : ""} and respond in JSON:
{
  "status": "healthy" | "needs_attention",
  "issues": ["list of problems observed"],
  "recommendations": ["actionable fixes, zone 6b Boise Idaho context"],
  "confidence": 0-1
}`,
              },
              {
                type: "image_url",
                image_url: { url: imageDataUrl, detail: "low" },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(text.replace(/```json\n?|\n?```/g, ""));
    return {
      status: parsed.status || "unknown",
      issues: parsed.issues || [],
      recommendations: parsed.recommendations || [],
      confidence: parsed.confidence,
    };
  } catch (err) {
    console.error("Health diag error:", err);
    return { status: "unknown", recommendations: ["Analysis failed. Try a clearer photo."] };
  }
}
