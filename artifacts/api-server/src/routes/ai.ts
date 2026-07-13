import { Router } from "express";
import OpenAI from "openai";
import { db } from "@workspace/db";
import { personsTable, lifeEventsTable, accountsTable, relationshipsTable } from "@workspace/db";
import { eq, and, ilike } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { formatPerson } from "./auth";
import { syncPersonToRelationshipLayer } from "../lib/syncRelationship";
import { buildPersonUpdateData, type PersonUpdateInput } from "../lib/personUpdate";
import { isParentOf } from "../lib/visibility";
import { isLastAdminInUnit } from "../lib/permissions";
import { VALID_EVENT_TYPES } from "./lifeEvents";

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Optional profile fields that can be captured alongside a name+relationship,
// either when adding someone new or updating someone who's already in the tree.
// Nullable so update_family_member can express "clear this field", e.g. "remove
// grandma's birthday" -> birthday: null.
const DETAIL_FIELD_PROPERTIES: Record<string, Record<string, unknown>> = {
  birthday: {
    type: ["string", "null"],
    description:
      'Birthday as YYYY-MM-DD. If the year is unknown, use "2000" as a placeholder year (e.g. "March 5th" -> "2000-03-05"). If the exact day is unknown, do not set this field at all. To remove an existing birthday, pass null.',
  },
  showBirthYear: {
    type: "boolean",
    description:
      "Only set this if the user explicitly says whether their birth year should be shown to the family or kept private. Leave unset otherwise.",
  },
  phone: { type: ["string", "null"], description: "Phone number, in whatever format the user gave it. Pass null to remove it." },
  email: { type: ["string", "null"], description: "Email address. Pass null to remove it." },
  addressLine1: { type: ["string", "null"], description: "Street address, if mentioned. Pass null to remove it." },
  addressCity: { type: ["string", "null"], description: "City, if mentioned. Pass null to remove it." },
  addressState: { type: ["string", "null"], description: "State/province, if mentioned. Pass null to remove it." },
  addressZip: { type: ["string", "null"], description: "ZIP/postal code, if mentioned. Pass null to remove it." },
  instagram: { type: ["string", "null"], description: "Instagram username, without the @ symbol. Pass null to remove it." },
  facebook: { type: ["string", "null"], description: "Facebook username or URL. Pass null to remove it." },
  tiktok: { type: ["string", "null"], description: "TikTok username, without the @ symbol. Pass null to remove it." },
  linkedin: { type: ["string", "null"], description: "LinkedIn username. Pass null to remove it." },
  snapchat: { type: ["string", "null"], description: "Snapchat username, without the @ symbol. Pass null to remove it." },
  venmo: { type: ["string", "null"], description: "Venmo username, without the @ symbol. Pass null to remove it." },
  bereal: { type: ["string", "null"], description: "BeReal username, without the @ symbol. Pass null to remove it." },
  otherSocial: { type: ["string", "null"], description: "Any other social link mentioned. Pass null to remove it." },
};

const ADD_MEMBER_TOOL: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "add_family_member",
    description:
      "Add a new member to the family tree. Only call this once you have confirmed the person's first name, last name, and their relationship to the family. If the user mentioned other details about them in the same message (birthday, phone, email, address, socials), include those too so nothing has to be re-asked.",
    parameters: {
      type: "object",
      properties: {
        firstName: { type: "string", description: "The person's first name" },
        lastName: { type: "string", description: "The person's last name" },
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
        ...DETAIL_FIELD_PROPERTIES,
      },
      required: ["firstName", "lastName", "relationshipLabel"],
    },
  },
};

const UPDATE_MEMBER_TOOL: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "update_family_member",
    description:
      "Update information on someone who is ALREADY in the family tree (use this instead of add_family_member when the person appears in the current members list below). Only include the fields that should change.",
    parameters: {
      type: "object",
      properties: {
        personId: {
          type: "string",
          description: "The [id] of the existing person to update, exactly as it appears in the current members list. Never fabricate this.",
        },
        firstName: { type: "string", description: "Corrected first name, only if the user is fixing a typo or name change." },
        lastName: { type: "string", description: "Corrected last name, only if the user is fixing a typo or name change." },
        ...DETAIL_FIELD_PROPERTIES,
      },
      required: ["personId"],
    },
  },
};

