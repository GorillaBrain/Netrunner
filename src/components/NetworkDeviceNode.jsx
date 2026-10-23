import React from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Monitor,
  Laptop,
  Smartphone,
  Server,
  Router,
  Network,
  Share2,
  Shield,
  Cloud,
  Mail,
  AlertTriangle,
  Settings,
} from 'lucide-react';
import { getDevicePrimaryIpLabel } from '../engine/deviceModels.js';
import { useNetworkStore } from '../store/useNetworkStore.js';

const ICON_MAP = {
  pc: Monitor,
  laptop: Laptop,
  smartphone: Smartphone,
  server: Server,
  router: Router,
  switch: Network,
  hub: Share2,
  firewall: Shield,
  cloud: Cloud,
};

export default function NetworkDeviceNode({ data }) {
  const {
    device,
    isSelected,
    isAtDevice,
    isLastDevice,
    activeEvent,
    isPendingSource,
    hasDiagnosticError,
  } = data;

  const selectDevice = useNetworkStore((s) => s.selectDevice);
  const handleDeviceCanvasClick = useNetworkStore(
    (s) => s.handleDeviceCanvasClick
  );

  const IconComponent = ICON_MAP[device.type] || Monitor;
  const ipLabel = getDevicePrimaryIpLabel(device);

  const isHighlighted = isSelected || isAtDevice || isPendingSource;
  const isDroppedHere = isAtDevice && activeEvent?.status === 'dropped';
  const isDeliveredHere = isAtDevice && activeEvent?.status === 'delivered';

  const onNodeClick = (e) => {
    e.stopPropagation();
    handleDeviceCanvasClick(device.id);
  };

  const onNodeDoubleClick = (e) => {
    e.stopPropagation();
    selectDevice(device.id, true);
  };

  const onSettingsClick = (e) => {
    e.stopPropagation();
    selectDevice(device.id, true);
  };

  return (
    <div
      className={`nr-device-node ${isHighlighted ? 'is-highlighted' : ''} ${
        isAtDevice ? 'is-at-device' : ''
      } ${isDroppedHere ? 'is-dropped' : ''} ${
        isDeliveredHere ? 'is-delivered' : ''
      } ${isPendingSource ? 'is-pending-source' : ''}`}
      onClick={onNodeClick}
      onDoubleClick={onNodeDoubleClick}
      data-testid={`device-node-${device.id}`}
    >
      {/* Omni-directional invisible handles for clean React Flow connections */}
      <Handle
        type="target"
        position={Position.Top}
        id="target-top"
        className="nr-node-handle"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="source-top"
        className="nr-node-handle"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="target-bottom"
        className="nr-node-handle"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="source-bottom"
        className="nr-node-handle"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="target-left"
        className="nr-node-handle"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="source-left"
        className="nr-node-handle"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="target-right"
        className="nr-node-handle"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source-right"
        className="nr-node-handle"
      />

      {/* Icon Box */}
      <div className="nr-device-icon-wrap">
        <div
          className={`nr-device-icon-box ${
            device.type === 'router' ? 'is-router-box' : ''
          }`}
        >
          <IconComponent size={22} strokeWidth={1.8} />
        </div>

        {/* Quick Configure button on hover/selection */}
        <button
          type="button"
          className="nr-device-gear-btn"
          onClick={onSettingsClick}
          title={`Configure ${device.name}`}
          aria-label={`Configure ${device.name}`}
        >
          <Settings size={12} />
        </button>

        {/* Diagnostic warning badge */}
        {hasDiagnosticError && !isAtDevice && (
          <div
            className="nr-device-diag-badge"
            title="Configuration issue detected — click to inspect"
          >
            <AlertTriangle size={11} />
          </div>
        )}

        {/* Active Packet Envelope Indicator (matching reference screenshot) */}
        {(isAtDevice || isLastDevice) && activeEvent && (
          <div
            className={`nr-packet-badge ${
              isDroppedHere
                ? 'is-dropped'
                : isDeliveredHere
                ? 'is-delivered'
                : 'is-transit'
            }`}
            title={`${activeEvent.subType} (${activeEvent.status})`}
          >
            <div className="nr-packet-envelope">
              <Mail size={13} />
              <span>{activeEvent.protocol}</span>
            </div>
            <div className="nr-packet-progress-track">
              <div
                className="nr-packet-progress-fill"
                style={{
                  width: isDeliveredHere
                    ? '100%'
                    : isDroppedHere
                    ? '100%'
                    : isAtDevice
                    ? '75%'
                    : '35%',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Text Label Block beside the icon box */}
      <div className="nr-device-meta">
        <div className="nr-device-name">{device.name}</div>
        <div className="nr-device-sub">
          {device.type === 'router' || device.type === 'cloud'
            ? device.subtitle || ipLabel
            : ipLabel}
        </div>
        {(device.type === 'router' || device.type === 'cloud') && (
          <div className="nr-device-router-ip">{ipLabel}</div>
        )}
      </div>
    </div>
  );
}
