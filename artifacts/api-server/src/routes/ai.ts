import { Router } from "express";
import OpenAI from "openai";
import { db } from "@workspace/db";
import { personsTable } from "@workspace/db";
import { eq, and, ilike } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { formatPerson } from "./auth";
import { syncPersonToRelationshipLayer } from "../lib/syncRelationship";

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ADD_MEMBER_TOOL: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "add_family_member",
    description:
      "Add a new member to the family tree. Only call this once you have confirmed the person's first name, last name, and their relationship to the family.",
    parameters: {
      type: "object",
      properties: {
        firstName: {
          type: "string",
          description: "The person's first name",
        },
        lastName: {
          type: "string",
          description: "The person's last name",
        },
        relationshipLabel: {
          type: "string",
          description:
            'Their relationship label. Use lowercase. Common values: "mom", "dad", "son", "daughter", "sister", "brother", "wife", "husband", "grandmother", "grandfather", "grandson", "granddaughter", "aunt", "uncle", "cousin", "sister-in-law", "brother-in-law", "mother-in-law", "father-in-law". IMPORTANT: (1) if someone is the spouse of a sibling (e.g. "my brother\'s wife"), label them "sister-in-law" or "brother-in-law". (2) if someone is the parent of the admin\'s spouse (e.g. "Miranda\'s mom", "my wife\'s dad"), label them "mother-in-law" or "father-in-law", NOT "mom" or "dad".',
        },
        parentPersonId: {
          type: "string",
          description:
            "Optional. The ID of their direct parent or spouse link in the tree. ALWAYS set this for: (1) grandchildren, nephews/nieces, and uncles/aunts — use the parent's [id]; (2) a sibling's spouse — use the sibling's [id]; (3) an uncle's or aunt's spouse — use that uncle's/aunt's [id]. For example, if adding Tanner's wife Anna, set parentPersonId to Tanner's id. If adding Nathan's kids, set parentPersonId to Nathan's id. If adding James's children (James is a grandfather), set parentPersonId to James's id.",
        },
      },
      required: ["firstName", "lastName", "relationshipLabel"],
    },
  },
};

function buildSystemPrompt(members: ReturnType<typeof formatPerson>[]): string {
  const memberList =
    members.length === 0
      ? "No members yet."
      : members
          .map(
            (m) =>
              `- ${m.firstName} ${m.lastName} (${m.relationshipLabel ?? "unknown"}) [id: ${m.id}]${m.isAdmin ? " [family admin]" : ""}`,
          )
          .join("\n");

  return `You are Olive, a friendly assistant that helps people build their family tree.

Your job is to help the user add new family members through a short, warm conversation. Ask clarifying questions only when needed — most people just need first name, last name, and relationship.

Current family members:
${memberList}

Guidelines:
- Be warm and concise — like a helpful friend, not a form.
- Accept common relationship words directly (mom, dad, son, daughter, sister, brother, wife, husband, grandma, grandpa, etc.).
- If someone mentions a sibling AND their spouse together (e.g. "my brother and his wife"), add them as two separate people: the sibling as "brother"/"sister", and the spouse as "brother-in-law"/"sister-in-law". Never label a sibling's spouse as "wife", "husband", "sister", or "brother". ALWAYS set parentPersonId on the spouse to the sibling's id (e.g. when adding Tanner's wife Anna, set Anna's parentPersonId to Tanner's id).
- If someone mentions a spouse's parent (e.g. "Miranda's mom", "my wife's dad", "my mother-in-law"), label them "mother-in-law" or "father-in-law", never "mom" or "dad".
- Last name inference: if the user does NOT provide a last name, infer it — do NOT ask. Use the father's last name when the context makes it clear (e.g. "Nathan's kids" → use Nathan Rigby's last name "Rigby"). If you genuinely cannot infer the last name from context or the existing members list, only then ask for it.
- Nephew/niece rule: when the user says "[someone else]'s kids/children" and that person is a sibling or in-law (not the admin themselves), label them "nephew" (male/unknown) or "niece" (female) — NOT "son" or "daughter". Sons and daughters are only used for the admin's own children. Always set parentPersonId to that person's id.
- Uncle/aunt rule: when the user says "[someone]'s kids/children" and that person is a grandparent (labeled grandfather, grandmother, grandpa, grandma, etc.), label those children "uncle" (male/unknown) or "aunt" (female) — NOT "brother" or "sister". Always set parentPersonId to that grandparent's id. If the user also mentions that uncle's/aunt's spouse, label the spouse "aunt" or "uncle" and set parentPersonId to their spouse's id.
- When adding a child or grandchild that belongs to a specific person (e.g. "Nathan's kids"), always set parentPersonId to that person's id from the members list above.
- Once you have first name, last name, and relationship for each person, call add_family_member — add one person at a time, back to back.
- Before calling add_family_member, check the current members list above. If someone with the same first name, last name, and relationship already exists, do NOT call the tool — just tell the user they're already in the tree.
- Don't ask for extra confirmation before adding.
- After adding someone, give a short warm confirmation (e.g. "Done! Sarah is now in your family tree 🌿").
- Handle one person at a time if multiple are mentioned.
- Keep responses to 1–3 sentences max.`;
}

