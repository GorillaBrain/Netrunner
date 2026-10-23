import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Clock, Timer } from 'lucide-react';
import NetworkDeviceNode from './NetworkDeviceNode.jsx';
import NetworkCableEdge from './NetworkCableEdge.jsx';
import { useNetworkStore } from '../store/useNetworkStore.js';
import { analyzeTopologyDiagnostics } from '../engine/networkDiagnostics.js';

const nodeTypes = {
  networkDevice: NetworkDeviceNode,
};

const edgeTypes = {
  networkCable: NetworkCableEdge,
};

/**
 * Computes which side handle (top, bottom, left, right) produces the cleanest cable path
 * between two devices based on their relative coordinates.
 */
function getBestHandles(srcPos, dstPos) {
  if (!srcPos || !dstPos) {
    return { sourceHandle: 'source-right', targetHandle: 'target-left' };
  }
  const dx = dstPos.x - srcPos.x;
  const dy = dstPos.y - srcPos.y;

  if (Math.abs(dx) > Math.abs(dy) * 1.15) {
    return dx >= 0
      ? { sourceHandle: 'source-right', targetHandle: 'target-left' }
      : { sourceHandle: 'source-left', targetHandle: 'target-right' };
  }
  return dy >= 0
    ? { sourceHandle: 'source-bottom', targetHandle: 'target-top' }
    : { sourceHandle: 'source-top', targetHandle: 'target-bottom' };
}

