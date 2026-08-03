import { useEffect, useMemo, useCallback, useRef, useState, forwardRef, useImperativeHandle } from 'react';
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
import SimulationOverlay from '../models/SimulationOverlay.jsx';
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
  readOnly = false,
  pingArmed = false,
  onUpdateDevicePosition,
  onSelectDevice,
  onConfigureDevice,
  onRequestDeleteDevice,
  onConfigureLink,
  onRequestDeleteLink,
  onPaneClick,
  // Ping props
  pingState = PingState.NORMAL,
  pingSourceId = null,
  highlightedLinkIds = [],
  pingHops = null,
  pingAnimating = false,
  onPingAnimationComplete = null,
  // Simulation packet animation
  simActive = false,
  simSegments = [],
  simSpeed = 1,
  simPaused = false,
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
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null);

  // Devices are the source of truth; rebuild nodes when they (or link/ping state) change.
  useEffect(() => {
    setNodes(devices.map((d) => ({
      id: String(d.id),
      type: 'device',
      position: { x: d.x, y: d.y },
      data: {
        device: d,
        // Clickable affordance (pointer + hover ring): link/ping picking on the
        // Build screen, or a running simulation waiting for ping clicks.
        linking: isInteractive || (readOnly && pingArmed),
        isSource: d.id === sourceDeviceId || d.id === pingSourceId,
        showIp: showInterfaceIps,
        // No delete affordance on the read-only (simulation) canvas.
        onRequestDelete: readOnly ? undefined : onRequestDeleteDevice,
      },
    })));
  }, [devices, isInteractive, sourceDeviceId, pingSourceId, showInterfaceIps, readOnly, pingArmed, onRequestDeleteDevice, setNodes]);

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
        hovered: !readOnly && !isInteractive && link.id === hoveredEdgeId,
        onRequestDelete: readOnly ? undefined : onRequestDeleteLink,
      },
    };
  }), [links, devices, showInterfaceIps, highlightedLinkIds, isInteractive, hoveredEdgeId, readOnly, onRequestDeleteLink]);

  const handleNodeClick = useCallback((_, node) => {
    // Read-only (simulation) canvas: single click always goes to the app —
    // that's how the user picks ping source and target on a running world.
    if (readOnly || isInteractive) onSelectDevice(Number(node.id));
  }, [readOnly, isInteractive, onSelectDevice]);

  const handlePaneClick = useCallback(() => {
    onPaneClick?.();
  }, [onPaneClick]);

  const handleNodeDoubleClick = useCallback((_, node) => {
    if (readOnly) return;
    onConfigureDevice(Number(node.id));
  }, [readOnly, onConfigureDevice]);

  const handleEdgeDoubleClick = useCallback((_, edge) => {
    if (readOnly) return;
    onConfigureLink?.(Number(edge.id));
  }, [readOnly, onConfigureLink]);

  const handleEdgeMouseEnter = useCallback((_, edge) => {
    setHoveredEdgeId(Number(edge.id));
  }, []);

  const handleEdgeMouseLeave = useCallback(() => {
    setHoveredEdgeId(null);
  }, []);

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
        onPaneClick={handlePaneClick}
        onEdgeDoubleClick={handleEdgeDoubleClick}
        onEdgeMouseEnter={handleEdgeMouseEnter}
        onEdgeMouseLeave={handleEdgeMouseLeave}
        minZoom={0.3}
        maxZoom={2.5}
        nodesConnectable={false}
        nodesDraggable={!readOnly}
        elementsSelectable={!isInteractive && !readOnly}
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

        {simActive && (
          <SimulationOverlay segments={simSegments} speed={simSpeed} paused={simPaused} />
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
