import "server-only";
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { eq } from "drizzle-orm";
import { getModelForTier } from "@/lib/shared/models";
import { db, schema } from "@/lib/state/db";

const MAX_TITLE_WORDS = 6;
const TITLE_TIMEOUT_MS = 20_000;

const TITLE_SYSTEM_PROMPT = `You generate short titles for AI workflow runs in a GTM (go-to-market) tool. The user gives you the founder's prompt for the run; you return a 4–6 word title summarizing what the run is about. No quotes, no punctuation at the end, no prefix like "Title:". Just the title.`;

function fallbackTitle(prompt: string): string {
  const words = prompt
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, MAX_TITLE_WORDS);
  return words.join(" ") || "Untitled run";
}

function trimTitle(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.!?,;:]+$/g, "")
    .split(/\s+/)
    .slice(0, MAX_TITLE_WORDS)
    .join(" ");
}

async function callTitleModel(prompt: string): Promise<string | null> {
  const options: Options = {
    model: getModelForTier("haiku"),
    systemPrompt: TITLE_SYSTEM_PROMPT,
    allowedTools: [],
    maxTurns: 1,
    permissionMode: "bypassPermissions",
  };

  const collect = (async () => {
    const stream = query({
      prompt: `Founder prompt:\n\n${prompt}\n\nReturn the title now.`,
      options,
    });
    let text = "";
    for await (const message of stream) {
      if (
        message.type === "assistant" &&
        message.message?.content
      ) {
        for (const block of message.message.content) {
          if (block.type === "text") text += block.text;
        }
      }
      if (message.type === "result") break;
    }
    return text;
  })();

  const result = await Promise.race([
    collect,
    new Promise<string>((_, reject) =>
      setTimeout(
        () => reject(new Error("title-gen timeout")),
        TITLE_TIMEOUT_MS,
      ),
    ),
  ]);

  const cleaned = trimTitle(result);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Generate a short title for a run, persist it, and emit a `run_titled`
 * event. Fire-and-forget from the workflow runtime — failure here MUST NOT
 * fail the run; we fall back to the first 6 words of the prompt.
 */
export async function generateAndPersistRunTitle(
  workflowRunId: string,
  prompt: string,
): Promise<void> {
  let title: string;
  try {
    const llm = process.env.GMAESTRO_MOCK_CONDUCTOR === "1" || !process.env.ANTHROPIC_API_KEY
      ? null
      : await callTitleModel(prompt);
    title = llm ?? fallbackTitle(prompt);
  } catch (err) {
    console.warn(
      `[title] LLM title gen failed for run ${workflowRunId}, using fallback:`,
      err,
    );
    title = fallbackTitle(prompt);
  }

  await db
    .update(schema.workflowRuns)
    .set({ title })
    .where(eq(schema.workflowRuns.id, workflowRunId));

  const { eventBus } = await import("@/lib/realtime/bus");
  eventBus.emit("run_titled", { workflowRunId, title });
}
