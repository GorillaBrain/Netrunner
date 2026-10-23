import React, { useState } from 'react';
import {
  MonitorSmartphone,
  Router,
  Server,
  Cable,
  Folder,
  Cloud,
  Monitor,
  Laptop,
  Smartphone,
  Network,
  Share2,
  Shield,
  Plus,
} from 'lucide-react';
import { useNetworkStore } from '../store/useNetworkStore.js';
import { DEVICE_TYPES } from '../engine/deviceModels.js';

const DOCK_GROUPS = [
  {
    id: 'end-devices',
    label: 'End Device',
    icon: MonitorSmartphone,
    items: [
      { type: DEVICE_TYPES.PC, label: 'Desktop PC', icon: Monitor },
      { type: DEVICE_TYPES.LAPTOP, label: 'Laptop', icon: Laptop },
      { type: DEVICE_TYPES.SMARTPHONE, label: 'Smartphone', icon: Smartphone },
      { type: DEVICE_TYPES.SERVER, label: 'Server (HTTP/DNS/DHCP)', icon: Server },
    ],
  },
  {
    id: 'routers',
    label: 'Routers & Gateways',
    icon: Router,
    items: [
      { type: DEVICE_TYPES.ROUTER, label: 'Layer 3 Router', icon: Router },
      { type: DEVICE_TYPES.FIREWALL, label: 'Security Firewall', icon: Shield },
    ],
  },
  {
    id: 'switches',
    label: 'Switches & Hubs',
    icon: Network,
    items: [
      { type: DEVICE_TYPES.SWITCH, label: 'Layer 2 Switch', icon: Network },
      { type: DEVICE_TYPES.HUB, label: 'Layer 1 Hub', icon: Share2 },
    ],
  },
];

export default function BottomDock() {
  const [openGroupId, setOpenGroupId] = useState(null);
  const addDevice = useNetworkStore((s) => s.addDevice);
  const activeTool = useNetworkStore((s) => s.activeTool);
  const setActiveTool = useNetworkStore((s) => s.setActiveTool);
  const setActiveModal = useNetworkStore((s) => s.setActiveModal);

  const onDragStart = (event, deviceType) => {
    event.dataTransfer.setData('application/netrunner-device', deviceType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const activeGroup = DOCK_GROUPS.find((g) => g.id === openGroupId);

  return (
    <div className="nr-bottom-dock-wrap">
      {/* Sub-palette drawer when a device category is active */}
      {activeGroup && (
        <div className="nr-dock-subpalette" role="region" aria-label={activeGroup.label}>
          <div className="nr-dock-subpalette-header">
            <span>{activeGroup.label} — Click or Drag onto Workspace</span>
          </div>
          <div className="nr-dock-subpalette-grid">
            {activeGroup.items.map((item) => {
              const ItemIcon = item.icon;
              return (
                <button
                  key={item.type}
                  type="button"
                  draggable
                  onDragStart={(e) => onDragStart(e, item.type)}
                  onClick={() => addDevice(item.type)}
                  className="nr-subpalette-item"
                  title={`Click or drag to add ${item.label}`}
                >
                  <div className="nr-subpalette-icon">
                    <ItemIcon size={18} />
                    <Plus size={10} className="nr-plus-badge" />
                  </div>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Bottom Floating Dock */}
      <nav className="nr-bottom-dock" aria-label="Device Palette">
        {DOCK_GROUPS.map((group) => {
          const GroupIcon = group.icon;
          const isOpen = openGroupId === group.id;
          return (
            <div key={group.id} className="nr-dock-item-wrap">
              {isOpen && <div className="nr-dock-tooltip">{group.label}</div>}
              <button
                type="button"
                className={`nr-dock-btn ${isOpen ? 'is-active' : ''}`}
                onClick={() =>
                  setOpenGroupId((prev) =>
                    prev === group.id ? null : group.id
                  )
                }
                title={group.label}
              >
                <GroupIcon size={20} />
              </button>
            </div>
          );
        })}

        {/* Cable Connection Tool */}
        <div className="nr-dock-item-wrap">
          <button
            type="button"
            className={`nr-dock-btn ${
              activeTool === 'connect' ? 'is-active' : ''
            }`}
            onClick={() => {
              setOpenGroupId(null);
              setActiveTool(activeTool === 'connect' ? 'select' : 'connect');
            }}
            title="Connect Virtual Ethernet Cable"
          >
            <Cable size={20} />
          </button>
        </div>

        {/* Saved Topologies / Labs */}
        <div className="nr-dock-item-wrap">
          <button
            type="button"
            className="nr-dock-btn"
            onClick={() => {
              setOpenGroupId(null);
              setActiveModal('saveLoad');
            }}
            title="Save / Load Topologies"
          >
            <Folder size={20} />
          </button>
        </div>

        {/* Add ISP / WAN Cloud Node */}
        <div className="nr-dock-item-wrap">
          <button
            type="button"
            draggable
            onDragStart={(e) => onDragStart(e, DEVICE_TYPES.CLOUD)}
            onClick={() => {
              setOpenGroupId(null);
              addDevice(DEVICE_TYPES.CLOUD);
            }}
            className="nr-dock-btn"
            title="Add ISP / WAN Cloud Node"
          >
            <Cloud size={20} />
          </button>
        </div>
      </nav>
    </div>
  );
}
