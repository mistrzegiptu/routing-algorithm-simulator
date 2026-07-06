import { useEffect, useMemo, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import DeviceNode from './DeviceNode.jsx';
import LinkEdge from './LinkEdge.jsx';
import PingOverlay from '../models/PingOverlay.jsx';
import { AddingLinkState } from '../models/AddingLinkState.js';
import { PingState } from '../models/PingState.js';
import { portCidr } from '../utils/format.js';
import './TopologyCanvas.css';

const nodeTypes = { device: DeviceNode };
const edgeTypes = { link: LinkEdge };

const TopologyCanvasInner = forwardRef(function TopologyCanvasInner({
  devices,
  links,
  addingLinkState,
  sourceDeviceId,
  showInterfaceIps = true,
  onUpdateDevicePosition,
  onSelectDevice,
  onConfigureDevice,
  onRequestDeleteDevice,
  // Ping props
  pingState = PingState.NORMAL,
  pingSourceId = null,
  highlightedLinkIds = [],
  pingHops = null,
  pingAnimating = false,
  onPingAnimationComplete = null,
}, ref) {
  const wrapperRef = useRef(null);
  const { screenToFlowPosition } = useReactFlow();

  // Exposes the flow-coordinate at the center of the currently visible canvas,
  // so newly added devices spawn where the user is actually looking.
  useImperativeHandle(ref, () => ({
    getSpawnPosition: () => {
      const el = wrapperRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return screenToFlowPosition({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
    },
  }), [screenToFlowPosition]);

  const isLinking =
    addingLinkState === AddingLinkState.SELECTING_SOURCE ||
    addingLinkState === AddingLinkState.SELECTING_DESTINATION;

  const isPinging =
    pingState === PingState.SELECTING_SOURCE ||
    pingState === PingState.SELECTING_DESTINATION;

  const isInteractive = isLinking || isPinging;

  const [nodes, setNodes, onNodesChange] = useNodesState([]);

  // Devices are the source of truth; rebuild nodes when they (or link/ping state) change.
  useEffect(() => {
    setNodes(devices.map((d) => ({
      id: String(d.id),
      type: 'device',
      position: { x: d.x, y: d.y },
      data: {
        device: d,
        linking: isInteractive,
        isSource: d.id === sourceDeviceId || d.id === pingSourceId,
        showIp: showInterfaceIps,
        onRequestDelete: onRequestDeleteDevice,
      },
    })));
  }, [devices, isInteractive, sourceDeviceId, pingSourceId, showInterfaceIps, onRequestDeleteDevice, setNodes]);

  const edges = useMemo(() => links.map((link) => {
    const a = devices.find((d) => d.id === link.sourceId);
    const b = devices.find((d) => d.id === link.destId);
    const isHighlighted = highlightedLinkIds.includes(link.id);
    return {
      id: String(link.id),
      source: String(link.sourceId),
      target: String(link.destId),
      type: 'link',
      data: {
        sourceCidr: portCidr(a?.ports?.[link.sourcePort]),
        targetCidr: portCidr(b?.ports?.[link.destPort]),
        showIps: showInterfaceIps,
        highlighted: isHighlighted,
        dimmed: highlightedLinkIds.length > 0 && !isHighlighted,
      },
    };
  }), [links, devices, showInterfaceIps, highlightedLinkIds]);

  const handleNodeClick = useCallback((_, node) => {
    if (isInteractive) onSelectDevice(Number(node.id));
  }, [isInteractive, onSelectDevice]);

  const handleNodeDoubleClick = useCallback((_, node) => {
    onConfigureDevice(Number(node.id));
  }, [onConfigureDevice]);

  const handleNodeDragStop = useCallback((_, node) => {
    onUpdateDevicePosition(Number(node.id), node.position.x, node.position.y);
  }, [onUpdateDevicePosition]);

  return (
    <div ref={wrapperRef} className={`topology ${isInteractive ? 'topology--linking' : ''}`}>
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
        elementsSelectable={!isInteractive}
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

        {/* Ping animation overlay rendered inside ReactFlow viewport */}
        {pingAnimating && pingHops && pingHops.length > 0 && (
          <PingOverlay
            hops={pingHops}
            nodes={nodes}
            onComplete={onPingAnimationComplete}
          />
        )}
      </ReactFlow>
    </div>
  );
});

// ReactFlowProvider gives the component access to the flow instance (viewport,
// coordinate helpers) at this level, not just inside <ReactFlow>'s children.
const TopologyCanvas = forwardRef(function TopologyCanvas(props, ref) {
  return (
    <ReactFlowProvider>
      <TopologyCanvasInner {...props} ref={ref} />
    </ReactFlowProvider>
  );
});

export default TopologyCanvas;
