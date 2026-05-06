import { useGetFamilyTree, getGetFamilyTreeQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useCallback, useEffect } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position
} from "reactflow";
import "reactflow/dist/style.css";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const nodeTypes = {
  familyUnit: ({ data }: any) => {
    return (
      <div className="bg-card border-2 border-primary/20 rounded-xl shadow-sm min-w-[250px] overflow-hidden">
        <Handle type="target" position={Position.Top} className="w-3 h-3 bg-primary" />
        <div className="bg-primary/5 p-3 border-b border-primary/10">
          <h3 className="font-serif font-bold text-lg text-center text-primary-foreground bg-primary py-1 px-3 rounded-full inline-block mx-auto">{data.unitName}</h3>
        </div>
        <div className="p-3 flex flex-col gap-2">
          {data.members.map((member: any) => (
            <div key={member.id} className="flex items-center gap-3 p-2 rounded-lg bg-background border shadow-sm">
              <Avatar className="h-8 w-8">
                <AvatarImage src={member.photoUrl} />
                <AvatarFallback className="text-xs bg-secondary">{member.firstName[0]}{member.lastName[0]}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{member.firstName} {member.lastName}</p>
                <p className="text-xs text-muted-foreground truncate">{member.relationshipLabel}</p>
              </div>
              {member.claimed && (
                <div className="w-2 h-2 rounded-full bg-green-500" title="Claimed" />
              )}
            </div>
          ))}
        </div>
        <Handle type="source" position={Position.Bottom} className="w-3 h-3 bg-primary" />
      </div>
    );
  }
};

// Very basic layout algorithm
const layoutTree = (rootNode: any, x = 0, y = 0, level = 0): { nodes: any[], edges: any[] } => {
  let nodes: any[] = [];
  let edges: any[] = [];
  
  const nodeWidth = 300;
  const nodeHeight = 200;
  const xOffset = 350;
  const yOffset = 250;

  nodes.push({
    id: rootNode.unitId,
    type: 'familyUnit',
    position: { x, y },
    data: { 
      unitName: rootNode.unitName,
      members: rootNode.members
    }
  });

  if (rootNode.children && rootNode.children.length > 0) {
    const totalWidth = (rootNode.children.length - 1) * xOffset;
    let startX = x - totalWidth / 2;

    rootNode.children.forEach((child: any, index: number) => {
      const childX = startX + (index * xOffset);
      const childY = y + yOffset;
      
      edges.push({
        id: `e-${rootNode.unitId}-${child.unitId}`,
        source: rootNode.unitId,
        target: child.unitId,
        type: 'smoothstep',
        animated: true,
        style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
      });

      const childLayout = layoutTree(child, childX, childY, level + 1);
      nodes = [...nodes, ...childLayout.nodes];
      edges = [...edges, ...childLayout.edges];
    });
  }

  return { nodes, edges };
};


export default function Tree() {
  const { user } = useAuth();
  const unitId = user?.familyUnit.id || "";

  const { data: treeData, isLoading } = useGetFamilyTree(unitId, {
    query: {
      enabled: !!unitId,
      queryKey: getGetFamilyTreeQueryKey(unitId)
    }
  });

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (treeData?.rootUnit) {
      const { nodes: initialNodes, edges: initialEdges } = layoutTree(treeData.rootUnit, 250, 50);
      setNodes(initialNodes);
      setEdges(initialEdges);
    }
  }, [treeData, setNodes, setEdges]);

  if (isLoading) {
    return <div className="min-h-[600px] flex items-center justify-center">Loading tree...</div>;
  }

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-120px)]">
      <div>
        <h1 className="text-4xl font-serif font-bold text-foreground">Family Tree</h1>
        <p className="text-muted-foreground mt-2">Visualizing your connected family units.</p>
      </div>

      <div className="flex-1 bg-[#FAF7F2] rounded-2xl border overflow-hidden relative shadow-inner">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          className="bg-[#FAF7F2]"
        >
          <Background color="hsl(var(--primary))" gap={20} size={1} />
          <Controls className="bg-card border shadow-sm" />
          <MiniMap className="bg-card border rounded-lg overflow-hidden shadow-sm" maskColor="rgba(0,0,0,0.1)" />
        </ReactFlow>
      </div>
    </div>
  );
}
