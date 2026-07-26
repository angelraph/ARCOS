import OpenAI from "openai";

let client: OpenAI | undefined;
function getClient(): OpenAI | undefined {
  if (!process.env.OPENAI_API_KEY) return undefined;
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

// Generates a one-sentence rationale for an agent decision. Falls back to a templated
// string when no OPENAI_API_KEY is set, mirroring arc-nanopayments' mock-mode pattern —
// the deterministic state machine's control flow never depends on the LLM call, only the
// human-readable explanation text does.
export async function generateRationale(prompt: string, fallback: string): Promise<string> {
  const openai = getClient();
  if (!openai) return fallback;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an autonomous ARCOS business agent. State the reason for this decision in one concise, factual sentence. No hedging, no disclaimers.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 80,
  });

  return response.choices[0]?.message?.content?.trim() || fallback;
}
