import React from 'react';
import {
  X,
  Layers,
  SkipBack,
  SkipForward,
  AlertOctagon,
  CheckCircle2,
  Cpu,
} from 'lucide-react';
import { useNetworkStore } from '../store/useNetworkStore.js';

export default function PacketInspectorModal() {
  const events = useNetworkStore((s) => s.events);
  const currentStepIndex = useNetworkStore((s) => s.currentStepIndex);
  const stepForward = useNetworkStore((s) => s.stepForward);
  const stepBackward = useNetworkStore((s) => s.stepBackward);
  const setActiveModal = useNetworkStore((s) => s.setActiveModal);

  const evt =
    currentStepIndex >= 0 && currentStepIndex < events.length
      ? events[currentStepIndex]
      : events[0];

  if (!evt) return null;

  const { osiLayers } = evt;

  return (
    <div className="nr-modal-backdrop" onClick={() => setActiveModal(null)}>
      <div
        className="nr-modal-card nr-modal-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="OSI Layer Packet Inspector"
      >
        <div className="nr-modal-header">
          <div className="nr-modal-title-group">
            <Layers size={18} className="nr-accent-icon" />
            <div>
              <h3>
                OSI Layer 1–7 Packet Inspector — Step {evt.stepIndex + 1} of{' '}
                {events.length}
              </h3>
              <p>
                {evt.subType} | Time: {evt.timeSec}s | {evt.lastDeviceName} ➔{' '}
                {evt.atDeviceName}
              </p>
            </div>
          </div>

          <div className="nr-modal-header-actions">
            <button
              type="button"
              className="nr-play-ctrl-btn"
              onClick={stepBackward}
              disabled={currentStepIndex <= 0}
              title="Previous Hop"
            >
              <SkipBack size={15} />
            </button>
            <button
              type="button"
              className="nr-play-ctrl-btn"
              onClick={stepForward}
              disabled={currentStepIndex >= events.length - 1}
              title="Next Hop"
            >
              <SkipForward size={15} />
            </button>
            <button
              type="button"
              className="nr-icon-btn"
              onClick={() => setActiveModal(null)}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="nr-modal-body">
          {/* Drop Diagnosis Alert if packet was dropped */}
          {evt.status === 'dropped' && (
            <div className="nr-drop-alert-card">
              <div className="nr-drop-alert-head">
                <AlertOctagon size={18} />
                <strong>
                  PACKET DROPPED AT {evt.atDeviceName.toUpperCase()} —{' '}
                  {evt.dropReasonCode || 'NETWORK_DROP'}
                </strong>
              </div>
              <p>{evt.dropDiagnostic}</p>
            </div>
          )}

          {/* Device Processing Decisions Log */}
          <div className="nr-form-card nr-mb-12">
            <h4>
              <Cpu size={15} /> Device Stack Decisions at {evt.atDeviceName}
            </h4>
            <ul className="nr-decision-list">
              {(evt.decisions || []).map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>

          {/* OSI Layer Encapsulation Stack */}
          {osiLayers ? (
            <div className="nr-osi-grid">
              {/* Layer 1 */}
              {osiLayers.l1 && (
                <div className="nr-osi-card layer-1">
                  <div className="nr-osi-badge">L1</div>
                  <div className="nr-osi-content">
                    <h5>{osiLayers.l1.layer}</h5>
                    <div className="nr-osi-kv">
                      <span>Medium:</span>
                      <strong>{osiLayers.l1.medium}</strong>
                      <span>Tx Port:</span>
                      <strong>{osiLayers.l1.sourcePort}</strong>
                      <span>Rx Port:</span>
                      <strong>{osiLayers.l1.receivingPort}</strong>
                      <span>Wire Bits:</span>
                      <strong>{osiLayers.l1.frameSizeBits}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Layer 2 */}
              {osiLayers.l2 && (
                <div className="nr-osi-card layer-2">
                  <div className="nr-osi-badge">L2</div>
                  <div className="nr-osi-content">
                    <h5>{osiLayers.l2.layer}</h5>
                    <div className="nr-osi-kv">
                      <span>Source MAC:</span>
                      <strong className="nr-mono">{osiLayers.l2.srcMac}</strong>
                      <span>Destination MAC:</span>
                      <strong className="nr-mono">{osiLayers.l2.dstMac}</strong>
                      <span>EtherType:</span>
                      <strong className="nr-mono">
                        {osiLayers.l2.etherType}
                      </strong>
                      <span>802.1Q VLAN ID:</span>
                      <strong>VLAN {osiLayers.l2.vlanId}</strong>
                      <span>Frame CheckSeq:</span>
                      <strong className="nr-mono">{osiLayers.l2.fcs}</strong>
                    </div>
                  </div>
                </div>
              )}

              {/* Layer 3 (IPv4 or ARP) */}
              {osiLayers.l3 && (
                <div className="nr-osi-card layer-3">
                  <div className="nr-osi-badge">L3</div>
                  <div className="nr-osi-content">
                    <h5>{osiLayers.l3.layer}</h5>
                    {osiLayers.l3.srcIp ? (
                      <div className="nr-osi-kv">
                        <span>Source IPv4:</span>
                        <strong className="nr-mono">
                          {osiLayers.l3.srcIp}
                        </strong>
                        <span>Destination IPv4:</span>
                        <strong className="nr-mono">
                          {osiLayers.l3.dstIp}
                        </strong>
                        <span>TTL (Time to Live):</span>
                        <strong className="nr-mono">{osiLayers.l3.ttl}</strong>
                        <span>Protocol Field:</span>
                        <strong className="nr-mono">
                          {osiLayers.l3.protocol}
                        </strong>
                        <span>Total Length:</span>
                        <strong>{osiLayers.l3.totalLength}</strong>
                        <span>Header Checksum:</span>
                        <strong className="nr-mono">
                          {osiLayers.l3.headerChecksum}
                        </strong>
                      </div>
                    ) : (
                      <div className="nr-osi-kv">
                        <span>ARP Opcode:</span>
                        <strong>{osiLayers.l3.opcode}</strong>
                        <span>Sender IP / MAC:</span>
                        <strong className="nr-mono">
                          {osiLayers.l3.senderIp} ({osiLayers.l3.senderMac})
                        </strong>
                        <span>Target IP / MAC:</span>
                        <strong className="nr-mono">
                          {osiLayers.l3.targetIp} ({osiLayers.l3.targetMac})
                        </strong>
                        <span>Summary:</span>
                        <strong>{osiLayers.l3.summary}</strong>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Layer 4 */}
              {osiLayers.l4 && (
                <div className="nr-osi-card layer-4">
                  <div className="nr-osi-badge">L4</div>
                  <div className="nr-osi-content">
                    <h5>{osiLayers.l4.layer}</h5>
                    <div className="nr-osi-kv">
                      {osiLayers.l4.type ? (
                        <>
                          <span>ICMP Type:</span>
                          <strong>{osiLayers.l4.type}</strong>
                          <span>Sequence #:</span>
                          <strong className="nr-mono">
                            seq={osiLayers.l4.sequenceNumber}
                          </strong>
                          <span>Checksum:</span>
                          <strong className="nr-mono">
                            {osiLayers.l4.checksum}
                          </strong>
                          <span>Echo Data:</span>
                          <strong className="nr-mono">
                            {osiLayers.l4.payloadData}
                          </strong>
                        </>
                      ) : (
                        <>
                          <span>Source Port:</span>
                          <strong className="nr-mono">
                            {osiLayers.l4.srcPort}
                          </strong>
                          <span>Destination Port:</span>
                          <strong className="nr-mono">
                            {osiLayers.l4.dstPort}
                          </strong>
                          {osiLayers.l4.flags && (
                            <>
                              <span>TCP Flags:</span>
                              <strong className="nr-mono">
                                {osiLayers.l4.flags}
                              </strong>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Layer 7 */}
              {osiLayers.l7 && (
                <div className="nr-osi-card layer-7">
                  <div className="nr-osi-badge">L7</div>
                  <div className="nr-osi-content">
                    <h5>{osiLayers.l7.layer}</h5>
                    <div className="nr-osi-kv">
                      {osiLayers.l7.question ? (
                        <>
                          <span>DNS Question:</span>
                          <strong className="nr-mono">
                            {osiLayers.l7.question}
                          </strong>
                          <span>DNS Answer:</span>
                          <strong className="nr-mono">
                            {osiLayers.l7.answer}
                          </strong>
                        </>
                      ) : osiLayers.l7.methodOrStatus ? (
                        <>
                          <span>HTTP Line:</span>
                          <strong className="nr-mono">
                            {osiLayers.l7.methodOrStatus}
                          </strong>
                          <span>Host Header:</span>
                          <strong className="nr-mono">
                            {osiLayers.l7.hostHeader}
                          </strong>
                          <span>Payload Body:</span>
                          <strong className="nr-mono">
                            {osiLayers.l7.bodyPreview}
                          </strong>
                        </>
                      ) : (
                        <>
                          <span>DHCP Message:</span>
                          <strong>{osiLayers.l7.messageType}</strong>
                          <span>Offered Lease:</span>
                          <strong className="nr-mono">
                            {osiLayers.l7.offeredIp}
                          </strong>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="nr-empty-cell">
              No wire frame emitted for this internal stack event.
            </div>
          )}
        </div>

        <div className="nr-modal-footer">
          <div className="nr-footer-hint">
            <CheckCircle2 size={14} className="text-green" />
            <span>
              Tip: Use the Previous/Next buttons above to watch MAC addresses
              and IPv4 TTL update hop-by-hop.
            </span>
          </div>
          <button
            type="button"
            className="nr-top-action-btn nr-btn-primary"
            onClick={() => setActiveModal(null)}
          >
            <span>Close Inspector</span>
          </button>
        </div>
      </div>
    </div>
  );
}
