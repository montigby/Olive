import { useGetFamilyTree, getGetFamilyTreeQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
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

const PARENT_LABELS = new Set([
  "mom", "mother", "dad", "father", "husband", "wife", "spouse",
  "partner", "grandma", "grandpa", "grandmother", "grandfather",
  "nana", "papa", "nan", "pop", "pops", "gram", "gramps",
]);

const GRANDCHILD_LABELS = new Set([
  "grandson", "granddaughter", "grandchild",
]);

function isParentRole(label: string) {
  return PARENT_LABELS.has(label.toLowerCase().trim());
}

function isGrandchildRole(label: string) {
  return GRANDCHILD_LABELS.has(label.toLowerCase().trim());
}

// ---------------------------------------------------------------------------
// Layout sizes
// ---------------------------------------------------------------------------
const PERSON_W = 190;
const PERSON_H = 56;
const COUPLE_CONNECTOR_W = 36; // ring + two lines
const COUPLE_W = PERSON_W * 2 + COUPLE_CONNECTOR_W;
const V_GAP = 120;
const H_GAP = 16;

// ---------------------------------------------------------------------------
// PersonCard component
// ---------------------------------------------------------------------------
function PersonCard({ member }: { member: any }) {
  return (
    <div
      className="flex items-center gap-2.5 bg-background rounded-xl border border-border shadow-sm px-3 py-2"
      style={{ width: PERSON_W }}
    >
      <Avatar className="h-8 w-8 flex-shrink-0 border border-primary/20">
        <AvatarImage src={member.photoUrl} />
        <AvatarFallback className="text-[11px] bg-primary/10 text-primary font-semibold">
          {member.firstName[0]}{member.lastName[0]}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight truncate text-foreground">
          {member.firstName} {member.lastName}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">{member.relationshipLabel}</p>
      </div>
      {member.claimed && <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node types
// ---------------------------------------------------------------------------

const CoupleNode = ({ data }: any) => {
  const { parents, unitName } = data as { parents: any[]; unitName: string };
  return (
    <div className="flex flex-col items-center gap-0">
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      <div className="mb-2 px-4 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold tracking-wide shadow-sm whitespace-nowrap">
        {unitName}
      </div>

      <div className="flex items-center">
        {parents.length === 0 ? (
          <div className="px-4 py-2 text-sm text-muted-foreground italic">No members</div>
        ) : parents.length === 1 ? (
          <PersonCard member={parents[0]} />
        ) : (
          <>
            <PersonCard member={parents[0]} />
            <div className="flex items-center mx-1">
              <div className="w-4 h-0.5 bg-primary/40" />
              <div className="w-3 h-3 rounded-full border-2 border-primary/50 bg-background shadow-sm" />
              <div className="w-4 h-0.5 bg-primary/40" />
            </div>
            <PersonCard member={parents[1]} />
          </>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
};

// A "person" node used for children AND grandchildren
const ChildNode = ({ data }: any) => {
  return (
    <div>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <PersonCard member={data.member} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
};

// A sub-couple: a child who has their own spouse shown inline (no linked unit yet)
const SubCoupleNode = ({ data }: any) => {
  const { person, spouse } = data as { person: any; spouse: any };
  return (
    <div className="flex flex-col items-center">
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="flex items-center">
        <PersonCard member={person} />
        <div className="flex items-center mx-1">
          <div className="w-4 h-0.5 bg-primary/40" />
          <div className="w-3 h-3 rounded-full border-2 border-primary/50 bg-background shadow-sm" />
          <div className="w-4 h-0.5 bg-primary/40" />
        </div>
        <PersonCard member={spouse} />
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
};

const nodeTypes = {
  couple: CoupleNode,
  child: ChildNode,
  subCouple: SubCoupleNode,
};

// ---------------------------------------------------------------------------
// Layout engine
// ---------------------------------------------------------------------------

interface LayoutResult {
  nodes: any[];
  edges: any[];
  totalWidth: number;
}

function layoutUnit(unit: any, cx: number, y: number): LayoutResult {
  const nodes: any[] = [];
  const edges: any[] = [];

  const allMembers: any[] = unit.members || [];

  // Split into parents (adults), children, and grandchildren
  const parents = allMembers.filter((m: any) => isParentRole(m.relationshipLabel));
  const grandchildren = allMembers.filter((m: any) => isGrandchildRole(m.relationshipLabel));
  const children = allMembers.filter(
    (m: any) => !isParentRole(m.relationshipLabel) && !isGrandchildRole(m.relationshipLabel)
  );

  // Fallback: if no explicit parents, treat first 1–2 as parents when no children exist
  let finalParents = parents;
  let finalChildren = children;
  if (parents.length === 0 && children.length > 0) {
    finalParents = children.slice(0, 2);
    finalChildren = children.slice(2);
  }

  // --- Couple node (top) ---
  const coupleId = `couple-${unit.unitId}`;
  const coupleNodeW = finalParents.length >= 2 ? COUPLE_W : PERSON_W;
  nodes.push({
    id: coupleId,
    type: "couple",
    position: { x: cx - coupleNodeW / 2, y },
    data: { parents: finalParents, unitName: unit.unitName },
  });

  // ── Children row ──────────────────────────────────────────────────────────
  // For each child we need to figure out if they have grandchildren attached.
  // Build a map: parentPersonId → grandchildren[]
  const grandchildrenByParent: Record<string, any[]> = {};
  for (const gc of grandchildren) {
    if (gc.parentPersonId) {
      if (!grandchildrenByParent[gc.parentPersonId]) grandchildrenByParent[gc.parentPersonId] = [];
      grandchildrenByParent[gc.parentPersonId].push(gc);
    }
  }
  // Unattached grandchildren (no parentPersonId set)
  const unattachedGrandchildren = grandchildren.filter((gc: any) => !gc.parentPersonId);

  // Total width needed for child row
  let childRowWidth = 0;
  // Each child slot: max(PERSON_W, sum of their grandchildren)
  const childSlotWidths = finalChildren.map((child: any) => {
    const myGrandkids = grandchildrenByParent[child.id] || [];
    if (myGrandkids.length === 0) return PERSON_W;
    return Math.max(PERSON_W, myGrandkids.length * PERSON_W + (myGrandkids.length - 1) * H_GAP);
  });
  childRowWidth = childSlotWidths.reduce((s: number, w: number) => s + w, 0) + (finalChildren.length - 1) * H_GAP;

  // Unattached grandchildren row width
  const unattachedGCWidth =
    unattachedGrandchildren.length > 0
      ? unattachedGrandchildren.length * PERSON_W + (unattachedGrandchildren.length - 1) * H_GAP
      : 0;

  // Linked child units width (for sizing)
  const linkedUnitCount = unit.children?.length || 0;
  const linkedUnitsWidth = linkedUnitCount > 0 ? linkedUnitCount * (COUPLE_W + 60) + (linkedUnitCount - 1) * 60 : 0;

  const totalWidth = Math.max(coupleNodeW, childRowWidth, unattachedGCWidth, linkedUnitsWidth, 10);

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

      // Grandchildren under this child
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

  // Unattached grandchildren below the couple (no specific parent set)
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

  // ── Linked child units (separate family branches) ─────────────────────────
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
      const result = layoutUnit(childUnit, childCx, childY);
      nodes.push(...result.nodes);
      edges.push(...result.edges);

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

  return { nodes, edges, totalWidth };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Tree() {
  const { user } = useAuth();
  const unitId = user?.familyUnit.id || "";

  const { data: treeData, isLoading } = useGetFamilyTree(unitId, {
    query: {
      enabled: !!unitId,
      queryKey: getGetFamilyTreeQueryKey(unitId),
    },
  });

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (treeData?.rootUnit) {
      const { nodes: n, edges: e } = layoutUnit(treeData.rootUnit, 0, 0);
      setNodes(n);
      setEdges(e);
    }
  }, [treeData, setNodes, setEdges]);

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
        <p className="text-muted-foreground mt-1">
          Spouses at the top, children below — grandchildren nest under their parent.
        </p>
      </div>

      <div className="flex-1 rounded-2xl border overflow-hidden relative shadow-inner bg-[#FAF7F2]">
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
          className="bg-[#FAF7F2]"
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