function CanvasInner({ onRegisterZoom }) {
  const reactFlowWrapper = useRef(null);
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();

  const devices = useNetworkStore((s) => s.devices);
  const links = useNetworkStore((s) => s.links);
  const selectedDeviceId = useNetworkStore((s) => s.selectedDeviceId);
  const events = useNetworkStore((s) => s.events);
  const currentStepIndex = useNetworkStore((s) => s.currentStepIndex);
  const isPlaying = useNetworkStore((s) => s.isPlaying);
  const playbackSpeedMs = useNetworkStore((s) => s.playbackSpeedMs);
  const stepForward = useNetworkStore((s) => s.stepForward);
  const executionMode = useNetworkStore((s) => s.executionMode);
  const setExecutionMode = useNetworkStore((s) => s.setExecutionMode);
  const activeTool = useNetworkStore((s) => s.activeTool);
  const pendingConnectSource = useNetworkStore((s) => s.pendingConnectSource);
  const pendingPduSourceId = useNetworkStore((s) => s.pendingPduSourceId);
  const updateDevicePosition = useNetworkStore((s) => s.updateDevicePosition);
  const addDevice = useNetworkStore((s) => s.addDevice);
  const connectDevices = useNetworkStore((s) => s.connectDevices);

  useEffect(() => {
    if (onRegisterZoom) {
      onRegisterZoom({ zoomIn, zoomOut, fitView });
    }
  }, [onRegisterZoom, zoomIn, zoomOut, fitView]);

  // Simulation playback timer loop
  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = setInterval(() => {
      stepForward();
    }, playbackSpeedMs);
    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeedMs, stepForward]);

  const activeEvent =
    currentStepIndex >= 0 && currentStepIndex < events.length
      ? events[currentStepIndex]
      : null;

  const diagnostics = useMemo(
    () => analyzeTopologyDiagnostics(devices, links),
    [devices, links]
  );

  const errorDeviceIds = useMemo(() => {
    const setIds = new Set();
    for (const issue of diagnostics) {
      if (issue.severity === 'error' && issue.deviceId) {
        setIds.add(issue.deviceId);
      }
    }
    return setIds;
  }, [diagnostics]);

  const nodes = useMemo(
    () =>
      devices.map((device) => ({
        id: device.id,
        type: 'networkDevice',
        position: device.position || { x: 200, y: 200 },
        data: {
          device,
          isSelected: selectedDeviceId === device.id,
          isAtDevice: activeEvent?.atDeviceId === device.id,
          isLastDevice: activeEvent?.lastDeviceId === device.id,
          activeEvent,
          isPendingSource:
            pendingConnectSource === device.id ||
            pendingPduSourceId === device.id,
          hasDiagnosticError: errorDeviceIds.has(device.id),
        },
      })),
    [
      devices,
      selectedDeviceId,
      activeEvent,
      pendingConnectSource,
      pendingPduSourceId,
      errorDeviceIds,
    ]
  );

  const edges = useMemo(() => {
    const devMap = new Map(devices.map((d) => [d.id, d]));
    return links.map((link) => {
      const srcDev = devMap.get(link.source);
      const dstDev = devMap.get(link.target);
      const srcIface = srcDev?.interfaces?.find(
        (i) => i.id === link.sourceHandle
      );
      const dstIface = dstDev?.interfaces?.find(
        (i) => i.id === link.targetHandle
      );

      const { sourceHandle, targetHandle } = getBestHandles(
        srcDev?.position,
        dstDev?.position
      );

      const isDown =
        link.status === 'down' ||
        srcIface?.adminUp === false ||
        dstIface?.adminUp === false;

      const isActiveHop =
        activeEvent?.linkId === link.id ||
        (activeEvent?.lastDeviceId === link.source &&
          activeEvent?.atDeviceId === link.target) ||
        (activeEvent?.lastDeviceId === link.target &&
          activeEvent?.atDeviceId === link.source);

      return {
        id: link.id,
        source: link.source,
        target: link.target,
        sourceHandle,
        targetHandle,
        type: 'networkCable',
        data: {
          isActiveHop,
          isDown,
          isDashed: link.source === 'dev-pc-2' || link.target === 'dev-pc-2',
          sourcePort: link.sourceHandle,
          targetPort: link.targetHandle,
        },
      };
    });
  }, [links, devices, activeEvent]);

  const onNodeDragStop = useCallback(
    (_event, node) => {
      updateDevicePosition(node.id, node.position);
    },
    [updateDevicePosition]
  );

  const onConnect = useCallback(
    (params) => {
      if (params.source && params.target) {
        connectDevices(params.source, params.target);
      }
    },
    [connectDevices]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/netrunner-device');
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      addDevice(type, position);
    },
    [screenToFlowPosition, addDevice]
  );

  return (
    <div className="nr-canvas-container" ref={reactFlowWrapper}>
      {/* Floating Real time / Simulation Mode Pill (Top-Left of Canvas) */}
      <div className="nr-mode-pill" role="group" aria-label="Simulation Mode">
        <button
          type="button"
          className={`nr-mode-btn ${
            executionMode === 'realtime' ? 'is-active' : ''
          }`}
          onClick={() => setExecutionMode('realtime')}
        >
          <Clock size={15} />
          <span>Real time</span>
        </button>
        <button
          type="button"
          className={`nr-mode-btn ${
            executionMode === 'simulation' ? 'is-active' : ''
          }`}
          onClick={() => setExecutionMode('simulation')}
        >
          <Timer size={15} />
          <span>Simulation</span>
        </button>
      </div>

      {/* Tool Instruction Banner when Connect or Simple PDU or Delete tool is active */}
      {activeTool !== 'select' && (
        <div className="nr-tool-banner">
          {activeTool === 'connect' &&
            (!pendingConnectSource
              ? 'Cable Tool: Click the first device to attach a virtual Ethernet cable.'
              : 'Cable Tool: Now click the destination device to complete the connection.')}
          {activeTool === 'pdu' &&
            (!pendingPduSourceId
              ? 'Send Packet (PDU): Click the SOURCE device to originate a packet.'
              : 'Send Packet (PDU): Now click the DESTINATION device to launch the simulation!')}
          {activeTool === 'inspect' &&
            'Inspect Tool: Click any device to inspect its Interfaces, ARP Cache, MAC Table, and Routing Table.'}
          {activeTool === 'delete' &&
            'Delete Tool: Click any device or network cable to remove it from the workspace.'}
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        fitView
        fitViewOptions={{ padding: 0.22, maxZoom: 1.05 }}
        minZoom={0.35}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.4}
          color="#252934"
        />
      </ReactFlow>
    </div>
  );
}

export default function NetworkCanvas(props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
