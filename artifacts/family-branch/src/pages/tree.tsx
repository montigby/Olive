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
// Helpers
// ---------------------------------------------------------------------------

const PARENT_LABELS = new Set([
  "mom", "mother", "dad", "father", "husband", "wife", "spouse",
  "partner", "grandma", "grandpa", "grandmother", "grandfather",
  "nana", "papa", "nan", "pop", "pops", "gram", "gramps",
]);

function isParentRole(label: string) {
  return PARENT_LABELS.has(label.toLowerCase().trim());
}

function splitMembers(members: any[]) {
  const parents = members.filter((m) => isParentRole(m.relationshipLabel));
  const children = members.filter((m) => !isParentRole(m.relationshipLabel));
  // If no clear parent split, treat the first 1-2 as "couple" when there are no children
  if (parents.length === 0 && children.length > 0) {
    return { parents: children.slice(0, 2), children: children.slice(2) };
  }
  return { parents, children };
}

// ---------------------------------------------------------------------------
// Custom node: Person card
// ---------------------------------------------------------------------------
function PersonCard({ member }: { member: any }) {
  return (
    <div className="flex items-center gap-2.5 bg-background rounded-xl border border-border shadow-sm px-3 py-2 min-w-[140px] max-w-[180px]">
      <Avatar className="h-9 w-9 flex-shrink-0 border border-primary/20">
        <AvatarImage src={member.photoUrl} />
        <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
          {member.firstName[0]}{member.lastName[0]}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight truncate text-foreground">
          {member.firstName} {member.lastName}
        </p>
        <p className="text-xs text-muted-foreground truncate">{member.relationshipLabel}</p>
      </div>
      {member.claimed && (
        <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node types
// ---------------------------------------------------------------------------

// Couple node — two person cards side by side with a subtle connector ring
const CoupleNode = ({ data }: any) => {
  const { parents, unitName, isRoot } = data;
  return (
    <div className="flex flex-col items-center gap-0">
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />

      {/* Unit name label */}
      <div className="mb-2 px-4 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold tracking-wide shadow-sm whitespace-nowrap">
        {unitName}
      </div>

      {/* Couple row */}
      <div className="flex items-center gap-0">
        {parents.length === 0 ? (
          <div className="px-4 py-2 text-sm text-muted-foreground italic">No members</div>
        ) : parents.length === 1 ? (
          <PersonCard member={parents[0]} />
        ) : (
          <>
            <PersonCard member={parents[0]} />
            {/* Marriage connector */}
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

// Child person node (single person shown below a couple)
const ChildNode = ({ data }: any) => {
  return (
    <div>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <PersonCard member={data.member} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
};

const nodeTypes = {
  couple: CoupleNode,
  child: ChildNode,
};

// ---------------------------------------------------------------------------
// Layout engine
// ---------------------------------------------------------------------------

const COUPLE_NODE_W = 420;   // approx width of a couple node
const CHILD_NODE_W = 200;    // approx width of a child card
const V_GAP = 140;           // vertical gap between levels
const H_GAP = 20;            // horizontal gap between siblings

interface LayoutResult {
  nodes: any[];
  edges: any[];
  totalWidth: number;
}

function layoutUnit(
  unit: any,
  cx: number,   // center X of this unit cluster
  y: number,    // Y position of this unit's couple row
): LayoutResult {
  const nodes: any[] = [];
  const edges: any[] = [];

  const { parents, children } = splitMembers(unit.members || []);

  // --- Couple node ---
  const coupleId = `couple-${unit.unitId}`;
  nodes.push({
    id: coupleId,
    type: "couple",
    position: { x: cx - COUPLE_NODE_W / 2, y },
    data: { parents, unitName: unit.unitName },
  });

  // --- Children of this unit ---
  let childNodesWidth = 0;
  if (children.length > 0) {
    childNodesWidth = children.length * CHILD_NODE_W + (children.length - 1) * H_GAP;
    const childStartX = cx - childNodesWidth / 2;
    const childY = y + V_GAP;

    children.forEach((child: any, i: number) => {
      const childNodeX = childStartX + i * (CHILD_NODE_W + H_GAP);
      const childId = `person-${unit.unitId}-${child.id}`;
      nodes.push({
        id: childId,
        type: "child",
        position: { x: childNodeX, y: childY },
        data: { member: child },
      });
      edges.push({
        id: `e-${coupleId}-${childId}`,
        source: coupleId,
        target: childId,
        type: "smoothstep",
        style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5, strokeOpacity: 0.5 },
      });
    });
  }

  // --- Linked child units ---
  let linkedUnitsWidth = 0;
  if (unit.children && unit.children.length > 0) {
    // First pass: figure out total width needed for child units
    const childUnitWidths = unit.children.map(() => COUPLE_NODE_W + 60);
    linkedUnitsWidth =
      childUnitWidths.reduce((s: number, w: number) => s + w, 0) +
      (unit.children.length - 1) * 60;

    const unitChildY = y + V_GAP + (children.length > 0 ? V_GAP : 0);
    let startX = cx - linkedUnitsWidth / 2;

    unit.children.forEach((childUnit: any, i: number) => {
      const childCx = startX + childUnitWidths[i] / 2;
      const result = layoutUnit(childUnit, childCx, unitChildY);
      nodes.push(...result.nodes);
      edges.push(...result.edges);

      // Edge from parent couple to child unit couple
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

      startX += childUnitWidths[i] + 60;
    });
  }

  const totalWidth = Math.max(COUPLE_NODE_W, childNodesWidth, linkedUnitsWidth);
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
          Spouses at the top, children branching below — link family units to grow the tree.
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