const ADD_LIFE_EVENT_TOOL: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "add_life_event",
    description:
      "Log a life event (graduation, marriage, new baby, move, new job, passing, or other milestone) for someone already in the family tree.",
    parameters: {
      type: "object",
      properties: {
        personId: {
          type: "string",
          description: "The [id] of the person this event happened to, exactly as it appears in the current members list. Never fabricate this.",
        },
        eventType: {
          type: "string",
          enum: Array.from(VALID_EVENT_TYPES),
          description:
            'Map casual phrasing to one of these: "graduated" -> graduation, "got married"/"married" -> marriage, "had a baby"/"new baby" -> new_baby, "moved to" -> moved, "got a new job"/"started a job" -> new_job, "passed away"/"died" -> death. Anything else -> custom.',
        },
        eventDate: {
          type: "string",
          description:
            'Date as YYYY-MM-DD. If only the year is known, use "YYYY-01-01". If year and month are known but not the day, use "YYYY-MM-01".',
        },
        notes: {
          type: "string",
          description: "Optional short detail, e.g. \"Graduated from UT Austin\" or \"New job at Acme Corp\".",
        },
      },
      required: ["personId", "eventType", "eventDate"],
    },
  },
};

const DELETE_MEMBER_TOOL: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "delete_family_member",
    description:
      "Permanently remove someone from the family tree. This is IRREVERSIBLE. Only call this after the user has explicitly confirmed in a follow-up message (you asked something like \"Are you sure you want to remove X? This can't be undone\" and they said yes). Never call this in the same turn as the first request to remove someone.",
    parameters: {
      type: "object",
      properties: {
        personId: {
          type: "string",
          description: "The [id] of the person to remove, exactly as it appears in the current members list. Never fabricate this.",
        },
      },
      required: ["personId"],
    },
  },
};

