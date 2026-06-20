import { useEffect, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import DeviceNode from './DeviceNode.jsx';
import LinkEdge from './LinkEdge.jsx';
import { AddingLinkState } from '../models/AddingLinkState.js';
import { portCidr } from '../utils/format.js';
import './TopologyCanvas.css';

const nodeTypes = { device: DeviceNode };
const edgeTypes = { link: LinkEdge };

export default function TopologyCanvas({
  devices,
  links,
  addingLinkState,
  sourceDeviceId,
  showInterfaceIps = true,
  onUpdateDevicePosition,
  onSelectDevice,
  onConfigureDevice,
}) {
  const isLinking =
    addingLinkState === AddingLinkState.SELECTING_SOURCE ||
    addingLinkState === AddingLinkState.SELECTING_DESTINATION;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);

  // Devices are the source of truth; rebuild nodes when they (or link state) change.
  useEffect(() => {
    setNodes(devices.map((d) => ({
      id: String(d.id),
      type: 'device',
      position: { x: d.x, y: d.y },
      data: {
        device: d,
        linking: isLinking,
        isSource: d.id === sourceDeviceId,
        showIp: showInterfaceIps,
      },
    })));
  }, [devices, isLinking, sourceDeviceId, showInterfaceIps, setNodes]);

  const edges = useMemo(() => links.map((link) => {
    const a = devices.find((d) => d.id === link.sourceId);
    const b = devices.find((d) => d.id === link.destId);
    return {
      id: String(link.id),
      source: String(link.sourceId),
      target: String(link.destId),
      type: 'link',
      data: {
        sourceCidr: portCidr(a?.ports?.[link.sourcePort]),
        targetCidr: portCidr(b?.ports?.[link.destPort]),
        showIps: showInterfaceIps,
      },
    };
  }), [links, devices, showInterfaceIps]);

  const handleNodeClick = useCallback((_, node) => {
    if (isLinking) onSelectDevice(Number(node.id));
  }, [isLinking, onSelectDevice]);

  const handleNodeDoubleClick = useCallback((_, node) => {
    onConfigureDevice(Number(node.id));
  }, [onConfigureDevice]);

  const handleNodeDragStop = useCallback((_, node) => {
    onUpdateDevicePosition(Number(node.id), node.position.x, node.position.y);
  }, [onUpdateDevicePosition]);

  return (
    <div className={`topology ${isLinking ? 'topology--linking' : ''}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onNodeDragStop={handleNodeDragStop}
        minZoom={0.3}
        maxZoom={2.5}
        nodesConnectable={false}
        elementsSelectable={!isLinking}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={{ padding: 0.4, maxZoom: 1.2 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} color="#2d3445" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => (n.data?.device?.type === 'router' ? '#f0a23b' : '#56b6ff')}
          maskColor="rgba(8, 10, 16, 0.7)"
          style={{ background: 'var(--bg-panel-2)', border: '1px solid var(--border)' }}
        />
      </ReactFlow>
    </div>
  );
}
