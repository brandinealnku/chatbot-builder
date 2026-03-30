const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const OpenAI = require("openai");

admin.initializeApp();
const db = admin.firestore();

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

exports.chatReply = onRequest(
  { cors: true, maxInstances: 10 },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed." });
      }

      const { chatbotId, messages = [] } = req.body || {};
      if (!chatbotId) {
        return res.status(400).json({ error: "chatbotId is required." });
      }

      const publicSnap = await db.collection("publicChatbots").doc(chatbotId).get();
      if (!publicSnap.exists) {
        return res.status(404).json({ error: "Chatbot not found." });
      }

      const chatbot = publicSnap.data();
      const safeMessages = Array.isArray(messages)
        ? messages
            .filter((m) => m && typeof m === "object")
            .map((m) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: String(m.content || "").slice(0, 3000)
            }))
            .slice(-12)
        : [];

      const lastUserMessage =
        [...safeMessages].reverse().find((m) => m.role === "user")?.content || "";

      if (!openai) {
        return res.json({
          reply: createMockReply(lastUserMessage, chatbot),
          mode: "mock"
        });
      }

      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        temperature: 0.4,
        messages: [
          { role: "system", content: chatbot.systemPrompt || buildSystemPrompt(chatbot) },
          ...safeMessages
        ]
      });

      const reply =
        response.choices?.[0]?.message?.content?.trim() ||
        "I’m sorry, I could not generate a response.";

      return res.json({ reply, mode: "openai" });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ error: "Failed to process chat request." });
    }
  }
);

function buildSystemPrompt(config) {
  return `You are the website chatbot for ${config.businessName || "this business"}.

Business type: ${config.industry}
Tone: ${config.tone}
Primary goal: ${config.primaryGoal}

Business description:
${config.businessDescription || "No description provided."}

Business hours:
${config.hours || "Not provided."}

Contact info:
${config.contact || "Not provided."}

Call to action:
${config.cta || "Contact the business."}

Service areas:
${config.serviceAreas || "Not provided."}

Frequently asked questions:
${Array.isArray(config.faqSeeds) && config.faqSeeds.length
  ? config.faqSeeds.map((q, i) => `${i + 1}. ${q}`).join("\n")
  : "No FAQs provided."}

Lead capture fields:
${config?.leadCapture?.fields?.length ? config.leadCapture.fields.join(", ") : "None specified."}

Instructions:
- Be concise, friendly, and helpful.
- Match the selected tone.
- Use only the business information provided.
- Do not invent pricing, policies, or hours.
- If unsure, say so and direct the visitor to the contact information.
- Support the primary goal: ${config.primaryGoal}.
- Encourage the CTA when appropriate.`;
}

function createMockReply(message, config) {
  const lower = String(message || "").toLowerCase();

  if (lower.includes("hours")) {
    return config.hours ? `${config.businessName} is open: ${config.hours}.` : `I don’t see business hours listed yet.`;
  }
  if (lower.includes("contact") || lower.includes("phone") || lower.includes("email")) {
    return config.contact ? `You can contact ${config.businessName} here: ${config.contact}.` : `I don’t have contact info listed yet.`;
  }
  if (lower.includes("where") || lower.includes("service area") || lower.includes("location")) {
    return config.serviceAreas ? `We serve: ${config.serviceAreas}.` : `I don’t see a service area listed yet.`;
  }
  if (lower.includes("book") || lower.includes("appointment")) {
    return `I can help with that. ${config.cta ? config.cta + "." : "Please contact the business to get started."}`;
  }
  if (lower.includes("services") || lower.includes("offer") || lower.includes("do")) {
    return config.businessDescription ? `${config.businessName}: ${config.businessDescription}` : `The business owner has not added service details yet.`;
  }

  return `Thanks for reaching out to ${config.businessName || "us"}. I’m here to help with ${String(config.primaryGoal || "your needs").toLowerCase()}. ${config.cta ? `Next step: ${config.cta}.` : ""}`.trim();
}
