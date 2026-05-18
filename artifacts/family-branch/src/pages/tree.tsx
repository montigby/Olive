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

// Siblings of the head (and their spouses) — rendered at the same Y as the couple, not below it
const SIBLING_LABELS = new Set([
  "brother", "sister", "sibling",
  "brother-in-law", "sister-in-law",
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

function isSiblingRole(label: string) {
  return SIBLING_LABELS.has(label.toLowerCase().trim());
}

function isNephewNieceRole(label: string) {
  return NEPHEW_NIECE_LABELS.has(label.toLowerCase().trim());
}

// ---------------------------------------------------------------------------
// Layout sizes
// ---------------------------------------------------------------------------
const PERSON_W = 190;
const COUPLE_CONNECTOR_W = 36;
const COUPLE_W = PERSON_W * 2 + COUPLE_CONNECTOR_W;
const V_GAP = 120;
const H_GAP = 16;
const PILL_W = 200; // estimated pill width for layout positioning

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
// PersonCard — data-person-id lets onNodeClick detect which person was clicked
// ---------------------------------------------------------------------------
function PersonCard({ member }: { member: any }) {
  return (
    <div
      data-person-id={member.id}
      className="nopan flex items-center gap-2.5 bg-background rounded-xl border border-border shadow-sm px-3 py-2 cursor-pointer hover:border-primary/50 hover:shadow-md hover:bg-secondary/30 transition-all select-none"
      style={{ width: PERSON_W }}
    >
      <Avatar className="h-8 w-8 flex-shrink-0 border border-primary/20 pointer-events-none">
        <AvatarImage src={member.photoUrl} />
        <AvatarFallback className="text-[11px] bg-primary/10 text-primary font-semibold">
          {(member.firstName || "?")[0]}{(member.lastName || "?")[0]}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 pointer-events-none">
        <p className="text-sm font-bold leading-tight truncate text-foreground">{member.firstName}</p>
        <p className="text-[11px] text-foreground/50 truncate leading-none">{member.lastName}</p>
        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{member.relationshipLabel}</p>
      </div>
      {member.claimed && (
        <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 pointer-events-none" />
      )}
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
      <div className="flex items-center">
        {parents.length === 0 ? (
          <div className="px-4 py-2 text-sm text-muted-foreground italic">No members</div>
        ) : parents.length === 1 ? (
          <PersonCard member={parents[0]} />
        ) : (
          <>
            <PersonCard member={parents[0]} />
            <div className="flex items-center mx-1 pointer-events-none">
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

function layoutUnit(unit: any, cx: number, y: number): { nodes: any[]; edges: any[] } {
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

    for (const bro of brothers) {
      const paired =
        sisInLaw.find((s: any) => !usedIds.has(s.id) && s.parentPersonId === bro.id) ??
        sisInLaw.find((s: any) => !usedIds.has(s.id));
      if (paired) { usedIds.add(paired.id); spencerSlots.push({ members: [bro, paired] }); }
      else { spencerSlots.push({ members: [bro] }); }
      usedIds.add(bro.id);
    }
    for (const sis of sisters) {
      const paired =
        broInLaw.find((b: any) => !usedIds.has(b.id) && b.parentPersonId === sis.id) ??
        broInLaw.find((b: any) => !usedIds.has(b.id));
      if (paired) { usedIds.add(paired.id); spencerSlots.push({ members: [sis, paired] }); }
      else { spencerSlots.push({ members: [sis] }); }
      usedIds.add(sis.id);
    }
    for (const bro of broInLaw) {
      if (usedIds.has(bro.id)) continue;
      const paired =
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
      const { nodes: cn, edges: ce } = layoutUnit(childUnit, childCx, childY);
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
  const female = ["wife","mother","mom","sister","niece","granddaughter","daughter","grandmother","grandma","mother-in-law","sister-in-law"];
  const male   = ["husband","father","dad","brother","nephew","grandson","son","grandfather","grandpa","father-in-law","brother-in-law"];
  if (female.includes(label)) return "female";
  if (male.includes(label))   return "male";
  return "unknown";
}

// Relabel a member from the viewer's perspective
function relabeled(member: any, role: "self" | "spouse" | "parent" | "child" | "sibling" | "sibling-spouse"): any {
  const g = inferGender(member);
  const label = (() => {
    switch (role) {
      case "self":          return "self";
      case "spouse":        return g === "female" ? "wife"          : g === "male" ? "husband"        : "spouse";
      case "parent":        return g === "female" ? "mom"           : g === "male" ? "dad"             : "parent";
      case "child":         return g === "female" ? "daughter"      : g === "male" ? "son"             : "child";
      case "sibling":       return g === "female" ? "sister"        : g === "male" ? "brother"         : "sibling";
      case "sibling-spouse":return g === "female" ? "sister-in-law" : g === "male" ? "brother-in-law"  : "in-law";
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
// Spouse map — who is paired with whom across the whole unit
// (mirrors the coupling logic in layoutUnit so the two stay in sync)
// ---------------------------------------------------------------------------
function buildSpouseMap(allMembers: any[]): Map<string, string> {
  const map = new Map<string, string>();
  const pair = (a: any, b: any) => { map.set(a.id, b.id); map.set(b.id, a.id); };

  const head = findFamilyHead(allMembers);
  const partner = allMembers.find((m: any) => isExplicitPartner(m.relationshipLabel ?? ""));
  if (head && partner) pair(head, partner);

  const sibs = allMembers.filter((m: any) => isSiblingRole(m.relationshipLabel ?? ""));
  const brothers = sibs.filter((m: any) => ["brother", "sibling"].includes((m.relationshipLabel ?? "").toLowerCase()));
  const sisters  = sibs.filter((m: any) => (m.relationshipLabel ?? "").toLowerCase() === "sister");
  const sisInLaw = sibs.filter((m: any) => (m.relationshipLabel ?? "").toLowerCase() === "sister-in-law");
  const broInLaw = sibs.filter((m: any) => (m.relationshipLabel ?? "").toLowerCase() === "brother-in-law");
  const used = new Set<string>();

  for (const bro of brothers) {
    const p = sisInLaw.find((s: any) => !used.has(s.id) && s.parentPersonId === bro.id)
           ?? sisInLaw.find((s: any) => !used.has(s.id));
    if (p) { pair(bro, p); used.add(p.id); }
    used.add(bro.id);
  }
  for (const sis of sisters) {
    const p = broInLaw.find((b: any) => !used.has(b.id) && b.parentPersonId === sis.id)
           ?? broInLaw.find((b: any) => !used.has(b.id));
    if (p) { pair(sis, p); used.add(p.id); }
    used.add(sis.id);
  }
  for (const bro of broInLaw) {
    if (used.has(bro.id)) continue;
    const p = sisInLaw.find((s: any) => !used.has(s.id) && s.parentPersonId === bro.id)
           ?? sisInLaw.find((s: any) => !used.has(s.id) && bro.parentPersonId === s.id)
           ?? sisInLaw.find((s: any) => !used.has(s.id));
    if (p) { pair(bro, p); used.add(p.id); }
    used.add(bro.id);
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
): { nodes: any[]; edges: any[] } {
  const nodes: any[] = [];
  const edges: any[] = [];

  const viewerId  = viewerPerson.id;
  const viewerLabel = (viewerPerson.relationshipLabel ?? "").toLowerCase().trim();
  const spouseMap   = buildSpouseMap(allMembers);
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

  // ── Render viewer + spouse couple (labels from viewer's perspective) ──
  const coupleId    = `pv-couple-${viewerId}`;
  const coupleMems  = [
    relabeled(viewerPerson, "self"),
    ...(viewerSpouse ? [relabeled(viewerSpouse, "spouse")] : []),
  ];
  const coupleNodeW = coupleMems.length >= 2 ? COUPLE_W : PERSON_W;

  nodes.push({
    id: coupleId, type: "couple",
    position: { x: cx - coupleNodeW / 2, y },
    data: { parents: coupleMems, unitName: "" },
  });

  // ── Parents above — labelled "mom" / "dad" ──
  if (viewerParents.length > 0) {
    const parentId    = `pv-parents-${viewerId}`;
    const parentMems  = viewerParents.map((p: any) => relabeled(p, "parent"));
    const parentNodeW = parentMems.length >= 2 ? COUPLE_W : PERSON_W;
    nodes.push({
      id: parentId, type: "couple",
      position: { x: cx - parentNodeW / 2, y: y - V_GAP },
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

  // ── Siblings to the right — paired as couples, labelled "brother/sister" + "in-law" ──
  if (viewerSiblings.length > 0) {
    type SibSlot2 = { members: any[] };
    const sibSlots: SibSlot2[] = [];
    const usedSibIds = new Set<string>();

    for (const sib of viewerSiblings) {
      if (usedSibIds.has(sib.id)) continue;
      const sibSpouseId = spouseMap.get(sib.id);
      const sibSpouse   = sibSpouseId && !usedSibIds.has(sibSpouseId)
        ? allMembers.find((m: any) => m.id === sibSpouseId) : null;
      if (sibSpouse) {
        // members[0] = sibling, members[1] = sibling's spouse
        sibSlots.push({ members: [relabeled(sib, "sibling"), relabeled(sibSpouse, "sibling-spouse")] });
        usedSibIds.add(sib.id); usedSibIds.add(sibSpouse.id);
      } else {
        sibSlots.push({ members: [relabeled(sib, "sibling")] });
        usedSibIds.add(sib.id);
      }
    }

    const SEP = H_GAP * 5;
    const sibSlotW = (sl: SibSlot2) => sl.members.length >= 2 ? COUPLE_W : PERSON_W;
    let slotX = cx + coupleNodeW / 2 + SEP;

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
      edges.push({ id: `e-${coupleId}-${slotNodeId}`, source: coupleId, target: slotNodeId, type: "smoothstep", style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.4 } });
      slotX += slotW + H_GAP * 3;
    }
  }

  // ── In-law pill group ──────────────────────────────────────────────────────
  // Collect all member IDs already rendered in this personal view.
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

  // Any member not yet shown becomes part of the in-law pill.
  const pillMembers = allMembers.filter((m: any) => !shownIds.has(m.id));

  if (pillMembers.length > 0) {
    // Stable pill ID derived from the sorted set of member IDs
    const pillNodeIds = pillMembers.map((m: any) => m.id as string).sort();
    const pillId = "pill:" + pillNodeIds.join("-");
    const pillLabel = generatePillLabel(pillMembers, viewerSpouse?.firstName);

    // Position: above the couple, to the LEFT (blood parents are centred above).
    // Use the parent node width as the anchor so the pill never overlaps the
    // parent couple node regardless of whether the viewer has a spouse or not.
    const PILL_SEP = H_GAP * 5;
    const pillY = y - V_GAP;
    const parentNodeW =
      viewerParents.length >= 2 ? COUPLE_W
      : viewerParents.length === 1 ? PERSON_W
      : coupleNodeW;
    const pillX = cx - parentNodeW / 2 - PILL_SEP - PILL_W;
    const edgeId = `e-pill-${pillNodeIds[0]?.slice(0, 8) ?? "x"}-couple`;

    if (expandedPills.has(pillId)) {
      // ── Expanded: render members as a couple / child node ──
      const expId = `pv-pill-exp-${pillNodeIds[0]?.slice(0, 8) ?? "x"}`;
      if (pillMembers.length >= 2) {
        nodes.push({
          id: expId,
          type: "couple",
          position: { x: pillX - (COUPLE_W - PILL_W) / 2, y: pillY },
          data: { parents: pillMembers.slice(0, 2), unitName: "", pillId },
        });
      } else {
        nodes.push({
          id: expId,
          type: "child",
          position: { x: pillX, y: pillY },
          data: { member: pillMembers[0], pillId },
        });
      }
      // If there are more than 2 pill members, render the extras as a row below
      if (pillMembers.length > 2) {
        const extraMembers = pillMembers.slice(2);
        const extraRowW = extraMembers.length * PERSON_W + (extraMembers.length - 1) * H_GAP;
        const extraStartX = pillX - (COUPLE_W - PILL_W) / 2 + COUPLE_W / 2 - extraRowW / 2;
        extraMembers.forEach((em: any, ei: number) => {
          const emId = `pv-pill-extra-${em.id}`;
          nodes.push({
            id: emId, type: "child",
            position: { x: extraStartX + ei * (PERSON_W + H_GAP), y: pillY + V_GAP },
            data: { member: em },
          });
          edges.push({
            id: `e-${expId}-${emId}`, source: expId, target: emId,
            type: "smoothstep",
            style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.4 },
          });
        });
      }
      edges.push({
        id: edgeId, source: expId, target: coupleId,
        type: "smoothstep",
        style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.5 },
      });
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
// Page
// ---------------------------------------------------------------------------

export default function Tree() {
  const { user } = useAuth();
  const unitId = user?.familyUnit.id || "";
  const [, navigate] = useLocation();

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

  const togglePill = (pillId: string) => {
    setExpandedPills((prev) => {
      const next = new Set(prev);
      if (next.has(pillId)) next.delete(pillId);
      else next.add(pillId);
      return next;
    });
  };

  useEffect(() => {
    if (!treeData?.rootUnit || !user) return;
    const allMembers: any[] = treeData.rootUnit.members ?? [];

    let n: any[], e: any[];
    if (user.isAdmin) {
      // Admin sees the full shared tree — no pills (spec §5.1 admin exception)
      ({ nodes: n, edges: e } = layoutUnit(treeData.rootUnit, 0, 0));
    } else {
      // Everyone else sees a personal view centred on themselves,
      // with in-law branches collapsed to pills by default.
      const viewerPerson = allMembers.find((m: any) => m.id === user.id);
      if (viewerPerson) {
        ({ nodes: n, edges: e } = layoutPersonalView(viewerPerson, allMembers, 0, 0, expandedPills));
      } else {
        ({ nodes: n, edges: e } = layoutUnit(treeData.rootUnit, 0, 0));
      }
    }

    setNodes(n);
    setEdges(e);
  }, [treeData, user, expandedPills, setNodes, setEdges]);

  if (isLoading) {
    return (
      <div className="min-h-[600px] flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] space-y-4">
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