function buildSystemPrompt(members: ReturnType<typeof formatPerson>[]): string {
  const memberList =
    members.length === 0
      ? "No members yet."
      : members
          .map((m) => {
            const gaps: string[] = [];
            if (!m.birthday) gaps.push("no birthday on file");
            if (!m.phone && !m.email) gaps.push("no contact info on file");
            const gapStr = gaps.length ? ` {${gaps.join(", ")}}` : "";
            return `- ${m.firstName} ${m.lastName} (${m.relationshipLabel ?? "unknown"}) [id: ${m.id}]${m.isAdmin ? " [family admin]" : ""}${gapStr}`;
          })
          .join("\n");

  return `You are Olive, a friendly assistant that helps people build and maintain their family tree. Your job is to make data entry effortless — people should be able to tell you things the way they'd tell a friend, in whatever order and format they naturally use, and you figure out what to do with it.

Current family members:
${memberList}

You have four tools:
1. add_family_member — for someone NOT in the list above.
2. update_family_member — for someone ALREADY in the list above (fix a typo, add a birthday, update contact info, etc.). Match by name; if two members share a first name, ask which one before acting.
3. add_life_event — log a graduation, marriage, new baby, move, new job, or other milestone for someone in the list.
4. delete_family_member — permanently remove someone. IRREVERSIBLE — see confirmation rule below.

General guidelines:
- Be warm and concise — like a helpful friend, not a form. Keep responses to 1-3 sentences.
- Accept information in any format: full sentences, fragments, lists of multiple people/facts in one message, corrections to something said earlier, whatever the user types. Extract everything usable from a single message and act on all of it — call multiple tools back to back in one turn rather than asking the user to repeat things one at a time.
- Don't ask for extra confirmation before calling add_family_member, update_family_member, or add_life_event once you have enough information. Just do it, then give a short warm confirmation (e.g. "Done! Sarah is now in your family tree 🌿" or "Got it — added Jake's birthday.").
- EXCEPTION — deleting someone is different and requires confirmation first: when the user asks to remove/delete someone, do NOT call delete_family_member yet. Instead ask "Are you sure you want to remove [name]? This can't be undone." Only call the tool if their next message confirms yes. Never claim you removed someone unless the tool call actually returned success.
- Removing/clearing a single field (e.g. "remove grandma's birthday", "delete his email") is NOT the same as deleting a person — use update_family_member and pass null explicitly for that field. This does not need the delete confirmation step.
- After any tool call, only tell the user it succeeded if the tool result said success — if it failed, say so honestly rather than guessing why.
- If a message is genuinely ambiguous (which person is meant, or a relationship that doesn't fit the rules below), ask ONE short clarifying question rather than guessing.
- The {no birthday on file} / {no contact info on file} tags next to a name show what's still missing for that person — if it's natural in conversation, you can mention a gap, but don't interrogate the user about it unprompted.

Relationship labeling (only relevant for add_family_member) — apply in order, most specific first:

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
- Before calling add_family_member, check the current members list above. If someone with the same first name, last name, and relationship already exists, do NOT call the tool — use update_family_member instead if they mentioned new info, or just tell the user they're already in the tree.
- Add one person at a time, back to back, if multiple people are mentioned in one message.

Updating members and life events:
- Use update_family_member for corrections or new details about someone already in the list (birthdays, contact info, address, socials, name fixes). Only pass the fields that are changing.
- To remove/clear a single field (birthday, phone, email, an address field, a social handle), use update_family_member and pass null for that field specifically — do not use delete_family_member for this.
- Use add_life_event for milestones (graduations, marriages, new babies, moves, new jobs, passings) — these are separate from profile fields and don't go through update_family_member.
- Dates: always output YYYY-MM-DD. For birthdays with no known year, use "2000" as the placeholder year. For life events with an unknown month/day, default the missing part(s) to "01".

Deleting members:
- delete_family_member permanently removes the person and their account. Always confirm first per the rule above before calling it.`;
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
  const memberIds = new Set(members.map((m: ReturnType<typeof formatPerson>) => m.id));

  // Loaded once and reused for every isParentOf check in the tool-call loop
  // below, so a parent (not just an admin) can update or log life events for
  // their own kids without needing admin rights.
  const relationships = await db
    .select({
      fromPerson: relationshipsTable.fromPerson,
      toPerson: relationshipsTable.toPerson,
      type: relationshipsTable.type,
    })
    .from(relationshipsTable)
    .where(eq(relationshipsTable.familyId, unitId));

  const systemPrompt = buildSystemPrompt(members);

  const currentMessages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  let memberAdded: ReturnType<typeof formatPerson> | null = null;
  let memberUpdated: ReturnType<typeof formatPerson> | null = null;
  let lifeEventAdded: { personName: string; eventType: string } | null = null;
  let memberDeleted: { name: string } | null = null;
  let finalText = "";
  let loopMessages = [...currentMessages];
  let loopCount = 0;

  while (loopCount < 8) {
    loopCount++;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: loopMessages,
      tools: [ADD_MEMBER_TOOL, UPDATE_MEMBER_TOOL, ADD_LIFE_EVENT_TOOL, DELETE_MEMBER_TOOL],
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
      let toolResult: string;
      try {
        if (toolCall.function.name === "add_family_member") {
          const input = JSON.parse(toolCall.function.arguments) as PersonUpdateInput & {
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
            const detailData = buildPersonUpdateData(input, { allowRelationshipLabel: false });
            delete (detailData as Record<string, unknown>).updatedAt;

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
                ...detailData,
              })
              .returning();

            memberAdded = formatPerson(inserted);
            toolResult = JSON.stringify({ success: true, member: memberAdded });

            // Sync to explicit relationship layer (best-effort)
            const adminMember = members.find((m: ReturnType<typeof formatPerson>) => m.isAdmin);
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
        } else if (toolCall.function.name === "update_family_member") {
          const input = JSON.parse(toolCall.function.arguments) as PersonUpdateInput & { personId: string };

          if (!memberIds.has(input.personId)) {
            toolResult = JSON.stringify({ success: false, error: "Unknown personId" });
          } else {
            const isSelf = req.auth!.personId === input.personId;
            const isSameFamilyAdmin = req.auth!.isAdmin; // already scoped to this unit above
            const isParent = isParentOf(req.auth!.personId, input.personId, rawMembers, relationships);
            if (!isSelf && !isSameFamilyAdmin && !isParent) {
              toolResult = JSON.stringify({ success: false, error: "Not authorized to update this person" });
            } else {
              const updateData = buildPersonUpdateData(input, { allowRelationshipLabel: req.auth!.isAdmin });
              const [updated] = await db
                .update(personsTable)
                .set(updateData)
                .where(eq(personsTable.id, input.personId))
                .returning();
              memberUpdated = formatPerson(updated);
              toolResult = JSON.stringify({ success: true, member: memberUpdated });
            }
          }
        } else if (toolCall.function.name === "add_life_event") {
          const input = JSON.parse(toolCall.function.arguments) as {
            personId: string;
            eventType: string;
            eventDate: string;
            notes?: string;
          };

          const target = members.find((m: ReturnType<typeof formatPerson>) => m.id === input.personId);
          const validDate = /^\d{4}-\d{2}-\d{2}$/.test(input.eventDate);

          if (!target || !VALID_EVENT_TYPES.has(input.eventType) || !validDate) {
            toolResult = JSON.stringify({ success: false, error: "Invalid input" });
          } else {
            const isSelf = req.auth!.personId === input.personId;
            const isSameFamilyAdmin = req.auth!.isAdmin;
            const isParent = isParentOf(req.auth!.personId, input.personId, rawMembers, relationships);
            if (!isSelf && !isSameFamilyAdmin && !isParent) {
              toolResult = JSON.stringify({ success: false, error: "Not authorized to add a life event for this person" });
            } else {
              await db.insert(lifeEventsTable).values({
                familyId: unitId,
                personId: input.personId,
                eventType: input.eventType,
                eventDate: input.eventDate,
                notes: input.notes ?? null,
                createdBy: req.auth!.personId,
              });
              lifeEventAdded = { personName: `${target.firstName} ${target.lastName}`, eventType: input.eventType };
              toolResult = JSON.stringify({ success: true });
            }
          }
        } else if (toolCall.function.name === "delete_family_member") {
          const input = JSON.parse(toolCall.function.arguments) as { personId: string };
          const target = members.find((m: ReturnType<typeof formatPerson>) => m.id === input.personId);

          if (!target) {
            toolResult = JSON.stringify({ success: false, error: "Unknown personId" });
          } else {
            const isSelf = req.auth!.personId === input.personId;
            const isSameFamilyAdmin = req.auth!.isAdmin;
            if (!isSelf && !isSameFamilyAdmin) {
              toolResult = JSON.stringify({ success: false, error: "Not authorized to remove this person" });
            } else if (target.isAdmin && (await isLastAdminInUnit(target.id, unitId))) {
              // Deleting the last admin would leave this family unit with
              // zero admins -- same guard as the REST delete/admin-PATCH endpoints.
              toolResult = JSON.stringify({
                success: false,
                error: "Cannot remove the last admin in the family. Grant admin access to someone else first.",
              });
            } else {
              await db.delete(accountsTable).where(eq(accountsTable.personId, input.personId));
              await db.delete(personsTable).where(eq(personsTable.id, input.personId));
              memberDeleted = { name: `${target.firstName} ${target.lastName}` };
              toolResult = JSON.stringify({ success: true });
            }
          }
        } else {
          toolResult = JSON.stringify({ success: false, error: "Unknown tool" });
        }
      } catch {
        toolResult = JSON.stringify({ success: false, error: "Failed to process request" });
      }

      loopMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult,
      });
    }
  }

  res.json({ reply: finalText, memberAdded, memberUpdated, lifeEventAdded, memberDeleted });
});

export default router;