// POST /api/ai/chat
router.post("/ai/chat", requireAuth, async (req, res) => {
  const { messages, unitId } = req.body as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    unitId: string;
  };

  if (!Array.isArray(messages) || typeof unitId !== "string") {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  if (req.auth?.familyUnitId !== unitId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Load current members for context
  const rawMembers = await db
    .select()
    .from(personsTable)
    .where(eq(personsTable.familyUnitId, unitId));
  const members = rawMembers.map(formatPerson);

  const systemPrompt = buildSystemPrompt(members);

  const currentMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  let memberAdded: ReturnType<typeof formatPerson> | null = null;
  let finalText = "";
  let loopMessages = [...currentMessages];
  let loopCount = 0;

  while (loopCount < 5) {
    loopCount++;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: loopMessages,
      tools: [ADD_MEMBER_TOOL],
      tool_choice: "auto",
    });

    const choice = response.choices[0];
    if (!choice) break;

    const assistantMsg = choice.message;
    loopMessages.push(assistantMsg);

    if (choice.finish_reason === "stop" || !assistantMsg.tool_calls?.length) {
      finalText = assistantMsg.content ?? "";
      break;
    }

    // Handle tool calls
    for (const toolCall of assistantMsg.tool_calls) {
      if (toolCall.function.name === "add_family_member") {
        let toolResult: string;
        try {
          const input = JSON.parse(toolCall.function.arguments) as {
            firstName: string;
            lastName: string;
            relationshipLabel: string;
            parentPersonId?: string;
          };

          // Duplicate guard — same name + same relationship already in this unit
          const existing = await db
            .select()
            .from(personsTable)
            .where(
              and(
                eq(personsTable.familyUnitId, unitId),
                ilike(personsTable.firstName, input.firstName.trim()),
                ilike(personsTable.lastName, input.lastName.trim()),
                ilike(personsTable.relationshipLabel, input.relationshipLabel.trim()),
              ),
            )
            .limit(1);

          if (existing.length > 0) {
            memberAdded = formatPerson(existing[0]);
            toolResult = JSON.stringify({ success: true, member: memberAdded, alreadyExists: true });
          } else {
            const [inserted] = await db
              .insert(personsTable)
              .values({
                firstName: input.firstName,
                lastName: input.lastName,
                relationshipLabel: input.relationshipLabel,
                parentPersonId: input.parentPersonId ?? null,
                familyUnitId: unitId,
                isAdmin: false,
                claimed: false,
              })
              .returning();

            memberAdded = formatPerson(inserted);
            toolResult = JSON.stringify({ success: true, member: memberAdded });

            // Sync to explicit relationship layer (best-effort)
            const adminMember = members.find((m) => m.isAdmin);
            if (adminMember) {
              await syncPersonToRelationshipLayer({
                personId: inserted.id,
                familyId: unitId,
                firstName: inserted.firstName,
                lastName: inserted.lastName,
                label: inserted.relationshipLabel,
                adminId: adminMember.id,
                parentPersonId: inserted.parentPersonId,
              });
            }
          }
        } catch {
          toolResult = JSON.stringify({ success: false, error: "Failed to add member" });
        }

        loopMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult,
        });
      }
    }
  }

  res.json({ reply: finalText, memberAdded });
});

export default router;
