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
            "Optional. The ID of the person's direct parent or spouse anchor in the tree. ALWAYS set this for: (1) any child attributed to a named person (nephews/nieces, uncles/aunts, cousins, grandchildren, great-grandchildren) — use that person's [id]; (2) any spouse being added for an existing member — use that member's [id]; (3) grandparents whose parent is already in the tree — use that parent's [id]. Examples: adding Tanner's wife Anna → Anna's parentPersonId = Tanner's id. Adding Nathan's kids → parentPersonId = Nathan's id. Adding James's children (James is a grandfather) → parentPersonId = James's id. Adding Jim's cousin's wife → parentPersonId = the cousin's id. NEVER fabricate a parentPersonId — only use IDs that appear in the current members list.",
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

RELATIONSHIP LABELING RULES — apply these in order, most specific first:

Spouses of the admin:
- Label them "husband", "wife", "spouse", or "partner".
- If someone mentions a spouse's parent (e.g. "Miranda's mom", "my wife's dad", "my mother-in-law"), label them "mother-in-law" or "father-in-law", never "mom" or "dad".

Siblings:
- Label as "brother", "sister", or "sibling".
- Half-siblings: label as "half-brother" or "half-sister".
- If someone mentions a sibling AND their spouse together (e.g. "my brother and his wife"), add them as two separate people. The sibling gets "brother"/"sister"; the spouse gets "brother-in-law"/"sister-in-law". Never label a sibling's spouse as "wife", "husband", "sister", or "brother". ALWAYS set parentPersonId on the spouse to the sibling's id.
- If adding a spouse for someone already in the tree as "brother" or "sister" (e.g. "add Tanner's wife"), label that spouse "sister-in-law" or "brother-in-law" and set parentPersonId to that sibling's id.

Uncles/aunts:
- Uncle/aunt rule: when the user says "[someone]'s kids/children" and that person is a grandparent (labeled grandfather, grandmother, grandpa, grandma, nana, papa, etc.), label those children "uncle" (male/unknown) or "aunt" (female) — NOT "brother" or "sister". Always set parentPersonId to that grandparent's id.
- If adding a spouse for someone already in the tree as "uncle" or "aunt" (e.g. "Jim's wife Diane"), label that spouse "aunt" or "uncle" and set parentPersonId to that uncle's/aunt's id.

Nephews/nieces:
- Nephew/niece rule: when the user says "[someone]'s kids/children" and that person is a sibling, brother-in-law, or sister-in-law, label those children "nephew" (male/unknown) or "niece" (female) — NOT "son" or "daughter". Sons and daughters are ONLY used for the admin's own children. Always set parentPersonId to that sibling/in-law's id.
- If adding a spouse for someone already in the tree as "nephew" or "niece", label that spouse "nephew-in-law" or "niece-in-law" and set parentPersonId to that nephew's/niece's id.

Cousins:
- Cousin rule: when the user says "[someone]'s kids/children" and that person is labeled "uncle" or "aunt", label those children "cousin". Always set parentPersonId to that uncle's/aunt's id.
- If adding a spouse for someone labeled "cousin", label that spouse "cousin-in-law" and set parentPersonId to that cousin's id.

Admin's own children and grandchildren:
- Label admin's own children as "son" or "daughter".
- Grandchildren: when the user says "[son/daughter]'s kids/children" and that person is labeled "son" or "daughter", label those children "grandson" (male/unknown) or "granddaughter" (female). Always set parentPersonId to that son's/daughter's id.
- Great-grandchildren: when the user says "[grandson/granddaughter]'s kids", label as "great-grandson" (male/unknown) or "great-granddaughter" (female). Set parentPersonId to that grandchild's id.

Parents and grandparents:
- Label admin's parents as "mom"/"mother" or "dad"/"father".
- Step-parents: label as "stepmother" or "stepfather".
- Grandparents: label as "grandmother" or "grandfather" (also accept grandma/grandpa, nana/papa, etc. — normalize to "grandmother"/"grandfather").
- Parent's parents rule: when the user says "my mom's parents", "my dad's mom", etc. (parent of someone labeled mom/dad/mother/father), label them "grandmother" or "grandfather". Set parentPersonId to that parent's id.
- Great-grandparents: when the user says "my grandma's mom" or "my grandpa's dad" (parent of a grandparent), label them "great-grandmother" or "great-grandfather". Set parentPersonId to that grandparent's id.

Step-relationships (siblings and children):
- Accept and label: "stepbrother", "stepsister", "stepson", "stepdaughter".

Last name inference:
- If the user does NOT provide a last name, infer it — do NOT ask. Use the parent's last name when context makes it clear (e.g. "Nathan's kids" → use Nathan's last name). If you genuinely cannot infer the last name, only then ask.

parentPersonId — always set this when:
- Adding any grandchild, nephew/niece, uncle/aunt, cousin, or great-grandchild — use the direct parent's [id].
- Adding a spouse for any existing member — use that member's [id].
- Adding children attributed to a named person (e.g. "Nathan's kids") — use that person's [id].
- Never fabricate a parentPersonId. Only use IDs that appear in the current members list above.

Adding members:
- Once you have first name, last name, and relationship for each person, call add_family_member — add one person at a time, back to back.
- Before calling add_family_member, check the current members list above. If someone with the same first name, last name, and relationship already exists, do NOT call the tool — just tell the user they're already in the tree.
- Don't ask for extra confirmation before adding.
- After adding someone, give a short warm confirmation (e.g. "Done! Sarah is now in your family tree 🌿").
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
