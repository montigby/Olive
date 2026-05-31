import { useGetFamilyTree, getGetFamilyTreeQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Roles that explicitly mean "my partner" (always form the couple with the head)
const COUPLE_PARTNER_LABELS = new Set([
  "husband", "wife", "spouse", "partner",
]);

// All roles treated as a "parent generation" label
const PARENT_LABELS = new Set([
  "mom", "mother", "dad", "father", "husband", "wife", "spouse",
  "partner", "grandma", "grandpa", "grandmother", "grandfather",
  "nana", "papa", "nan", "pop", "pops", "gram", "gramps",
]);

const GRANDCHILD_LABELS = new Set([
  "grandson", "granddaughter", "grandchild",
]);

// Siblings of the head (and their spouses) — rendered at the same Y as the couple, not below it.
// "uncle" and "aunt" are treated as parent-generation siblings: they appear in the sibling row
// but are connected from the grandparent node (not from the parents couple) when their
// parentPersonId points to a grandparent.
const SIBLING_LABELS = new Set([
  "brother", "sister", "sibling",
  "brother-in-law", "sister-in-law",
  "uncle", "aunt",
]);

// Parents of the spouse — rendered above the couple on the RIGHT side
const INLAW_PARENT_LABELS = new Set([
  "mother-in-law", "father-in-law",
]);

// Children of siblings — rendered below their parent's sibling couple node
const NEPHEW_NIECE_LABELS = new Set([
  "nephew", "niece",
]);

function isParentRole(label: string) {
  return PARENT_LABELS.has(label.toLowerCase().trim());
}

function isExplicitPartner(label: string) {
  return COUPLE_PARTNER_LABELS.has(label.toLowerCase().trim());
}

function isInlawParent(label: string) {
  return INLAW_PARENT_LABELS.has(label.toLowerCase().trim());
}

function isGrandchildRole(label: string) {
  return GRANDCHILD_LABELS.has(label.toLowerCase().trim());
}

// Grandparent-specific labels (subset of PARENT_LABELS — used to separate the
// grandparent generation from the immediate-parent generation in the tree layout)
const GRANDPARENT_LABEL_SET = new Set([
  "grandma", "grandpa", "grandmother", "grandfather",
  "nana", "papa", "nan", "pop", "pops", "gram", "gramps",
]);
function isGrandparentRole(label: string): boolean {
  return GRANDPARENT_LABEL_SET.has(label.toLowerCase().trim());
}

function isSiblingRole(label: string) {
  return SIBLING_LABELS.has(label.toLowerCase().trim());
}

function isNephewNieceRole(label: string) {
  return NEPHEW_NIECE_LABELS.has(label.toLowerCase().trim());
}

// ---------------------------------------------------------------------------
// Layout sizes
// ---------------------------------------------------------------------------
const PERSON_W = 80;            // circle avatar + label below
const COUPLE_CONNECTOR_W = 40;  // ─●─ connector between two circles
const COUPLE_W = PERSON_W * 2 + COUPLE_CONNECTOR_W;
const V_GAP = 160;
const H_GAP = 24;
const PILL_W = 160; // estimated pill width for layout positioning

// ─── Member tree preferences (Phase 2 pin UI) ─────────────────────────────
// type MemberTreePreferences = { pinnedNodes: string[] };
// pinnedNodes: node IDs always shown as full nodes, never collapsed.
// Stored per-member. Phase 2 will surface the UI toggle.

// ─── Pill label generation ────────────────────────────────────────────────
function generatePillLabel(members: any[], spouseFirstName?: string): string {
  const lastNames = [
    ...new Set(members.map((m: any) => m.lastName).filter(Boolean)),
  ] as string[];
  let label: string;
  if (lastNames.length === 1) {
    const isParentsOnly =
      members.length === 2 &&
      members.every((m: any) => isParentRole(m.relationshipLabel ?? ""));
    label = isParentsOnly ? `${lastNames[0]} parents` : `${lastNames[0]} family`;
  } else if (spouseFirstName) {
    label = `${spouseFirstName}'s family`;
  } else {
    label = "In-laws";
  }
  return label.length > 20 ? label.slice(0, 19) + "…" : label;
}

// ---------------------------------------------------------------------------
// PersonCard — circle avatar with name + label below
// data-person-id lets onNodeClick detect which person was clicked
// ---------------------------------------------------------------------------
function PersonCard({ member }: { member: any }) {
  return (
    <div
      data-person-id={member.id}
      className="nopan flex flex-col items-center cursor-pointer select-none group"
      style={{ width: PERSON_W }}
    >
      {/* Circle avatar */}
      <div className="relative flex-shrink-0">
        <Avatar className="h-16 w-16 border-2 border-border shadow-sm group-hover:border-primary/60 group-hover:shadow-md transition-all pointer-events-none">
          <AvatarImage src={member.photoUrl} />
          <AvatarFallback className="text-sm bg-primary/10 text-primary font-semibold">
            {(member.firstName || "?")[0]}{(member.lastName || "?")[0]}
          </AvatarFallback>
        </Avatar>
        {member.claimed && (
          <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-background pointer-events-none" />
        )}
      </div>
      {/* Name + label */}
      <div className="mt-1.5 text-center pointer-events-none w-full px-1">
        <p className="text-xs font-semibold leading-tight truncate text-foreground">{member.firstName}</p>
        <p className="text-[10px] text-muted-foreground truncate leading-snug">{member.relationshipLabel}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node types
// ---------------------------------------------------------------------------

const CoupleNode = ({ data }: any) => {
  const { parents, unitName, pillId } = data as {
    parents: any[];
    unitName: string;
    pillId?: string;
  };
  return (
    <div className="flex flex-col items-center gap-0">
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      {unitName && (
        <div className="mb-2 px-4 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold tracking-wide shadow-sm whitespace-nowrap pointer-events-none">
          {unitName}
        </div>
      )}
      <div className="flex items-start">
        {parents.length === 0 ? (
          <div className="px-4 py-2 text-sm text-muted-foreground italic">No members</div>
        ) : parents.length === 1 ? (
          <PersonCard member={parents[0]} />
        ) : (
          <>
            <PersonCard member={parents[0]} />
            {/* mt-[26px] centres the ─●─ connector with the 64px circle (64/2 - 6 = 26) */}
            <div className="flex items-center mt-[26px] flex-shrink-0 pointer-events-none">
              <div className="w-4 h-0.5 bg-primary/40" />
              <div className="w-3 h-3 rounded-full border-2 border-primary/50 bg-background shadow-sm" />
              <div className="w-4 h-0.5 bg-primary/40" />
            </div>
            <PersonCard member={parents[1]} />
          </>
        )}
      </div>
      {pillId && (
        <div className="mt-1.5 text-[10px] text-muted-foreground hover:text-primary cursor-pointer select-none nopan transition-colors">
          ‹ collapse
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
};

const ChildNode = ({ data }: any) => {
  return (
    <div>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <PersonCard member={data.member} />
      {data.pillId && (
        <div className="text-center mt-1.5 text-[10px] text-muted-foreground hover:text-primary cursor-pointer select-none nopan transition-colors">
          ‹ collapse
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// PillNode — collapsed in-law branch indicator
// ---------------------------------------------------------------------------
const PillNode = ({ data }: any) => {
  const { members, label, pillId } = data as {
    members: any[];
    label: string;
    pillId: string;
  };
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Avatar stack: up to 3, with +N overflow circle
  const displayAvatars = members.length <= 3 ? members : members.slice(0, 2);
  const extraCount = members.length > 3 ? members.length - 2 : 0;
  const tooltipNames =
    members
      .slice(0, 5)
      .map((m: any) => m.firstName)
      .join(", ") + (members.length > 5 ? ` + ${members.length - 5} more` : "");

  const showTooltip = () => setTooltipVisible(true);
  const hideTooltip = () => setTooltipVisible(false);
  const handleMouseEnter = () => {
    if (prefersReducedMotion) return;
    timerRef.current = setTimeout(showTooltip, 400);
  };
  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    hideTooltip();
  };
  const handleTouchStart = () => {
    timerRef.current = setTimeout(() => {
      showTooltip();
      setTimeout(hideTooltip, 2000);
    }, 500);
  };
  const handleTouchEnd = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  return (
    <div
      className="nopan relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        data-pill-id={pillId}
        className="flex items-center gap-1.5 h-8 px-2.5 rounded-full bg-card border border-border/60 shadow-sm cursor-pointer hover:border-primary/50 hover:shadow-md transition-all select-none"
        style={{ minWidth: 140 }}
      >
        {/* Avatar stack */}
        <div className="flex items-center flex-shrink-0">
          {displayAvatars.map((m: any, i: number) => (
            <div
              key={m.id}
              style={{ marginLeft: i > 0 ? -6 : 0, position: "relative", zIndex: 3 - i }}
            >
              <Avatar className="h-5 w-5 border border-background">
                <AvatarImage src={m.photoUrl} />
                <AvatarFallback className="text-[8px] bg-primary/10 text-primary font-semibold">
                  {(m.firstName || "?")[0]}{(m.lastName || "?")[0]}
                </AvatarFallback>
              </Avatar>
            </div>
          ))}
          {extraCount > 0 && (
            <div
              className="h-5 w-5 rounded-full bg-muted border border-background flex items-center justify-center flex-shrink-0"
              style={{ marginLeft: -6 }}
            >
              <span className="text-[7px] text-muted-foreground font-medium">+{extraCount}</span>
            </div>
          )}
        </div>
        {/* Label */}
        <span className="text-[11px] text-muted-foreground truncate max-w-[80px]">{label}</span>
        {/* Count + expand chevron */}
        <span className="text-[11px] text-primary font-medium flex-shrink-0 ml-auto pl-1">
          +{members.length} ›
        </span>
      </div>

      {/* Hover / long-press tooltip */}
      {tooltipVisible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-popover text-popover-foreground text-[10px] rounded-md shadow-lg border border-border whitespace-nowrap z-50 pointer-events-none">
          {tooltipNames}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
};

const nodeTypes = {
  couple: CoupleNode,
  child: ChildNode,
  pill: PillNode,
};

// ---------------------------------------------------------------------------
// Layout engine
// ---------------------------------------------------------------------------

function layoutUnit(
  unit: any,
  cx: number,
  y: number,
  explicitPairs: Map<string, string> = new Map(),
): { nodes: any[]; edges: any[] } {
  const nodes: any[] = [];
  const edges: any[] = [];

  const allMembers: any[] = unit.members || [];
  const grandchildren = allMembers.filter((m: any) => isGrandchildRole(m.relationshipLabel));

  const inlawParents = allMembers.filter((m: any) => isInlawParent(m.relationshipLabel));
  const allParents = allMembers.filter((m: any) => isParentRole(m.relationshipLabel));
  const explicitPartners = allParents.filter((m: any) => isExplicitPartner(m.relationshipLabel));
  const headMembers = allParents.filter((m: any) => !isExplicitPartner(m.relationshipLabel));
  const siblings = allMembers.filter((m: any) => isSiblingRole(m.relationshipLabel));
  const nonParents = allMembers.filter(
    (m: any) =>
      !isParentRole(m.relationshipLabel) &&
      !isGrandchildRole(m.relationshipLabel) &&
      !isSiblingRole(m.relationshipLabel) &&
      !isInlawParent(m.relationshipLabel) &&
      !isNephewNieceRole(m.relationshipLabel),
  );

  // When explicit partner roles (wife/husband/spouse/partner) exist, the couple is
  // [head + partner]. Any remaining head-labeled members (e.g. "Mom" added by "Dad")
  // are a parent generation shown above the couple.
  let finalParents: any[];
  let parentGenMembers: any[];
  let finalChildren: any[];

  if (explicitPartners.length > 0) {
    // The admin is always the couple head; all other non-partner parent-labeled
    // members (e.g. "Mom" added by the admin) belong to the parent generation above.
    const admin = headMembers.find((m: any) => m.isAdmin) ?? headMembers[0];
    finalParents = [admin, explicitPartners[0]].filter(Boolean);
    parentGenMembers = headMembers.filter((m: any) => m.id !== admin?.id);
    finalChildren = nonParents;
  } else {
    // Original behaviour: first two parent-labeled members form the couple
    finalParents = allParents.slice(0, 2);
    parentGenMembers = [];
    finalChildren = [...allParents.slice(2), ...nonParents];
  }

  if (finalParents.length === 0 && finalChildren.length > 0) {
    finalParents = finalChildren.slice(0, 2);
    finalChildren = finalChildren.slice(2);
  }

  const coupleId = `couple-${unit.unitId}`;
  const coupleNodeW = finalParents.length >= 2 ? COUPLE_W : PERSON_W;
  nodes.push({
    id: coupleId,
    type: "couple",
    position: { x: cx - coupleNodeW / 2, y },
    data: { parents: finalParents, unitName: unit.unitName },
  });

  // Helper: render a row of parent-gen nodes above the couple.
  // Returns the node ID that siblings should connect from.
  const renderParentRow = (members: any[], rowCx: number, prefix: string): string => {
    const pgY = y - V_GAP;
    if (members.length === 0) return coupleId;

    if (members.length >= 2) {
      // Render as a couple node so the two parents share one clean card — no overlap
      const pgNodeId = `pg-couple-${unit.unitId}-${prefix}`;
      nodes.push({
        id: pgNodeId,
        type: "couple",
        position: { x: rowCx - COUPLE_W / 2, y: pgY },
        data: { parents: members.slice(0, 2), unitName: "" },
      });
      edges.push({
        id: `e-${pgNodeId}-${coupleId}`,
        source: pgNodeId,
        target: coupleId,
        type: "smoothstep",
        style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.5 },
      });
      return pgNodeId;
    } else {
      // Single parent — render as a child node centred at rowCx
      const pgNodeId = `person-${unit.unitId}-${prefix}-${members[0].id}`;
      nodes.push({
        id: pgNodeId,
        type: "child",
        position: { x: rowCx - PERSON_W / 2, y: pgY },
        data: { member: members[0] },
      });
      edges.push({
        id: `e-${pgNodeId}-${coupleId}`,
        source: pgNodeId,
        target: coupleId,
        type: "smoothstep",
        style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.5 },
      });
      return pgNodeId;
    }
  };

  // ── Step 1: compute sibling slots BEFORE rendering parents so we can centre parents
  //    over the full group (head person + all their siblings).
  type SibSlot = { members: any[] };
  const spencerSlots: SibSlot[] = [];
  const mirandaSlots: SibSlot[] = [];

  if (siblings.length > 0) {
    const brothers = siblings.filter((m: any) => ["brother", "sibling"].includes(m.relationshipLabel.toLowerCase().trim()));
    const sisters  = siblings.filter((m: any) => m.relationshipLabel.toLowerCase().trim() === "sister");
    const sisInLaw = siblings.filter((m: any) => m.relationshipLabel.toLowerCase().trim() === "sister-in-law");
    const broInLaw = siblings.filter((m: any) => m.relationshipLabel.toLowerCase().trim() === "brother-in-law");
    const usedIds  = new Set<string>();

    // Helper: find a sibling's explicit spouse among a candidate list
    const explicitSpouseIn = (person: any, candidates: any[]) =>
      candidates.find((c: any) => !usedIds.has(c.id) && explicitPairs.get(person.id) === c.id);

    for (const bro of brothers) {
      const paired =
        explicitSpouseIn(bro, sisInLaw) ??
        sisInLaw.find((s: any) => !usedIds.has(s.id) && s.parentPersonId === bro.id) ??
        sisInLaw.find((s: any) => !usedIds.has(s.id));
      if (paired) { usedIds.add(paired.id); spencerSlots.push({ members: [bro, paired] }); }
      else { spencerSlots.push({ members: [bro] }); }
      usedIds.add(bro.id);
    }
    for (const sis of sisters) {
      const paired =
        explicitSpouseIn(sis, broInLaw) ??
        broInLaw.find((b: any) => !usedIds.has(b.id) && b.parentPersonId === sis.id) ??
        broInLaw.find((b: any) => !usedIds.has(b.id));
      if (paired) { usedIds.add(paired.id); spencerSlots.push({ members: [sis, paired] }); }
      else { spencerSlots.push({ members: [sis] }); }
      usedIds.add(sis.id);
    }
    for (const bro of broInLaw) {
      if (usedIds.has(bro.id)) continue;
      const paired =
        explicitSpouseIn(bro, sisInLaw) ??
        sisInLaw.find((s: any) => !usedIds.has(s.id) && s.parentPersonId === bro.id) ??
        sisInLaw.find((s: any) => !usedIds.has(s.id) && bro.parentPersonId === s.id) ??
        sisInLaw.find((s: any) => !usedIds.has(s.id));
      if (paired) { usedIds.add(paired.id); mirandaSlots.push({ members: [bro, paired] }); }
      else { mirandaSlots.push({ members: [bro] }); }
      usedIds.add(bro.id);
    }
    for (const sis of sisInLaw) {
      if (!usedIds.has(sis.id)) { mirandaSlots.push({ members: [sis] }); usedIds.add(sis.id); }
    }
  }

  const slotWidth  = (slot: SibSlot) => slot.members.length >= 2 ? COUPLE_W : PERSON_W;
  const totalSlotsW = (slots: SibSlot[]) =>
    slots.reduce((s, sl) => s + slotWidth(sl), 0) + Math.max(0, slots.length - 1) * H_GAP * 3;

  const SEP = H_GAP * 5;

  // ── Step 2: compute the horizontal centre of each "family cluster"
  //    (the person in the couple + all their siblings side-by-side).
  //    Parents will be centred over this whole cluster.
  //
  //    Spencer's cluster: his siblings extend LEFT from the couple.
  //      groupLeft  = start of leftmost sibling slot
  //      groupRight = right edge of Spencer's card inside the couple
  //
  //    Miranda's cluster: her siblings extend RIGHT from the couple.
  //      groupLeft  = left edge of Miranda's card inside the couple
  //      groupRight = right edge of rightmost sibling slot

  const spencerGroupCx = (() => {
    const defaultCx = finalParents.length >= 2 ? cx - PERSON_W / 2 - COUPLE_CONNECTOR_W / 2 : cx;
    if (spencerSlots.length === 0) return defaultCx;
    const totalW    = totalSlotsW(spencerSlots);
    const groupLeft  = cx - coupleNodeW / 2 - SEP - totalW; // left edge of furthest sibling
    const groupRight = cx - coupleNodeW / 2 + PERSON_W;     // right edge of Spencer's card
    return (groupLeft + groupRight) / 2;
  })();

  const mirandaGroupCx = (() => {
    const defaultCx = finalParents.length >= 2 ? cx + PERSON_W / 2 + COUPLE_CONNECTOR_W / 2 : cx;
    if (mirandaSlots.length === 0) return defaultCx;
    const totalW     = totalSlotsW(mirandaSlots);
    const groupLeft  = cx + coupleNodeW / 2 - PERSON_W;         // left edge of Miranda's card
    const groupRight = cx + coupleNodeW / 2 + SEP + totalW;     // right edge of furthest sibling
    return (groupLeft + groupRight) / 2;
  })();

  // ── Step 3: render parent rows centred over their respective clusters
  let spencerParentNodeId = coupleId;
  if (parentGenMembers.length > 0) {
    spencerParentNodeId = renderParentRow(parentGenMembers, spencerGroupCx, "pg");
  }

  let mirandaParentNodeId = coupleId;
  if (inlawParents.length > 0) {
    mirandaParentNodeId = renderParentRow(inlawParents, mirandaGroupCx, "ilp");
  }

  // Nephew/niece members indexed by their parentPersonId for quick lookup
  const nephewNieceByParent: Record<string, any[]> = {};
  for (const m of allMembers) {
    if (isNephewNieceRole(m.relationshipLabel) && m.parentPersonId) {
      if (!nephewNieceByParent[m.parentPersonId]) nephewNieceByParent[m.parentPersonId] = [];
      nephewNieceByParent[m.parentPersonId].push(m);
    }
  }

  // ── Step 4: render sibling slots (and any nephew/niece children below them)
  const renderSibSlots = (slots: SibSlot[], startX: number, sourceId: string) => {
    let slotX = startX;
    for (const slot of slots) {
      const slotW = slotWidth(slot);
      const slotCx = slotX + slotW / 2;
      let nodeId: string;
      if (slot.members.length >= 2) {
        nodeId = `sib-couple-${unit.unitId}-${slot.members[0].id}`;
        nodes.push({ id: nodeId, type: "couple", position: { x: slotCx - COUPLE_W / 2, y }, data: { parents: slot.members, unitName: "" } });
        edges.push({ id: `e-${sourceId}-${nodeId}`, source: sourceId, target: nodeId, type: "smoothstep", style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.4 } });
      } else {
        nodeId = `person-${unit.unitId}-sib-${slot.members[0].id}`;
        nodes.push({ id: nodeId, type: "child", position: { x: slotX, y }, data: { member: slot.members[0] } });
        edges.push({ id: `e-${sourceId}-${nodeId}`, source: sourceId, target: nodeId, type: "smoothstep", style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.4 } });
      }

      // Render nephew/niece children below this sibling slot
      const kids = [
        ...(nephewNieceByParent[slot.members[0]?.id] ?? []),
        ...(nephewNieceByParent[slot.members[1]?.id] ?? []),
      ];
      if (kids.length > 0) {
        const kidY = y + V_GAP;
        const kidRowW = kids.length * PERSON_W + (kids.length - 1) * H_GAP;
        const kidStartX = slotCx - kidRowW / 2;
        kids.forEach((kid: any, i: number) => {
          const kidId = `person-${unit.unitId}-nn-${kid.id}`;
          nodes.push({ id: kidId, type: "child", position: { x: kidStartX + i * (PERSON_W + H_GAP), y: kidY }, data: { member: kid } });
          edges.push({ id: `e-${nodeId}-${kidId}`, source: nodeId, target: kidId, type: "smoothstep", style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.4 } });
        });
      }

      slotX += slotW + H_GAP * 3;
    }
  };

  if (spencerSlots.length > 0) {
    const totalW = totalSlotsW(spencerSlots);
    const startX = cx - coupleNodeW / 2 - SEP - totalW;
    renderSibSlots(spencerSlots, startX, spencerParentNodeId);
  }

  if (mirandaSlots.length > 0) {
    const startX = cx + coupleNodeW / 2 + SEP;
    renderSibSlots(mirandaSlots, startX, mirandaParentNodeId);
  }

  const grandchildrenByParent: Record<string, any[]> = {};
  for (const gc of grandchildren) {
    if (gc.parentPersonId) {
      if (!grandchildrenByParent[gc.parentPersonId]) grandchildrenByParent[gc.parentPersonId] = [];
      grandchildrenByParent[gc.parentPersonId].push(gc);
    }
  }
  const unattachedGrandchildren = grandchildren.filter((gc: any) => !gc.parentPersonId);

  const childSlotWidths = finalChildren.map((child: any) => {
    const myGrandkids = grandchildrenByParent[child.id] || [];
    return myGrandkids.length === 0
      ? PERSON_W
      : Math.max(PERSON_W, myGrandkids.length * PERSON_W + (myGrandkids.length - 1) * H_GAP);
  });
  const childRowWidth =
    childSlotWidths.reduce((s: number, w: number) => s + w, 0) +
    Math.max(0, finalChildren.length - 1) * H_GAP;

  const unattachedGCWidth =
    unattachedGrandchildren.length > 0
      ? unattachedGrandchildren.length * PERSON_W + (unattachedGrandchildren.length - 1) * H_GAP
      : 0;

  if (finalChildren.length > 0) {
    const childY = y + V_GAP;
    let slotStartX = cx - childRowWidth / 2;

    finalChildren.forEach((child: any, i: number) => {
      const slotW = childSlotWidths[i];
      const childCx = slotStartX + slotW / 2;
      const childNodeId = `person-${unit.unitId}-${child.id}`;

      nodes.push({
        id: childNodeId,
        type: "child",
        position: { x: childCx - PERSON_W / 2, y: childY },
        data: { member: child },
      });
      edges.push({
        id: `e-${coupleId}-${childNodeId}`,
        source: coupleId,
        target: childNodeId,
        type: "smoothstep",
        style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.5 },
      });

      const myGrandkids = grandchildrenByParent[child.id] || [];
      if (myGrandkids.length > 0) {
        const gcY = childY + V_GAP;
        const gcRowW = myGrandkids.length * PERSON_W + (myGrandkids.length - 1) * H_GAP;
        const gcStartX = childCx - gcRowW / 2;

        myGrandkids.forEach((gc: any, gi: number) => {
          const gcId = `person-${unit.unitId}-${gc.id}`;
          nodes.push({
            id: gcId,
            type: "child",
            position: { x: gcStartX + gi * (PERSON_W + H_GAP), y: gcY },
            data: { member: gc },
          });
          edges.push({
            id: `e-${childNodeId}-${gcId}`,
            source: childNodeId,
            target: gcId,
            type: "smoothstep",
            style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.4 },
          });
        });
      }

      slotStartX += slotW + H_GAP;
    });
  }

  if (unattachedGrandchildren.length > 0) {
    const gcY = y + V_GAP * (finalChildren.length > 0 ? 2 : 1);
    const gcStartX = cx - unattachedGCWidth / 2;
    unattachedGrandchildren.forEach((gc: any, gi: number) => {
      const gcId = `person-${unit.unitId}-${gc.id}`;
      nodes.push({
        id: gcId,
        type: "child",
        position: { x: gcStartX + gi * (PERSON_W + H_GAP), y: gcY },
        data: { member: gc },
      });
      edges.push({
        id: `e-${coupleId}-${gcId}`,
        source: coupleId,
        target: gcId,
        type: "smoothstep",
        style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.35 },
      });
    });
  }

  if (unit.children && unit.children.length > 0) {
    const childY =
      y +
      V_GAP +
      (finalChildren.length > 0 ? V_GAP : 0) +
      (grandchildren.length > 0 ? V_GAP : 0);
    const unitSlotW = COUPLE_W + 80;
    const allLinkedW = unit.children.length * unitSlotW + (unit.children.length - 1) * 60;
    let unitStartX = cx - allLinkedW / 2;

    unit.children.forEach((childUnit: any) => {
      const childCx = unitStartX + unitSlotW / 2;
      const { nodes: cn, edges: ce } = layoutUnit(childUnit, childCx, childY, explicitPairs);
      nodes.push(...cn);
      edges.push(...ce);

      const childCoupleId = `couple-${childUnit.unitId}`;
      edges.push({
        id: `e-unit-${unit.unitId}-${childUnit.unitId}`,
        source: coupleId,
        target: childCoupleId,
        type: "smoothstep",
        animated: true,
        style: { stroke: "hsl(var(--primary))", strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--primary))" },
      });

      unitStartX += unitSlotW + 60;
    });
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Gender inference — used to produce correct relationship labels from the
// viewer's perspective (e.g. "brother-in-law" → male → show as "brother")
// ---------------------------------------------------------------------------
function inferGender(member: any): "male" | "female" | "unknown" {
  const label = (member.relationshipLabel ?? "").toLowerCase().trim();
  const female = [
    "wife","mother","mom","sister","niece","granddaughter","daughter",
    "grandmother","grandma","mother-in-law","sister-in-law",
    "aunt","half-sister","stepsister","great-grandmother","niece-in-law",
  ];
  const male = [
    "husband","father","dad","brother","nephew","grandson","son",
    "grandfather","grandpa","father-in-law","brother-in-law",
    "uncle","half-brother","stepbrother","great-grandfather","nephew-in-law",
  ];
  if (female.includes(label)) return "female";
  if (male.includes(label))   return "male";
  return "unknown";
}

// Relabel a member from the viewer's perspective
function relabeled(member: any, role: "self" | "spouse" | "parent" | "child" | "sibling" | "sibling-spouse" | "child-spouse"): any {
  const g = inferGender(member);
  const label = (() => {
    switch (role) {
      case "self":          return "self";
      case "spouse":        return g === "female" ? "wife"            : g === "male" ? "husband"         : "spouse";
      case "parent":        return g === "female" ? "mom"             : g === "male" ? "dad"              : "parent";
      case "child":         return g === "female" ? "daughter"        : g === "male" ? "son"              : "child";
      case "sibling":       return g === "female" ? "sister"          : g === "male" ? "brother"          : "sibling";
      case "sibling-spouse":return g === "female" ? "sister-in-law"   : g === "male" ? "brother-in-law"   : "in-law";
      case "child-spouse":  return g === "female" ? "daughter-in-law" : g === "male" ? "son-in-law"       : "in-law";
    }
  })();
  return { ...member, relationshipLabel: label };
}

// ---------------------------------------------------------------------------
// Family head — the primary couple member (not the explicit partner).
// Prefers the isAdmin flag; falls back to label-based detection so the tree
// still works correctly after Spencer's account is demoted from admin.
// Detection: parent-role label, not a sibling/in-law/partner/nephew,
// and has at least one unit member whose parentPersonId points to them.
// ---------------------------------------------------------------------------
function findFamilyHead(allMembers: any[]): any | undefined {
  return (
    allMembers.find((m: any) => m.isAdmin) ??
    allMembers.find((m: any) =>
      isParentRole(m.relationshipLabel ?? "") &&
      !isExplicitPartner(m.relationshipLabel ?? "") &&
      !isInlawParent(m.relationshipLabel ?? "") &&
      !isSiblingRole(m.relationshipLabel ?? "") &&
      !isNephewNieceRole(m.relationshipLabel ?? "") &&
      allMembers.some((child: any) => child.parentPersonId === m.id),
    )
  );
}

// ---------------------------------------------------------------------------
// Spouse map — who is paired with whom across the whole unit.
//
// explicitPairs: Map<personId, spouseId> built from the relationships table
// (type = "spouse"). When provided, explicit pairs take priority over the
// heuristic label-based passes below — any member already in an explicit pair
// is excluded from the fallback matching so the heuristic only handles people
// not yet in the relationship DB.
// ---------------------------------------------------------------------------
function buildSpouseMap(
  allMembers: any[],
  explicitPairs: Map<string, string> = new Map(),
): Map<string, string> {
  const map = new Map<string, string>(explicitPairs);
  const alreadyPaired = new Set<string>(explicitPairs.keys());

  const pair = (a: any, b: any) => {
    if (alreadyPaired.has(a.id) || alreadyPaired.has(b.id)) return;
    map.set(a.id, b.id);
    map.set(b.id, a.id);
  };

  // Head + partner (wife/husband/spouse/partner labels)
  const head = findFamilyHead(allMembers);
  const partner = allMembers.find((m: any) =>
    isExplicitPartner(m.relationshipLabel ?? "") && !alreadyPaired.has(m.id),
  );
  if (head && partner && !alreadyPaired.has(head.id)) pair(head, partner);

  const sibs = allMembers.filter((m: any) => isSiblingRole(m.relationshipLabel ?? ""));
  const brothers = sibs.filter((m: any) => ["brother", "sibling"].includes((m.relationshipLabel ?? "").toLowerCase()));
  const sisters  = sibs.filter((m: any) => (m.relationshipLabel ?? "").toLowerCase() === "sister");
  const sisInLaw = sibs.filter((m: any) => (m.relationshipLabel ?? "").toLowerCase() === "sister-in-law");
  const broInLaw = sibs.filter((m: any) => (m.relationshipLabel ?? "").toLowerCase() === "brother-in-law");
  // Uncle/aunt pairings: uncle = male sibling-generation relative, aunt = female.
  // An "aunt" whose parentPersonId points to an uncle is that uncle's wife (by marriage).
  // An "uncle" without a matching aunt-by-marriage is a blood relative (no spouse in tree).
  const uncles = sibs.filter((m: any) => (m.relationshipLabel ?? "").toLowerCase() === "uncle");
  const aunts  = sibs.filter((m: any) => (m.relationshipLabel ?? "").toLowerCase() === "aunt");
  const used = new Set<string>(alreadyPaired);

  // Pass 1: pair using explicit parentPersonId links (strongest heuristic signal).
  for (const bro of brothers) {
    if (used.has(bro.id)) continue;
    const p = sisInLaw.find((s: any) => !used.has(s.id) && s.parentPersonId === bro.id)
           ?? sisInLaw.find((s: any) => !used.has(s.id) && bro.parentPersonId === s.id);
    if (p) { pair(bro, p); used.add(p.id); used.add(bro.id); }
  }
  for (const sis of sisters) {
    if (used.has(sis.id)) continue;
    const p = broInLaw.find((b: any) => !used.has(b.id) && b.parentPersonId === sis.id)
           ?? broInLaw.find((b: any) => !used.has(b.id) && sis.parentPersonId === b.id);
    if (p) { pair(sis, p); used.add(p.id); used.add(sis.id); }
  }
  for (const bro of broInLaw) {
    if (used.has(bro.id)) continue;
    const p = sisInLaw.find((s: any) => !used.has(s.id) && s.parentPersonId === bro.id)
           ?? sisInLaw.find((s: any) => !used.has(s.id) && bro.parentPersonId === s.id);
    if (p) { pair(bro, p); used.add(p.id); used.add(bro.id); }
  }
  // Uncle + aunt pass 1: aunt whose parentPersonId === uncle.id is that uncle's wife.
  for (const uncle of uncles) {
    if (used.has(uncle.id)) continue;
    const p = aunts.find((a: any) => !used.has(a.id) && a.parentPersonId === uncle.id)
           ?? aunts.find((a: any) => !used.has(a.id) && uncle.parentPersonId === a.id);
    if (p) { pair(uncle, p); used.add(p.id); used.add(uncle.id); }
  }

  // Father-in-law + mother-in-law pairing (e.g. Randy + Sandra).
  // Explicit DB pairs already handled via explicitPairs; this is the heuristic fallback.
  const fathersInLaw = allMembers.filter((m: any) => (m.relationshipLabel ?? "").toLowerCase().trim() === "father-in-law");
  const mothersInLaw = allMembers.filter((m: any) => (m.relationshipLabel ?? "").toLowerCase().trim() === "mother-in-law");
  const ilUsed = new Set<string>(alreadyPaired);
  for (const fil of fathersInLaw) {
    if (ilUsed.has(fil.id)) continue;
    const mil =
      mothersInLaw.find((m: any) => !ilUsed.has(m.id) && (m.parentPersonId === fil.id || fil.parentPersonId === m.id)) ??
      mothersInLaw.find((m: any) => !ilUsed.has(m.id));
    if (mil) { pair(fil, mil); ilUsed.add(fil.id); ilUsed.add(mil.id); }
  }

  // Pass 2: sisters + brothers-in-law (run BEFORE brothers + sisters-in-law).
  const remSisters  = sisters.filter((s: any) => !used.has(s.id));
  const remBroInLaw = broInLaw.filter((b: any) => !used.has(b.id));
  const sCount = Math.min(remSisters.length, remBroInLaw.length);
  for (let i = 0; i < sCount; i++) {
    pair(remSisters[i], remBroInLaw[i]);
    used.add(remSisters[i].id);
    used.add(remBroInLaw[i].id);
  }

  // Pass 3: brothers + sisters-in-law (blind fallback, order-based).
  const remBros = brothers.filter((b: any) => !used.has(b.id));
  const remSisInLaw = sisInLaw.filter((s: any) => !used.has(s.id));
  const remainingUnpairedBIL = broInLaw.filter((b: any) => !used.has(b.id)).length;
  const availableSILForBrothers = Math.max(0, remSisInLaw.length - remainingUnpairedBIL);
  const bCount = Math.min(remBros.length, availableSILForBrothers);
  for (let i = 0; i < bCount; i++) {
    pair(remBros[i], remSisInLaw[i]);
    used.add(remBros[i].id);
    used.add(remSisInLaw[i].id);
  }
  // Uncle + aunt pass 3: blind order-based fallback for any remaining unpaired.
  // Assumes remaining aunts are wives of remaining uncles (by insertion order).
  const remUncles = uncles.filter((u: any) => !used.has(u.id));
  const remAunts  = aunts.filter((a: any) => !used.has(a.id));
  const uCount = Math.min(remUncles.length, remAunts.length);
  for (let i = 0; i < uCount; i++) {
    pair(remUncles[i], remAunts[i]);
    used.add(remUncles[i].id);
    used.add(remAunts[i].id);
  }

  return map;
}

// ---------------------------------------------------------------------------
// Personal view — renders the tree centred on a non-admin viewer.
//   • Viewer + spouse at centre
//   • Their parents above
//   • Their children below
//   • Their siblings to the right
// This keeps each member's view scoped to their immediate family only.
// ---------------------------------------------------------------------------
function layoutPersonalView(
  viewerPerson: any,
  allMembers: any[],
  cx: number,
  y: number,
  expandedPills: Set<string> = new Set(),
  explicitPairs: Map<string, string> = new Map(),
): { nodes: any[]; edges: any[] } {
  const nodes: any[] = [];
  const edges: any[] = [];

  const viewerId  = viewerPerson.id;
  const viewerLabel = (viewerPerson.relationshipLabel ?? "").toLowerCase().trim();
  const spouseMap   = buildSpouseMap(allMembers, explicitPairs);
  const viewerSpouseId = spouseMap.get(viewerId);
  const viewerSpouse   = viewerSpouseId ? allMembers.find((m: any) => m.id === viewerSpouseId) : null;
  const excludeIds     = new Set<string>([viewerId, ...(viewerSpouseId ? [viewerSpouseId] : [])]);

  // True when the viewer is the family head (e.g. Spencer/"Dad") — not the explicit
  // partner, not a sibling/in-law, and has children recorded in the unit.
  const viewerIsFamilyHead =
    isParentRole(viewerLabel) &&
    !isExplicitPartner(viewerLabel) &&
    !isInlawParent(viewerLabel) &&
    !isSiblingRole(viewerLabel) &&
    !isNephewNieceRole(viewerLabel) &&
    allMembers.some((child: any) => child.parentPersonId === viewerId);

  // ── Parents ──
  let viewerParents: any[] = [];
  if (viewerPerson.parentPersonId) {
    // Niece / nephew → parent is the person at parentPersonId + their spouse
    const directParent = allMembers.find((m: any) => m.id === viewerPerson.parentPersonId);
    if (directParent) {
      const psId = spouseMap.get(directParent.id);
      const ps   = psId ? allMembers.find((m: any) => m.id === psId) : null;
      viewerParents = [directParent, ...(ps ? [ps] : [])];
    }
  } else if (viewerIsFamilyHead) {
    // Family head (Spencer/"Dad") → parents are parent-role members who are not
    // siblings, not in-law parents, not the viewer, and not themselves a family head
    // (i.e. they have no children recorded in the unit — that's Steven/Deborah).
    viewerParents = allMembers.filter((m: any) =>
      isParentRole(m.relationshipLabel ?? "") &&
      !isExplicitPartner(m.relationshipLabel ?? "") &&
      !isInlawParent(m.relationshipLabel ?? "") &&
      !isSiblingRole(m.relationshipLabel ?? "") &&
      m.id !== viewerId &&
      !allMembers.some((child: any) => child.parentPersonId === m.id),
    );
  } else if (viewerLabel === "brother" || viewerLabel === "sister" || viewerLabel === "sibling") {
    // Spencer's siblings → parents are mom / dad (parent-labelled members who are
    // neither the explicit partner nor the family head)
    viewerParents = allMembers.filter((m: any) =>
      isParentRole(m.relationshipLabel ?? "") &&
      !isExplicitPartner(m.relationshipLabel ?? "") &&
      !m.isAdmin &&
      !allMembers.some((child: any) => child.parentPersonId === m.id),
    );
  } else if (viewerLabel === "brother-in-law" || viewerLabel === "sister-in-law") {
    // Miranda's siblings → parents are the in-law parents (Sandra, Randy)
    viewerParents = allMembers.filter((m: any) => isInlawParent(m.relationshipLabel ?? ""));
  } else if (isExplicitPartner(viewerLabel)) {
    // Miranda herself → same in-law parents
    viewerParents = allMembers.filter((m: any) => isInlawParent(m.relationshipLabel ?? ""));
  }

  // ── Children ──
  let viewerChildren: any[] = [];
  if (isExplicitPartner(viewerLabel)) {
    // Miranda shares the couple's children (non-parent, non-sibling, non-in-law direct members).
    // Exclude both Miranda and Spencer (via excludeIds) rather than relying on isAdmin.
    viewerChildren = allMembers.filter((m: any) =>
      !isParentRole(m.relationshipLabel ?? "") &&
      !isSiblingRole(m.relationshipLabel ?? "") &&
      !isInlawParent(m.relationshipLabel ?? "") &&
      !isNephewNieceRole(m.relationshipLabel ?? "") &&
      !isGrandchildRole(m.relationshipLabel ?? "") &&
      !excludeIds.has(m.id),
    );
  } else {
    // Everyone else: direct children via parentPersonId
    viewerChildren = allMembers.filter((m: any) => m.parentPersonId === viewerId);
  }

  // ── Siblings (peer generation) ──
  let viewerSiblings: any[] = [];
  if (viewerPerson.parentPersonId) {
    // Share parentPersonId → niece/nephew siblings
    viewerSiblings = allMembers.filter((m: any) =>
      m.parentPersonId === viewerPerson.parentPersonId && !excludeIds.has(m.id),
    );
  } else if (viewerIsFamilyHead) {
    // Family head (Spencer) → siblings are brother/sister labelled members
    viewerSiblings = allMembers.filter((m: any) =>
      ["brother", "sister", "sibling"].includes((m.relationshipLabel ?? "").toLowerCase()) &&
      !excludeIds.has(m.id),
    );
  } else if (viewerLabel === "brother" || viewerLabel === "sister" || viewerLabel === "sibling") {
    // Nathan/Madeline's siblings: other brothers/sisters + the family head (Spencer)
    const otherSibs = allMembers.filter((m: any) =>
      ["brother", "sister", "sibling"].includes((m.relationshipLabel ?? "").toLowerCase()) &&
      !excludeIds.has(m.id),
    );
    const familyHead = findFamilyHead(allMembers);
    if (familyHead && !excludeIds.has(familyHead.id)) viewerSiblings.push(familyHead);
    viewerSiblings.push(...otherSibs);
  } else if (viewerLabel === "brother-in-law" || viewerLabel === "sister-in-law") {
    // Miranda's siblings: Miranda + other Miranda-side in-laws
    const miranda = allMembers.find((m: any) => isExplicitPartner(m.relationshipLabel ?? ""));
    if (miranda) viewerSiblings.push(miranda);
    viewerSiblings.push(
      ...allMembers.filter((m: any) =>
        (m.relationshipLabel?.toLowerCase() === "brother-in-law" ||
          m.relationshipLabel?.toLowerCase() === "sister-in-law") &&
        !excludeIds.has(m.id),
      ),
    );
  } else if (isExplicitPartner(viewerLabel)) {
    // Miranda's view: all her siblings are the brothers/sisters-in-law
    viewerSiblings = allMembers.filter((m: any) =>
      (m.relationshipLabel?.toLowerCase() === "brother-in-law" ||
        m.relationshipLabel?.toLowerCase() === "sister-in-law") &&
      !excludeIds.has(m.id),
    );
  }

  // ── Pre-compute shownIds + pill membership (needed before row layout) ──────
  const shownIds = new Set<string>([
    viewerId,
    ...(viewerSpouseId ? [viewerSpouseId] : []),
    ...viewerParents.map((m: any) => m.id),
    ...viewerChildren.map((m: any) => m.id),
  ]);
  for (const sib of viewerSiblings) {
    shownIds.add(sib.id);
    const ssId = spouseMap.get(sib.id);
    if (ssId) shownIds.add(ssId);
  }
  for (const m of allMembers) {
    if (isNephewNieceRole(m.relationshipLabel ?? "")) shownIds.add(m.id);
  }

  // In-law pill (Miranda's side)
  const inLawPillMembersArr = allMembers.filter((m: any) => !shownIds.has(m.id));
  const inLawPillNodeIds    = inLawPillMembersArr.map((m: any) => m.id as string).sort();
  const inLawPillId         = "pill:" + inLawPillNodeIds.join("-");
  const inLawPillExpanded   = inLawPillMembersArr.length > 0 && expandedPills.has(inLawPillId);

  // Sibling pill (Spencer's side — shown when in-law pill is expanded)
  const sibPillNodeIds  = viewerSiblings.map((s: any) => s.id as string).sort();
  const sibPillId       = "sib-pill:" + sibPillNodeIds.join("-");
  // Collapse siblings to a pill whenever the in-law side is open (and there are siblings)
  const showSiblingsAsPill = inLawPillExpanded && viewerSiblings.length > 0;

  // ── Render viewer + spouse couple (labels from viewer's perspective) ──
  // For the family head the spouse goes on the LEFT and the viewer on the RIGHT
  // so each person is adjacent to their own family branch:
  //   LEFT  = spouse → pill (their extended family) is also to the left
  //   RIGHT = viewer → parents + siblings also extend to the right
  // For all other viewers keep the conventional viewer-left ordering.
  const coupleId    = `pv-couple-${viewerId}`;
  const coupleMems  = (viewerIsFamilyHead && viewerSpouse)
    ? [relabeled(viewerSpouse, "spouse"), relabeled(viewerPerson, "self")]
    : [relabeled(viewerPerson, "self"), ...(viewerSpouse ? [relabeled(viewerSpouse, "spouse")] : [])];
  const coupleNodeW = coupleMems.length >= 2 ? COUPLE_W : PERSON_W;

  nodes.push({
    id: coupleId, type: "couple",
    position: { x: cx - coupleNodeW / 2, y },
    data: { parents: coupleMems, unitName: "" },
  });

  // ── Pre-calculate sibling slots — needed to centre parents above the full row ──
  type SibSlot2 = { members: any[] };
  const sibSlots: SibSlot2[] = [];
  {
    const usedSibIds = new Set<string>();
    for (const sib of viewerSiblings) {
      if (usedSibIds.has(sib.id)) continue;
      const sibSpouseId = spouseMap.get(sib.id);
      const sibSpouse   = sibSpouseId && !usedSibIds.has(sibSpouseId)
        ? allMembers.find((m: any) => m.id === sibSpouseId) : null;
      if (sibSpouse) {
        sibSlots.push({ members: [relabeled(sib, "sibling"), relabeled(sibSpouse, "sibling-spouse")] });
        usedSibIds.add(sib.id); usedSibIds.add(sibSpouse.id);
      } else {
        sibSlots.push({ members: [relabeled(sib, "sibling")] });
        usedSibIds.add(sib.id);
      }
    }
  }

  // ── Compute children row extent so the parent node can be centred over all kids ──
  const SIB_SEP = H_GAP * 5;   // gap between viewer's couple and first sibling
  const SIB_GAP = H_GAP * 3;   // gap between sibling slots
  const sibSlotW = (sl: SibSlot2) => sl.members.length >= 2 ? COUPLE_W : PERSON_W;

  const rowLeft  = cx - coupleNodeW / 2;
  let   rowRight = cx + coupleNodeW / 2;
  if (showSiblingsAsPill) {
    // Siblings collapsed to a pill — only pill width extends the row
    rowRight = cx + coupleNodeW / 2 + SIB_SEP + PILL_W;
  } else if (sibSlots.length > 0) {
    let slotX = cx + coupleNodeW / 2 + SIB_SEP;
    for (const sl of sibSlots) { slotX += sibSlotW(sl) + SIB_GAP; }
    rowRight = slotX - SIB_GAP; // strip trailing gap
  }
  const rowCenter = (rowLeft + rowRight) / 2;

  // ── Parents above — centred over the entire children row ──
  let parentNodeId: string | null = null;
  if (viewerParents.length > 0) {
    const parentId    = `pv-parents-${viewerId}`;
    parentNodeId = parentId;
    const parentMems  = viewerParents.map((p: any) => relabeled(p, "parent"));
    const parentNodeW = parentMems.length >= 2 ? COUPLE_W : PERSON_W;
    nodes.push({
      id: parentId, type: "couple",
      position: { x: rowCenter - parentNodeW / 2, y: y - V_GAP },
      data: { parents: parentMems, unitName: "" },
    });
    edges.push({
      id: `e-${parentId}-${coupleId}`, source: parentId, target: coupleId,
      type: "smoothstep",
      style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.5 },
    });
  }

  // ── Children below — labelled "son" / "daughter" ──
  if (viewerChildren.length > 0) {
    const childY      = y + V_GAP;
    const childRowW   = viewerChildren.length * PERSON_W + (viewerChildren.length - 1) * H_GAP;
    const childStartX = cx - childRowW / 2;
    viewerChildren.forEach((child: any, i: number) => {
      const childId = `pv-child-${child.id}`;
      nodes.push({ id: childId, type: "child", position: { x: childStartX + i * (PERSON_W + H_GAP), y: childY }, data: { member: relabeled(child, "child") } });
      edges.push({ id: `e-${coupleId}-${childId}`, source: coupleId, target: childId, type: "smoothstep", style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.5 } });
    });
  }

  // ── Siblings to the right — edges connect from the shared parent node so the
  //    parent visually fans out over all its children (not from the couple). ──
  if (showSiblingsAsPill) {
    // In-law side is expanded → collapse siblings into a pill so there's no overlap
    const sibPillLabel = `${viewerSiblings.length} sibling${viewerSiblings.length !== 1 ? "s" : ""}`;
    const sibPillX = cx + coupleNodeW / 2 + SIB_SEP;
    nodes.push({
      id: sibPillId, type: "pill",
      position: { x: sibPillX, y },
      data: { members: viewerSiblings, label: sibPillLabel, pillId: sibPillId },
    });
    const sibSrc = parentNodeId ?? coupleId;
    edges.push({
      id: `e-${sibSrc}-${sibPillId}`, source: sibSrc, target: sibPillId,
      type: "smoothstep",
      style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.4 },
    });
  } else if (sibSlots.length > 0) {
    let slotX = cx + coupleNodeW / 2 + SIB_SEP;
    for (const slot of sibSlots) {
      const slotW  = sibSlotW(slot);
      const slotCx = slotX + slotW / 2;
      let slotNodeId: string;
      if (slot.members.length >= 2) {
        slotNodeId = `pv-sib-couple-${slot.members[0].id}`;
        nodes.push({ id: slotNodeId, type: "couple", position: { x: slotCx - COUPLE_W / 2, y }, data: { parents: slot.members, unitName: "" } });
      } else {
        slotNodeId = `pv-sib-${slot.members[0].id}`;
        nodes.push({ id: slotNodeId, type: "child", position: { x: slotX, y }, data: { member: slot.members[0] } });
      }
      // Connect from the parent node when one exists (shared parentage), else from the couple
      const sibSrc = parentNodeId ?? coupleId;
      edges.push({ id: `e-${sibSrc}-${slotNodeId}`, source: sibSrc, target: slotNodeId, type: "smoothstep", style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.4 } });
      slotX += slotW + SIB_GAP;
    }
  }

  // ── In-law pill group ──────────────────────────────────────────────────────
  // Use the pre-computed in-law pill membership from above.
  if (inLawPillMembersArr.length > 0) {
    const pillMembers = inLawPillMembersArr;
    const pillId      = inLawPillId;
    const pillLabel   = generatePillLabel(pillMembers, viewerSpouse?.firstName);

    // Position: same vertical level as the parent node (y - V_GAP), to the LEFT.
    // Anchor off the parent node (now centred over the children row) so the pill
    // clears it cleanly.  Fall back to the couple width when there are no parents.
    const PILL_SEP = H_GAP * 3;
    const pillY = y - V_GAP;
    // Anchor the pill to the LEFT of the leftmost element in the children row
    // (the couple's left edge = rowLeft).  This keeps it firmly on the spouse's
    // side regardless of how far right the sibling row extends.
    const pillX = rowLeft - PILL_SEP - PILL_W;
    const edgeId = `e-pill-${inLawPillNodeIds[0]?.slice(0, 8) ?? "x"}-couple`;

    if (expandedPills.has(pillId)) {
      // ── Expanded ──────────────────────────────────────────────────────────
      // Strategy:
      //   • In-law parents (mother-in-law / father-in-law) → top couple at y−V_GAP
      //   • Remaining in-law members → a row of properly-paired couple/child
      //     nodes at y, right-aligned to (rowLeft − PILL_EXP_SEP) so they
      //     never overlap the viewer couple.
      const expId = `pv-pill-exp-${inLawPillNodeIds[0]?.slice(0, 8) ?? "x"}`;
      const PILL_EXP_SEP = H_GAP * 5;

      // Split into parents vs. everyone else
      const ilParents  = pillMembers.filter((m: any) => isInlawParent(m.relationshipLabel ?? ""));
      const ilSiblings = pillMembers.filter((m: any) => !isInlawParent(m.relationshipLabel ?? ""));

      // Pair the siblings using the shared spouseMap
      const usedIlIds = new Set<string>();
      const sibPairs: { members: any[] }[] = [];
      for (const m of ilSiblings) {
        if (usedIlIds.has(m.id)) continue;
        const spId = spouseMap.get(m.id);
        const sp = spId && !usedIlIds.has(spId)
          ? ilSiblings.find((s: any) => s.id === spId) : null;
        if (sp) {
          sibPairs.push({ members: [m, sp] });
          usedIlIds.add(m.id); usedIlIds.add(sp.id);
        } else {
          sibPairs.push({ members: [m] });
          usedIlIds.add(m.id);
        }
      }

      const pairNodeW = (pair: { members: any[] }) =>
        pair.members.length >= 2 ? COUPLE_W : PERSON_W;

      const totalSibRowW = sibPairs.reduce((s, p) => s + pairNodeW(p), 0)
        + Math.max(0, sibPairs.length - 1) * (H_GAP * 3);
      const topW = ilParents.length >= 2 ? COUPLE_W
                 : ilParents.length === 1 ? PERSON_W : 0;
      // Footprint = widest of: sib row, top couple, or a single person
      const footprintW = Math.max(totalSibRowW, topW, PERSON_W);

      // Anchor the footprint so its right edge is PILL_EXP_SEP left of the viewer couple
      const anchorRight    = rowLeft - PILL_EXP_SEP;
      const footprintLeft  = anchorRight - footprintW;
      const footprintCenterX = footprintLeft + footprintW / 2;

      // ── Top node: in-law parents at y − V_GAP ──
      const hasTopNode = ilParents.length > 0;
      if (ilParents.length >= 2) {
        nodes.push({
          id: expId, type: "couple",
          position: { x: footprintCenterX - COUPLE_W / 2, y: y - V_GAP },
          data: { parents: ilParents.slice(0, 2), unitName: "", pillId },
        });
      } else if (ilParents.length === 1) {
        nodes.push({
          id: expId, type: "child",
          position: { x: footprintCenterX - PERSON_W / 2, y: y - V_GAP },
          data: { member: ilParents[0], pillId },
        });
      }

      // Determine which node drives the edge to the viewer couple
      const firstSibNodeId = sibPairs.length > 0
        ? `pv-pill-extra-${sibPairs[0].members[0].id}` : null;
      const edgeSrc = hasTopNode ? expId : (firstSibNodeId ?? expId);

      edges.push({
        id: edgeId, source: edgeSrc, target: coupleId,
        type: "smoothstep",
        style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.5 },
      });

      // ── Sibling pairs: row at y, right-aligned to anchorRight ──
      if (sibPairs.length > 0) {
        const sibStartX = anchorRight - totalSibRowW;
        let pairX = sibStartX;
        for (let si = 0; si < sibPairs.length; si++) {
          const pair = sibPairs[si];
          const pw = pairNodeW(pair);
          const pairCx = pairX + pw / 2;
          const nodeId = `pv-pill-extra-${pair.members[0].id}`;
          const isFirstSib = si === 0;
          // Give the collapse affordance to the first sib when there are no top parents
          const extraData = !hasTopNode && isFirstSib ? { pillId } : {};

          if (pair.members.length >= 2) {
            nodes.push({
              id: nodeId, type: "couple",
              position: { x: pairCx - COUPLE_W / 2, y },
              data: { parents: pair.members, unitName: "", ...extraData },
            });
          } else {
            nodes.push({
              id: nodeId, type: "child",
              position: { x: pairX, y },
              data: { member: pair.members[0], ...extraData },
            });
          }

          // Parents → children edges
          if (hasTopNode) {
            edges.push({
              id: `e-${expId}-${nodeId}`, source: expId, target: nodeId,
              type: "smoothstep",
              style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.4 },
            });
          }

          // ── Child pill below this couple ──────────────────────────────────
          const coupleKids = allMembers.filter((m: any) =>
            isNephewNieceRole(m.relationshipLabel ?? "") &&
            pair.members.some((parent: any) => m.parentPersonId === parent.id)
          );
          if (coupleKids.length > 0) {
            const childPillId = `child-pill:${pair.members[0].id}`;
            const childY = y + V_GAP;
            if (expandedPills.has(childPillId)) {
              // Expanded — show kids in a row below the couple
              const kidRowW = coupleKids.length * PERSON_W + (coupleKids.length - 1) * H_GAP;
              const kidStartX = pairCx - kidRowW / 2;
              coupleKids.forEach((kid: any, ki: number) => {
                const kidId = `pv-nn-${kid.id}`;
                nodes.push({
                  id: kidId, type: "child",
                  position: { x: kidStartX + ki * (PERSON_W + H_GAP), y: childY },
                  data: { member: kid },
                });
                edges.push({
                  id: `e-${nodeId}-${kidId}`, source: nodeId, target: kidId,
                  type: "smoothstep",
                  style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.4 },
                });
              });
            } else {
              // Collapsed — show as a pill
              const kidLabel = `${coupleKids.length} kid${coupleKids.length !== 1 ? "s" : ""}`;
              nodes.push({
                id: childPillId, type: "pill",
                position: { x: pairCx - PILL_W / 2, y: childY },
                data: { members: coupleKids, label: kidLabel, pillId: childPillId },
              });
              edges.push({
                id: `e-${nodeId}-${childPillId}`, source: nodeId, target: childPillId,
                type: "smoothstep",
                style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.4 },
              });
            }
          }

          pairX += pw + H_GAP * 3;
        }
      }
    } else {
      // ── Collapsed: render as pill node ──
      nodes.push({
        id: pillId, type: "pill",
        position: { x: pillX, y: pillY },
        data: { members: pillMembers, label: pillLabel, pillId },
      });
      edges.push({
        id: edgeId, source: pillId, target: coupleId,
        type: "smoothstep",
        style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.4 },
      });
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Absolute family graph.
//
// Builds a viewer-INDEPENDENT parent→child graph from every available signal:
//   1. explicit biological_parent / adoptive_parent / step_parent edges
//   2. persons.parentPersonId
//   3. admin-relative relationship labels, converted to absolute facts using
//      the admin's identity (e.g. a member labeled "mom" is the ADMIN's mother,
//      so admin → that member is a child→parent edge — true no matter who views)
//
// The layered view then derives EACH viewer's parents / siblings / grandparents
// / children by traversing this graph from the viewer. This is what makes the
// tree correct for every member: labels stored relative to the admin are only
// used to build absolute edges once, never to position a non-admin viewer.
// ---------------------------------------------------------------------------
function buildAbsoluteGraph(
  allMembers: any[],
  spouseMap: Map<string, string>,
  explicitParentsByChild: Map<string, Set<string>>,
): { parentsOf: Map<string, Set<string>>; childrenOf: Map<string, Set<string>> } {
  const parentsOf = new Map<string, Set<string>>();
  const childrenOf = new Map<string, Set<string>>();
  const ids = new Set<string>(allMembers.map((m: any) => m.id));
  const nl = (l: string | null | undefined) => (l ?? "").toLowerCase().trim();

  const link = (childId: string, parentId: string) => {
    if (!childId || !parentId || childId === parentId) return;
    if (!ids.has(childId) || !ids.has(parentId)) return;
    if (!parentsOf.has(childId)) parentsOf.set(childId, new Set());
    parentsOf.get(childId)!.add(parentId);
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, new Set());
    childrenOf.get(parentId)!.add(childId);
  };

  // 1. Explicit parent edges.
  for (const [childId, parentIds] of explicitParentsByChild) {
    for (const pid of parentIds) link(childId, pid);
  }

  // 2. persons.parentPersonId.
  for (const m of allMembers) {
    if (m.parentPersonId) link(m.id, m.parentPersonId);
  }

  // 3. Admin-relative labels → absolute facts.
  const admin = allMembers.find((m: any) => m.isAdmin);
  if (!admin) return { parentsOf, childrenOf };
  const adminSpouseId = spouseMap.get(admin.id);

  const isParentOfAdminLabel = (l: string) =>
    isParentRole(l) && !isGrandparentRole(l) && !isInlawParent(l) && !isExplicitPartner(l);

  const adminParentIds: string[] = [];
  const inlawParentIds: string[] = [];
  for (const m of allMembers) {
    if (m.id === admin.id) continue;
    const l = nl(m.relationshipLabel);
    if (isParentOfAdminLabel(l)) {
      link(admin.id, m.id);          // m is the admin's parent
      adminParentIds.push(m.id);
    } else if (isInlawParent(l) && adminSpouseId) {
      link(adminSpouseId, m.id);     // m is the admin-spouse's parent
      inlawParentIds.push(m.id);
    }
  }

  // 4. Admin's siblings share the admin's parents.
  const adminSiblingIds = new Set<string>();
  for (const m of allMembers) {
    const l = nl(m.relationshipLabel);
    if (l === "brother" || l === "sister" || l === "sibling") {
      adminSiblingIds.add(m.id);
      for (const pid of adminParentIds) link(m.id, pid);
    }
  }

  // 5. In-law siblings share the admin-spouse's parents — UNLESS their explicit
  //    spouse is admin-side (admin or admin's sibling). In that case they
  //    married INTO the family (e.g. Anna ↔ Tanner, Sam ↔ Madeline) and are
  //    connected only through their spouse, not as the admin-spouse's sibling.
  const adminSideCore = new Set<string>([admin.id, ...adminSiblingIds]);
  for (const m of allMembers) {
    const l = nl(m.relationshipLabel);
    if ((l === "brother-in-law" || l === "sister-in-law") && adminSpouseId) {
      const theirSpouse = spouseMap.get(m.id);
      if (theirSpouse && adminSideCore.has(theirSpouse)) continue;
      for (const pid of inlawParentIds) link(m.id, pid);
    }
  }

  // 6. Grandparent labels = "parent of the admin's parent". Use parentPersonId
  //    when present; otherwise attach to the admin's first parent (a bare
  //    "grandfather" label doesn't say maternal vs paternal).
  for (const m of allMembers) {
    const l = nl(m.relationshipLabel);
    if (isGrandparentRole(l)) {
      if (m.parentPersonId && ids.has(m.parentPersonId)) {
        link(m.parentPersonId, m.id);
      } else if (adminParentIds.length > 0) {
        link(adminParentIds[0], m.id);
      } else {
        link(admin.id, m.id);
      }
    }
  }

  // 7. Aunt / uncle labels = the admin's parent's sibling. Link them as a child
  //    of the admin's grandparent so they become a sibling of the admin's
  //    parent. parentPersonId wins when present; otherwise attach to the first
  //    known grandparent.
  const adminGrandparentIds = new Set<string>();
  for (const pid of adminParentIds) {
    for (const g of (parentsOf.get(pid) ?? new Set<string>())) adminGrandparentIds.add(g);
  }
  const firstGrandparent = [...adminGrandparentIds][0];
  for (const m of allMembers) {
    const l = nl(m.relationshipLabel);
    if (l === "aunt" || l === "uncle") {
      if (m.parentPersonId && ids.has(m.parentPersonId)) {
        link(m.id, m.parentPersonId);
      } else if (firstGrandparent) {
        link(m.id, firstGrandparent);
      }
    }
  }

  return { parentsOf, childrenOf };
}

