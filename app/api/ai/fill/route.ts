import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { DEMO_MODE, isAllowedEmail } from "@/lib/supabase/config";
import type { AiFillRequest, AiFillResult } from "@/lib/ai";

// Reads a free-text task description and suggests the task fields.
// The API key stays on the server (ANTHROPIC_API_KEY in Vercel env vars).

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_DESCRIPTION = 8000;

const SYSTEM = `You turn a short task description from the UNCVRD team into structured task fields for their internal task tracker. UNCVRD is an apparel and soft-goods product creation company based in Ho Chi Minh City. Descriptions may be in English, Vietnamese, or a mix.

How to fill each field:
- title: a short imperative task name in English, at most 60 characters, like "Send TKL mid-month report to Jan". Keep people's names, brand names and project names as written.
- job_role: the kind of work, e.g. "Administrative", "Graphic Design", "Product Development", "Sourcing", "Marketing". Empty string if unclear.
- project_id / client_id / assignee_id: pick an id from the lists provided only when the description clearly refers to that project, client or person. Otherwise use an empty string. Never invent ids.
- priority: a number from 1.0 to 4.9, lower is more urgent. 1.0 = game over (something breaks or a deadline is lost if not done now), 2.0 = major loss, 3.0 = major gain (the normal default), 4.0 = nice-to-have. Use .5 steps when it falls between.
- tier: "need" unless the description says it is optional, low priority, or "if there is time", then "nice".
- difficulty: SIMP = under 1h (usually 15min), MOD = 1h to under 2h30, COMP = about 3h to 5h, SUPC = 6h or more.
- htc_minutes: your estimate of hands-on minutes to complete, consistent with difficulty. Typical values: 15, 30, 45, 60, 90, 120, 180, 240, 480.
- due_date: YYYY-MM-DD if the description gives or implies a date ("by Friday", "ngày mai", "before the 20th"). Resolve relative dates from today's date given below. Empty string if none.
- repeat: "daily", "weekly" or "monthly" only if the task recurs; otherwise "none".
- explanation_url: the first link in the description, or empty string.
- summary: one short sentence, in the same language as the description, saying what you filled in and anything you were unsure about.`;

function schema(req: AiFillRequest) {
  const ids = (list: { id: string }[]) => ["", ...list.map((x) => x.id)];
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "job_role", "project_id", "client_id", "assignee_id", "priority", "tier", "difficulty", "htc_minutes", "due_date", "repeat", "explanation_url", "summary"],
    properties: {
      title: { type: "string" },
      job_role: { type: "string" },
      project_id: { type: "string", enum: ids(req.projects) },
      client_id: { type: "string", enum: ids(req.clients) },
      assignee_id: { type: "string", enum: ids(req.people) },
      priority: { type: "number" },
      tier: { type: "string", enum: ["need", "nice"] },
      difficulty: { type: "string", enum: ["SIMP", "MOD", "COMP", "SUPC"] },
      htc_minutes: { type: "integer" },
      due_date: { type: "string" },
      repeat: { type: "string", enum: ["none", "daily", "weekly", "monthly"] },
      explanation_url: { type: "string" },
      summary: { type: "string" },
    },
  };
}

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: NextRequest) {
  // Only signed-in UNCVRD staff may spend API credits
  if (!DEMO_MODE) {
    const supabase = await getServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user || !isAllowedEmail(data.user.email)) return bad(401, "Please sign in again.");
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return bad(503, "AI is not set up yet. Add ANTHROPIC_API_KEY in Vercel > Settings > Environment Variables, then redeploy.");
  }

  let body: AiFillRequest;
  try {
    body = (await request.json()) as AiFillRequest;
  } catch {
    return bad(400, "Invalid request.");
  }
  const description = (body.description ?? "").trim();
  if (description.length < 3) return bad(400, "Write a description first.");
  if (description.length > MAX_DESCRIPTION) return bad(400, `Description is too long (max ${MAX_DESCRIPTION} characters).`);
  const req: AiFillRequest = {
    description,
    today: String(body.today ?? "").slice(0, 40),
    projects: (body.projects ?? []).slice(0, 500),
    clients: (body.clients ?? []).slice(0, 500),
    people: (body.people ?? []).slice(0, 200),
  };

  const lists = [
    `Today: ${req.today} (Asia/Ho_Chi_Minh)`,
    `Projects (id: name):\n${req.projects.map((p) => `${p.id}: ${p.label}`).join("\n") || "(none)"}`,
    `Clients (id: name):\n${req.clients.map((p) => `${p.id}: ${p.label}`).join("\n") || "(none)"}`,
    `People (id: name, role):\n${req.people.map((p) => `${p.id}: ${p.label}`).join("\n") || "(none, leave assignee_id empty)"}`,
  ].join("\n\n");

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: schema(req) } },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: `${lists}\n\n<description>\n${description}\n</description>`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return bad(422, "The AI could not process this description. Fill the fields by hand.");
    }
    if (response.stop_reason === "max_tokens") {
      return bad(502, "The AI response was cut off. Try a shorter description.");
    }
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return bad(502, "The AI returned no answer. Try again.");
    const raw = JSON.parse(text.text) as AiFillResult;

    // Clamp and clean before it touches the task
    const known = (id: string, list: { id: string }[]) => (id && list.some((x) => x.id === id) ? id : "");
    const result: AiFillResult = {
      title: raw.title.trim().slice(0, 80),
      job_role: raw.job_role.trim().slice(0, 60),
      project_id: known(raw.project_id, req.projects),
      client_id: known(raw.client_id, req.clients),
      assignee_id: known(raw.assignee_id, req.people),
      priority: Math.min(4.9, Math.max(1, Math.round(Number(raw.priority) * 10) / 10 || 3)),
      tier: raw.tier === "nice" ? "nice" : "need",
      difficulty: raw.difficulty,
      htc_minutes: Math.min(24 * 60, Math.max(5, Math.round(Number(raw.htc_minutes) || 15))),
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(raw.due_date) ? raw.due_date : "",
      repeat: raw.repeat,
      explanation_url: /^https?:\/\//i.test(raw.explanation_url) ? raw.explanation_url.slice(0, 500) : "",
      summary: raw.summary.slice(0, 300),
    };
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SyntaxError) return bad(502, "The AI answer could not be read. Try again.");
    if (error instanceof Anthropic.AuthenticationError) return bad(503, "The Anthropic API key is invalid. Check ANTHROPIC_API_KEY in Vercel.");
    if (error instanceof Anthropic.RateLimitError) return bad(429, "Too many AI requests right now. Wait a moment and try again.");
    if (error instanceof Anthropic.BadRequestError) return bad(400, `AI request rejected: ${error.message}`);
    if (error instanceof Anthropic.APIError) return bad(502, `AI service error (${error.status}). Try again.`);
    return bad(500, "Something went wrong talking to the AI.");
  }
}