// ---------------------------------------------------------------------------
// Layered drill-down view — group pill design.
// Layer 0 (core): viewer + spouse + their children — always rendered as nodes.
// Layer 1: ONE "grp:viewer" pill for viewer's whole side (parents + siblings),
//           ONE "grp:spouse" pill for spouse's whole side.
// Layer 2: when a group expands, parents couple node + sibling row appear.
//           Each sibling with children gets a "kids:{sibId}" pill below them.
// Layer 3: when a kids pill expands, individual child nodes appear in a row.
// ---------------------------------------------------------------------------
function layoutLayeredView(
  viewerPerson: any,
  allMembers: any[],
  cx: number,
  y: number,
  expandedPills: Set<string>,
  explicitPairs: Map<string, string> = new Map(),
  childrenByParent: Map<string, Set<string>> = new Map(),
  parentsByChild: Map<string, Set<string>> = new Map(),
): { nodes: any[]; edges: any[] } {
  const nodes: any[] = [];
  const edges: any[] = [];

  const viewerId = viewerPerson.id;
  const viewerLabel = (viewerPerson.relationshipLabel ?? "").toLowerCase().trim();
  const spouseMap = buildSpouseMap(allMembers, explicitPairs);
  const viewerSpouseId = spouseMap.get(viewerId);
  const viewerSpouse = viewerSpouseId
    ? allMembers.find((m: any) => m.id === viewerSpouseId)
    : null;
  const excludeIds = new Set<string>([
    viewerId,
    ...(viewerSpouseId ? [viewerSpouseId] : []),
  ]);

  // Helper: turn an id-set into a member array (filtering out unknowns).
  const idsToMembers = (ids: Iterable<string>) =>
    [...ids]
      .map((id) => allMembers.find((m: any) => m.id === id))
      .filter(Boolean) as any[];

  // ── Family identification (absolute-graph based) ────────────────────────────
  // Build a viewer-INDEPENDENT family graph once, then derive THIS viewer's
  // relatives by traversing it. This replaces the old per-label branches that
  // were correct only when the admin was the viewer.
  const { parentsOf, childrenOf } = buildAbsoluteGraph(allMembers, spouseMap, parentsByChild);

  // Add each parent's spouse (the co-parent by marriage) so a viewer with only
  // one parent edge encoded still gets their other parent (e.g. Tagen → Ryan
  // explicit, Ryan ↔ Jackie spouse ⇒ Jackie shown too).
  const withSpouses = (idSet: Set<string>): Set<string> => {
    const out = new Set<string>(idSet);
    for (const id of idSet) {
      const sp = spouseMap.get(id);
      if (sp) out.add(sp);
    }
    return out;
  };

  const viewerParentIds = parentsOf.get(viewerId) ?? new Set<string>();
  const viewerParents = idsToMembers(withSpouses(viewerParentIds));

  // Siblings = others who share at least one parent with the viewer.
  const viewerSiblingIds = new Set<string>();
  for (const pid of viewerParentIds) {
    for (const c of (childrenOf.get(pid) ?? new Set<string>())) {
      if (c !== viewerId) viewerSiblingIds.add(c);
    }
  }
  const viewerSiblings = idsToMembers(viewerSiblingIds).filter((m: any) => !excludeIds.has(m.id));

  // Grandparents = parents of the viewer's parents.
  const viewerGrandparentIds = new Set<string>();
  for (const pid of viewerParentIds) {
    for (const g of (parentsOf.get(pid) ?? new Set<string>())) viewerGrandparentIds.add(g);
  }
  const viewerGrandparents = idsToMembers(viewerGrandparentIds).filter((m: any) => !excludeIds.has(m.id));

  // Aunts / uncles = the viewer's parents' siblings (others who share a parent
  // with one of the viewer's parents). These live in the "ancestors" pill above
  // the parents alongside the grandparents, collapsed by default.
  const auntsUnclesOf = (parentIds: Set<string>): any[] => {
    const out = new Set<string>();
    for (const pid of parentIds) {
      for (const gpid of (parentsOf.get(pid) ?? new Set<string>())) {
        for (const c of (childrenOf.get(gpid) ?? new Set<string>())) {
          if (!parentIds.has(c)) out.add(c);
        }
      }
    }
    return idsToMembers(out).filter((m: any) => !excludeIds.has(m.id));
  };
  const viewerAuntsUncles = auntsUnclesOf(viewerParentIds);

  // Children = the viewer's own children.
  const viewerChildren = idsToMembers(childrenOf.get(viewerId) ?? new Set<string>());

  // Spouse's parents + siblings (same derivation, anchored on the spouse).
  const spouseParentIds = viewerSpouseId
    ? (parentsOf.get(viewerSpouseId) ?? new Set<string>())
    : new Set<string>();
  const spouseParents = viewerSpouseId ? idsToMembers(withSpouses(spouseParentIds)) : [];
  const spouseSiblingIds = new Set<string>();
  if (viewerSpouseId) {
    for (const pid of spouseParentIds) {
      for (const c of (childrenOf.get(pid) ?? new Set<string>())) {
        if (c !== viewerSpouseId) spouseSiblingIds.add(c);
      }
    }
  }
  const spouseSiblings = idsToMembers(spouseSiblingIds).filter((m: any) => !excludeIds.has(m.id));
  const spouseGrandparentIds = new Set<string>();
  for (const pid of spouseParentIds) {
    for (const g of (parentsOf.get(pid) ?? new Set<string>())) spouseGrandparentIds.add(g);
  }
  const spouseGrandparents = idsToMembers(spouseGrandparentIds).filter((m: any) => !excludeIds.has(m.id));
  const spouseAuntsUncles = viewerSpouseId ? auntsUnclesOf(spouseParentIds) : [];

  // "Family head" for rendering purposes (couple ordering + which side the
  // viewer's family extends): a viewer who has children of their own. The
  // couple is drawn [spouse, viewer] with the viewer's family on the right.
  const viewerIsFamilyHead = (childrenOf.get(viewerId)?.size ?? 0) > 0;

  // ── Layout constants ───────────────────────────────────────────────────────

  const GROUP_SEP = H_GAP * 4;  // gap between core couple edge and group anchor
  const SIB_GAP = H_GAP * 2;   // gap between sibling slots in expanded row
  // Actual rendered height of a CoupleNode with expanded kids:
  // avatar (64) + mt-1.5 (6) + name (16) + label (14) + "‹ collapse" line (22) ≈ 122px
  const NODE_H = 128;
  const KIDS_SEP = 32;          // vertical gap from sib node bottom to kids pill/nodes

  // ── Helper: edge ───────────────────────────────────────────────────────────
  const addEdge = (src: string, tgt: string, opacity = 0.4) =>
    edges.push({
      id: `e-${src}-${tgt}`,
      source: src,
      target: tgt,
      type: "smoothstep",
      style: {
        stroke: "hsl(var(--primary))",
        strokeWidth: 1.5,
        strokeOpacity: opacity,
      },
    });

  // ── Sibling slot builder ───────────────────────────────────────────────────

  interface SibSlot {
    primary: any;
    spouse: any | null;
    children: any[];
    kidsId: string;
  }

  const sibSlotW = (s: SibSlot) => (s.spouse ? COUPLE_W : PERSON_W);

  const buildSibSlots = (siblings: any[]): SibSlot[] => {
    const used = new Set<string>();
    const slots: SibSlot[] = [];
    for (const sib of siblings) {
      if (used.has(sib.id)) continue;
      const spouseId = spouseMap.get(sib.id);
      const spouse =
        spouseId && !used.has(spouseId)
          ? allMembers.find((m: any) => m.id === spouseId)
          : null;
      const sibChildren = allMembers.filter(
        (m: any) =>
          m.parentPersonId === sib.id ||
          (spouse && m.parentPersonId === spouse.id),
      );
      slots.push({
        primary: sib,
        spouse,
        children: sibChildren,
        kidsId: `kids:${sib.id}`,
      });
      used.add(sib.id);
      if (spouse) used.add(spouse.id);
    }
    return slots;
  };

  const viewerSibSlots = buildSibSlots(viewerSiblings);
  const spouseSibSlots = buildSibSlots(spouseSiblings);
  const viewerAuntUncleSlots = buildSibSlots(viewerAuntsUncles);
  const spouseAuntUncleSlots = buildSibSlots(spouseAuntsUncles);

  // ── Core couple (Layer 0) ──────────────────────────────────────────────────

  const coupleId = `lv-couple-${viewerId}`;
  const coupleMems =
    viewerIsFamilyHead && viewerSpouse
      ? [relabeled(viewerSpouse, "spouse"), relabeled(viewerPerson, "self")]
      : [
          relabeled(viewerPerson, "self"),
          ...(viewerSpouse ? [relabeled(viewerSpouse, "spouse")] : []),
        ];
  const coupleW = coupleMems.length >= 2 ? COUPLE_W : PERSON_W;

  nodes.push({
    id: coupleId,
    type: "couple",
    position: { x: cx - coupleW / 2, y },
    data: { parents: coupleMems, unitName: "" },
  });

  // Children row (Layer 0 — always visible)
  // Each child is paired with their spouse (if any) and rendered as a couple node.
  // Grandkids appear as a collapsible pill below each child couple.
  if (viewerChildren.length > 0) {
    const childY = y + V_GAP;

    // Build child slots — pair each child with their spouse
    const usedChildIds = new Set<string>(excludeIds);
    const childSlots: Array<{
      child: any;
      spouse: any | null;
      grandkids: any[];
      kidsId: string;
    }> = [];

    for (const child of viewerChildren) {
      if (usedChildIds.has(child.id)) continue;
      const childSpouseId = spouseMap.get(child.id);
      const childSpouse =
        childSpouseId && !usedChildIds.has(childSpouseId)
          ? allMembers.find((m: any) => m.id === childSpouseId)
          : null;
      const grandkids = idsToMembers(childrenOf.get(child.id) ?? new Set<string>());

      childSlots.push({ child, spouse: childSpouse, grandkids, kidsId: `gc-pill:${child.id}` });
      usedChildIds.add(child.id);
      if (childSpouse) usedChildIds.add(childSpouse.id);
    }

    const childSlotW = (slot: { spouse: any | null }) => (slot.spouse ? COUPLE_W : PERSON_W);
    const totalChildRowW =
      childSlots.reduce((s, sl) => s + childSlotW(sl), 0) +
      Math.max(0, childSlots.length - 1) * H_GAP;

    let slotX = cx - totalChildRowW / 2;

    for (const slot of childSlots) {
      const sw = childSlotW(slot);
      const slotCx = slotX + sw / 2;
      const childNodeId = `lv-child-${slot.child.id}`;

      const childMems = [
        relabeled(slot.child, "child"),
        ...(slot.spouse ? [relabeled(slot.spouse, "child-spouse")] : []),
      ];

      nodes.push({
        id: childNodeId,
        type: "couple",
        position: { x: slotX, y: childY },
        data: { parents: childMems, unitName: "" },
      });
      addEdge(coupleId, childNodeId, 0.5);

      // Grandkids below this child slot — collapsed to a pill by default
      if (slot.grandkids.length > 0) {
        const gcY = childY + V_GAP;
        const gcPillId = slot.kidsId;
        const gcExpanded = expandedPills.has(gcPillId);

        if (gcExpanded) {
          const gcRowW = slot.grandkids.length * PERSON_W + (slot.grandkids.length - 1) * H_GAP;
          const gcStartX = slotCx - gcRowW / 2;
          slot.grandkids.forEach((gc: any, gi: number) => {
            const gcId = `lv-gc-${gc.id}`;
            nodes.push({
              id: gcId,
              type: "child",
              position: { x: gcStartX + gi * (PERSON_W + H_GAP), y: gcY },
              data: { member: relabeled(gc, "child") },
            });
            addEdge(childNodeId, gcId, 0.4);
          });
        } else {
          const gcNames = slot.grandkids.map((k: any) => k.firstName as string);
          const gcLabel =
            gcNames.slice(0, 3).join(", ") +
            (gcNames.length > 3 ? ` +${gcNames.length - 3}` : "");
          nodes.push({
            id: gcPillId,
            type: "pill",
            position: { x: slotCx - PILL_W / 2, y: gcY },
            data: { members: slot.grandkids, label: gcLabel, pillId: gcPillId },
          });
          addEdge(childNodeId, gcPillId, 0.4);
        }
      }

      slotX += sw + H_GAP;
    }
  }

  // ── Group pill renderer ────────────────────────────────────────────────────
  // Renders either a single collapsed group pill, or the expanded group
  // (parents couple node above + sibling row, with kids pills/nodes below each sib).

  const renderGroup = (
    grandparentsArr: any[],
    parentsArr: any[],
    sibSlots: SibSlot[],
    groupPillId: string,
    side: "left" | "right",
    auntUncleSlots: SibSlot[] = [],
  ) => {
    if (grandparentsArr.length === 0 && parentsArr.length === 0 && sibSlots.length === 0) return;

    const isExpanded = expandedPills.has(groupPillId);

    // Total width of the sibling row
    const totalSibW =
      sibSlots.reduce((s, sl) => s + sibSlotW(sl), 0) +
      Math.max(0, sibSlots.length - 1) * SIB_GAP;

    // Anchor: point adjacent to core couple where the group connects
    const anchorX = side === "left"
      ? cx - coupleW / 2 - GROUP_SEP
      : cx + coupleW / 2 + GROUP_SEP;

    if (!isExpanded) {
      // ── Collapsed: single group pill ──────────────────────────────────────
      // NOTE: only the viewer's PARENTS + SIBLINGS go in this top-level pill.
      // The grandparent generation (parents' parents + parents' siblings) is a
      // SEPARATE nested "ancestors" pill rendered above the parents once this
      // group is expanded — so expanding your side does not immediately reveal
      // your grandparents / aunts / uncles.
      const allPeople = [
        ...parentsArr,
        ...sibSlots.flatMap(s => [s.primary, ...(s.spouse ? [s.spouse] : [])]),
      ];
      const allNames = allPeople.map((p: any) => p.firstName);
      const label =
        allNames.slice(0, 3).join(", ") +
        (allNames.length > 3 ? ` +${allNames.length - 3}` : "");
      const pillX = side === "left" ? anchorX - PILL_W : anchorX;
      nodes.push({
        id: groupPillId,
        type: "pill",
        position: { x: pillX, y: y - V_GAP / 2 },
        data: { members: allPeople, label, pillId: groupPillId },
      });
      addEdge(groupPillId, coupleId, 0.5);
      return;
    }

    // ── Expanded group ─────────────────────────────────────────────────────

    // Sibling row start x (rows grow away from the core couple)
    const sibRowStartX = side === "left" ? anchorX - totalSibW : anchorX;

    // Center of the sibling row (for positioning parents above)
    const sibRowCx = totalSibW > 0 ? sibRowStartX + totalSibW / 2 : anchorX;
    const parentsY = y - V_GAP;
    const parentsNodeW = parentsArr.length >= 2 ? COUPLE_W : parentsArr.length === 1 ? PERSON_W : 0;
    const parentTargetId = parentsArr.length > 0 ? `${groupPillId}-parents` : coupleId;

    // ── Ancestors pill: parents' parents (grandparents) + parents' siblings
    //    (aunts / uncles). Collapsed by default so expanding YOUR side does not
    //    immediately surface the grandparent generation. Click it to expand.
    const ancestorsPillId = `${groupPillId}-ancestors`;
    const ancestorsExpanded = expandedPills.has(ancestorsPillId);
    const ancestorsPeople = [
      ...grandparentsArr,
      ...auntUncleSlots.flatMap(s => [s.primary, ...(s.spouse ? [s.spouse] : [])]),
    ];
    const ancestorsY = parentsY - V_GAP;

    // Center of the full parents-generation row: parents couple + all aunt/uncle
    // slots that extend to one side of the parents. sibRowCx is the center of the
    // SIBLING row (generation below), which is also where the parents couple is
    // centered. But the grandparent must be centered over the wider parents row.
    //   For left side: row goes [aunts …] [gap] [parents couple]
    //     right edge = sibRowCx + parentsNodeW/2, left edge = sibRowCx - parentsNodeW/2 - SIB_GAP - totalAuW
    //     center = sibRowCx - (SIB_GAP + totalAuW) / 2  (parentsNodeW cancels)
    //   For right side: mirrored → center = sibRowCx + (SIB_GAP + totalAuW) / 2
    const totalAuW =
      auntUncleSlots.reduce((s: number, sl: SibSlot) => s + sibSlotW(sl), 0) +
      Math.max(0, auntUncleSlots.length - 1) * SIB_GAP;
    const auShift = auntUncleSlots.length > 0 ? (SIB_GAP + totalAuW) / 2 : 0;
    const parentsRowCx = side === "left" ? sibRowCx - auShift : sibRowCx + auShift;

    if (ancestorsPeople.length > 0 && !ancestorsExpanded) {
      // Collapsed nested pill above the parents.
      const names = ancestorsPeople.map((p: any) => p.firstName);
      const ancLabel =
        names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3}` : "");
      nodes.push({
        id: ancestorsPillId,
        type: "pill",
        position: { x: parentsRowCx - PILL_W / 2, y: ancestorsY },
        data: { members: ancestorsPeople, label: ancLabel, pillId: ancestorsPillId },
      });
      addEdge(ancestorsPillId, parentTargetId, 0.4);
    } else if (ancestorsPeople.length > 0 && ancestorsExpanded) {
      // Expanded: grandparents couple at the top, parents' siblings (aunts /
      // uncles) in a row at the parents' generation extending away from centre.
      let gpAnchorId = parentTargetId;
      if (grandparentsArr.length > 0) {
        const gpMems = grandparentsArr.map((p: any) => relabeled(p, "parent"));
        const gpW = gpMems.length >= 2 ? COUPLE_W : PERSON_W;
        const gpNodeId = `${groupPillId}-grandparents`;
        nodes.push({
          id: gpNodeId,
          type: "couple",
          position: { x: parentsRowCx - gpW / 2, y: ancestorsY },
          data: { parents: gpMems, unitName: "", pillId: ancestorsPillId },
        });
        addEdge(gpNodeId, parentTargetId, 0.4);
        gpAnchorId = gpNodeId;
      }
      // Aunts / uncles at the parents' generation, beside the parents couple.
      let auX = side === "left"
        ? sibRowCx - parentsNodeW / 2 - SIB_GAP
        : sibRowCx + parentsNodeW / 2 + SIB_GAP;
      for (const slot of auntUncleSlots) {
        const sw = sibSlotW(slot);
        const auMems = [
          relabeled(slot.primary, "sibling"),
          ...(slot.spouse ? [relabeled(slot.spouse, "sibling-spouse")] : []),
        ];
        const auNodeId = `grpn-au-${slot.primary.id}`;
        const auPosX = side === "left" ? auX - sw : auX;
        nodes.push({
          id: auNodeId,
          type: "couple",
          position: { x: auPosX, y: parentsY },
          data: { parents: auMems, unitName: "" },
        });
        addEdge(gpAnchorId, auNodeId, 0.4);
        auX = side === "left" ? auPosX - SIB_GAP : auPosX + sw + SIB_GAP;
      }
    }

    // Parents couple node (above sibling row)
    // When siblings exist, do NOT draw parent → coupleId: that edge routes through
    // the sibling row (both at y=0) and creates tangled lines. The connection is
    // implied by the parent → sibling edges. When there are no siblings, draw the
    // edge directly to the core couple so parents aren't floating disconnected.
    if (parentsArr.length > 0) {
      const pMems = parentsArr.map((p: any) => relabeled(p, "parent"));
      const parentNodeId = `${groupPillId}-parents`;
      nodes.push({
        id: parentNodeId,
        type: "couple",
        position: { x: sibRowCx - parentsNodeW / 2, y: parentsY },
        data: { parents: pMems, unitName: "", pillId: groupPillId },
      });
      // Connect parents → core couple when the relevant member (viewer for
      // grp:viewer, spouse for grp:spouse) is actually a child of these parents.
      // viewerParentIds / spouseParentIds come from the absolute graph, so this
      // is correct for everyone: true matriarchs have no parents (empty set →
      // no edge), children always get the connecting edge even when siblings
      // are present (which previously left the viewer visually disconnected).
      const groupIsForViewer = groupPillId === "grp:viewer";
      const isChildOfTheseParents = groupIsForViewer
        ? viewerParentIds.size > 0
        : spouseParentIds.size > 0;

      if (isChildOfTheseParents) {
        addEdge(parentNodeId, coupleId, 0.5);
      } else if (sibSlots.length === 0 && grandparentsArr.length === 0) {
        addEdge(parentNodeId, coupleId, 0.5);
      }
    }

    // Sibling slots in a horizontal row
    let sibX = sibRowStartX;
    for (const slot of sibSlots) {
      const sw = sibSlotW(slot);
      const sibMems = [
        relabeled(slot.primary, "sibling"),
        ...(slot.spouse ? [relabeled(slot.spouse, "sibling-spouse")] : []),
      ];
      const sibNodeId = `grpn-sib-${slot.primary.id}`;

      // Only carry a pillId when this sibling's own kids are expanded — clicking
      // the background then collapses just that sibling's kids, not the whole group.
      const kidsExpanded = slot.children.length > 0 && expandedPills.has(slot.kidsId);
      nodes.push({
        id: sibNodeId,
        type: "couple",
        position: { x: sibX, y },
        data: { parents: sibMems, unitName: "", pillId: kidsExpanded ? slot.kidsId : undefined },
      });

      // Connect sibling to the grandparents node ONLY when it's actually
      // rendered (ancestors pill expanded) and the sibling's parentPersonId
      // matches a grandparent; else to parents, else to core couple.
      const gpNodeRendered =
        grandparentsArr.length > 0 && expandedPills.has(`${groupPillId}-ancestors`);
      const connectsToGp =
        gpNodeRendered &&
        grandparentsArr.some((gp: any) => slot.primary.parentPersonId === gp.id);
      const sibEdgeSrc = connectsToGp
        ? `${groupPillId}-grandparents`
        : parentsArr.length > 0
          ? `${groupPillId}-parents`
          : coupleId;
      addEdge(sibEdgeSrc, sibNodeId, 0.4);

      // Kids below this sibling (if any)
      if (slot.children.length > 0) {
        const kidsY = y + NODE_H + KIDS_SEP;
        const sibCx = sibX + sw / 2;

        if (kidsExpanded) {
          // Expanded: individual child nodes in a row
          const kidRowW = slot.children.length * PERSON_W + (slot.children.length - 1) * H_GAP;
          const kidStartX = sibCx - kidRowW / 2;
          slot.children.forEach((kid: any, ki: number) => {
            const kidNodeId = `grpn-kid-${kid.id}`;
            nodes.push({
              id: kidNodeId,
              type: "child",
              position: { x: kidStartX + ki * (PERSON_W + H_GAP), y: kidsY },
              data: { member: relabeled(kid, "child") },
            });
            addEdge(sibNodeId, kidNodeId, 0.4);
          });
        } else {
          // Collapsed: single kids pill
          const kidNames = slot.children.map((k: any) => k.firstName);
          const kidLabel =
            kidNames.slice(0, 3).join(", ") +
            (kidNames.length > 3 ? ` +${kidNames.length - 3}` : "");
          nodes.push({
            id: slot.kidsId,
            type: "pill",
            position: { x: sibCx - PILL_W / 2, y: kidsY },
            data: { members: slot.children, label: kidLabel, pillId: slot.kidsId },
          });
          addEdge(sibNodeId, slot.kidsId, 0.4);
        }
      }

      sibX += sw + SIB_GAP;
    }
  };

  // ── Render family groups ────────────────────────────────────────────────────
  // IMPORTANT: when viewerIsFamilyHead the couple node is ordered [spouse, viewer]
  // (Miranda on LEFT, Spencer on RIGHT). Each person's family must extend toward
  // their own side of the couple — viewer RIGHT → viewer's family RIGHT, spouse
  // LEFT → spouse's family LEFT. For all other viewers the order is [viewer, spouse]
  // (viewer LEFT) so the default sides are simply swapped. Never hard-code "left"
  // or "right" here — always derive from viewerIsFamilyHead.
  const viewerSide: "left" | "right" = viewerIsFamilyHead ? "right" : "left";
  const spouseSide: "left" | "right" = viewerIsFamilyHead ? "left"  : "right";

  if (
    viewerGrandparents.length > 0 ||
    viewerParents.length > 0 ||
    viewerSiblings.length > 0 ||
    viewerAuntsUncles.length > 0
  ) {
    renderGroup(viewerGrandparents, viewerParents, viewerSibSlots, "grp:viewer", viewerSide, viewerAuntUncleSlots);
  }
  if (
    spouseParents.length > 0 ||
    spouseSiblings.length > 0 ||
    spouseGrandparents.length > 0 ||
    spouseAuntsUncles.length > 0
  ) {
    renderGroup(spouseGrandparents, spouseParents, spouseSibSlots, "grp:spouse", spouseSide, spouseAuntUncleSlots);
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Tree() {
  const { user } = useAuth();
  const unitId = user?.familyUnit.id || "";
  const [, navigate] = useLocation();

  // Admin-only: ?viewAs=personId lets the admin preview the tree from any member's POV
  const viewAsId = user?.isAdmin
    ? (new URLSearchParams(window.location.search).get("viewAs") ?? null)
    : null;

  const { data: treeData, isLoading } = useGetFamilyTree(unitId, {
    query: {
      enabled: !!unitId,
      queryKey: getGetFamilyTreeQueryKey(unitId),
    },
  });

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Per-session pill expand state (not persisted — resets on page load per spec)
  const [expandedPills, setExpandedPills] = useState<Set<string>>(new Set());

  // Explicit spouse pairs from the relationship DB (personId → spouseId, bidirectional)
  const [explicitPairs, setExplicitPairs] = useState<Map<string, string>>(new Map());
  // Map of parentId → Set<childId> seeded from biological_parent / adoptive_parent
  // / step_parent edges in the relationships table. Lets the layered view
  // recognise matriarchs / patriarchs (e.g. Deborah) who have no parentPersonId
  // children on the persons table.
  const [childrenByParent, setChildrenByParent] = useState<Map<string, Set<string>>>(new Map());
  // Inverse: childId → Set<parentId>. Used by the layered view to derive a
  // viewer's parents, siblings, and grandparents from the explicit graph
  // instead of admin-relative labels (which are wrong for matriarchs / in-laws).
  const [parentsByChild, setParentsByChild] = useState<Map<string, Set<string>>>(new Map());

  const togglePill = (pillId: string) => {
    setExpandedPills((prev) => {
      const next = new Set(prev);
      if (next.has(pillId)) next.delete(pillId);
      else next.add(pillId);
      return next;
    });
  };

  // Fetch explicit relationship edges and build a bidirectional spouse map
  useEffect(() => {
    if (!unitId) return;
    const token = localStorage.getItem("oliveToken");
    if (!token) return;

    fetch(`/api/family-units/${unitId}/relationships`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : [])
      .then((rows: Array<{ fromPerson: string; toPerson: string; type: string }>) => {
        const spouseMap = new Map<string, string>();
        const childrenMap = new Map<string, Set<string>>();
        const parentsMap = new Map<string, Set<string>>();
        for (const row of rows) {
          if (row.type === "spouse") {
            spouseMap.set(row.fromPerson, row.toPerson);
            spouseMap.set(row.toPerson, row.fromPerson);
          } else if (
            row.type === "biological_parent" ||
            row.type === "adoptive_parent" ||
            row.type === "step_parent"
          ) {
            // from_person = child, to_person = parent
            const parentId = row.toPerson;
            const childId = row.fromPerson;
            if (!childrenMap.has(parentId)) childrenMap.set(parentId, new Set());
            childrenMap.get(parentId)!.add(childId);
            if (!parentsMap.has(childId)) parentsMap.set(childId, new Set());
            parentsMap.get(childId)!.add(parentId);
          }
        }
        setExplicitPairs(spouseMap);
        setChildrenByParent(childrenMap);
        setParentsByChild(parentsMap);
      })
      .catch(() => {/* best-effort; fall back to heuristic */});
  }, [unitId]);

  useEffect(() => {
    if (!treeData?.rootUnit || !user) return;
    const allMembers: any[] = treeData.rootUnit.members ?? [];

    let n: any[], e: any[];
    // viewAs overrides the viewer when an admin passes ?viewAs=personId
    const viewerPerson = allMembers.find((m: any) => m.id === (viewAsId ?? user.id));
    if (viewerPerson) {
      ({ nodes: n, edges: e } = layoutLayeredView(viewerPerson, allMembers, 0, 0, expandedPills, explicitPairs, childrenByParent, parentsByChild));
    } else {
      ({ nodes: n, edges: e } = layoutUnit(treeData.rootUnit, 0, 0, explicitPairs));
    }

    setNodes(n);
    setEdges(e);
  }, [treeData, user, viewAsId, expandedPills, explicitPairs, childrenByParent, parentsByChild, setNodes, setEdges]);

  if (isLoading) {
    return (
      <div className="min-h-[600px] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const allMembers: any[] = treeData?.rootUnit?.members ?? [];
  const viewAsPerson = viewAsId ? allMembers.find((m: any) => m.id === viewAsId) : null;

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] space-y-4">
      {/* Preview banner — only visible when an admin is using ?viewAs= */}
      {viewAsPerson && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-900">
          <span>
            👁 Previewing tree as <strong>{viewAsPerson.firstName} {viewAsPerson.lastName}</strong>
          </span>
          <button
            onClick={() => navigate("/tree")}
            className="font-medium underline underline-offset-2 hover:text-amber-700 transition-colors whitespace-nowrap"
          >
            Exit preview
          </button>
        </div>
      )}

      <div>
        <h1 className="text-4xl font-serif font-bold text-foreground">Family Tree</h1>
        <p className="text-muted-foreground mt-1">Click any person to view their profile.</p>
      </div>

      <div className="flex-1 rounded-2xl border overflow-hidden shadow-inner bg-[#FAF7F2]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          className="bg-[#FAF7F2]"
          onNodeClick={(event, node) => {
            // ── Pill: expand / collapse ──────────────────────────────────
            if (node.type === "pill") {
              togglePill(node.data.pillId as string);
              return;
            }

            // ── Expanded pill root: collapse when clicking outside a card ──
            if (node.data?.pillId) {
              const card = (event.target as HTMLElement).closest("[data-person-id]");
              if (!card) {
                togglePill(node.data.pillId as string);
                return;
              }
            }

            // ── Normal node: navigate to person profile ──────────────────
            const card = (event.target as HTMLElement).closest("[data-person-id]");
            if (card) {
              const personId = card.getAttribute("data-person-id");
              if (personId) navigate(`/members/${personId}`);
            }
          }}
        >
          <Background color="#c8ddd0" gap={24} size={1} />
          <Controls className="bg-card border shadow-sm rounded-xl" />
          <MiniMap
            className="bg-card border rounded-xl overflow-hidden shadow-sm"
            maskColor="rgba(74,124,89,0.08)"
            nodeColor="hsl(var(--primary))"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
