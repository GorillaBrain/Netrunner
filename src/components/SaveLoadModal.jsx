import React, { useState } from 'react';
import {
  X,
  FolderOpen,
  Save,
  Download,
  Upload,
  CheckCircle2,
} from 'lucide-react';
import { useNetworkStore } from '../store/useNetworkStore.js';

export default function SaveLoadModal() {
  const devices = useNetworkStore((s) => s.devices);
  const links = useNetworkStore((s) => s.links);
  const activeLabId = useNetworkStore((s) => s.activeLabId);
  const saveTopologyToStorage = useNetworkStore((s) => s.saveTopologyToStorage);
  const getSavedTopologies = useNetworkStore((s) => s.getSavedTopologies);
  const loadSavedTopology = useNetworkStore((s) => s.loadSavedTopology);
  const importTopologyJson = useNetworkStore((s) => s.importTopologyJson);
  const setActiveModal = useNetworkStore((s) => s.setActiveModal);

  const [saveName, setSaveName] = useState('My Custom Lab Topology');
  const [savedList, setSavedList] = useState(() => getSavedTopologies());
  const [statusMsg, setStatusMsg] = useState('');
  const [jsonInput, setJsonInput] = useState('');

  const handleSave = (e) => {
    e.preventDefault();
    const res = saveTopologyToStorage(saveName.trim() || 'Untitled Topology');
    if (res.ok) {
      setSavedList(res.list);
      setStatusMsg(`Saved "${res.entry.name}" to browser storage!`);
    }
  };

  const handleExportDownload = () => {
    const payload = JSON.stringify(
      {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        activeLabId,
        devices,
        links,
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(saveName || 'netrunner-topology')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}.netrunner.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMsg('Downloaded topology JSON file.');
  };

  const handleImportText = (e) => {
    e.preventDefault();
    if (!jsonInput.trim()) return;
    const res = importTopologyJson(jsonInput);
    if (res.ok) {
      setStatusMsg('Imported topology successfully!');
      setActiveModal(null);
    } else {
      setStatusMsg(`Import Error: ${res.error}`);
    }
  };

  return (
    <div className="nr-modal-backdrop" onClick={() => setActiveModal(null)}>
      <div
        className="nr-modal-card nr-modal-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Save and Load Topologies"
      >
        <div className="nr-modal-header">
          <div className="nr-modal-title-group">
            <FolderOpen size={18} className="nr-accent-icon" />
            <div>
              <h3>Save, Load & Export Network Topologies</h3>
              <p>
                Persist your custom network architectures locally or export
                portable JSON files.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="nr-icon-btn"
            onClick={() => setActiveModal(null)}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="nr-modal-body">
          {statusMsg && (
            <div className="nr-status-toast">
              <CheckCircle2 size={15} />
              <span>{statusMsg}</span>
            </div>
          )}

          <div className="nr-config-grid">
            <div className="nr-config-col">
              <form className="nr-form-card" onSubmit={handleSave}>
                <h4>Save Current Workspace</h4>
                <div className="nr-field-row">
                  <label>Topology Name</label>
                  <input
                    type="text"
                    className="nr-input"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    required
                  />
                </div>
                <div className="nr-btn-row">
                  <button
                    type="submit"
                    className="nr-top-action-btn nr-btn-primary"
                  >
                    <Save size={14} />
                    <span>Save to Browser</span>
                  </button>
                  <button
                    type="button"
                    className="nr-btn-secondary"
                    onClick={handleExportDownload}
                  >
                    <Download size={14} />
                    <span>Download .json</span>
                  </button>
                </div>
              </form>

              <div className="nr-form-card">
                <h4>Saved Browser Topologies ({savedList.length})</h4>
                {savedList.length === 0 ? (
                  <p className="nr-empty-cell">
                    No topologies saved in local storage yet.
                  </p>
                ) : (
                  <div className="nr-port-list">
                    {savedList.map((item) => (
                      <div key={item.id} className="nr-port-item">
                        <div>
                          <div className="nr-port-name">{item.name}</div>
                          <div className="nr-port-mac">
                            {item.devices?.length || 0} devices •{' '}
                            {item.links?.length || 0} cables
                          </div>
                        </div>
                        <button
                          type="button"
                          className="nr-btn-secondary"
                          onClick={() => {
                            loadSavedTopology(item);
                            setActiveModal(null);
                          }}
                        >
                          Load
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="nr-config-col">
              <form className="nr-form-card" onSubmit={handleImportText}>
                <h4>Import Topology JSON</h4>
                <div className="nr-field-row">
                  <label>Paste .netrunner.json Content</label>
                  <textarea
                    rows={8}
                    className="nr-input nr-mono"
                    placeholder='{"devices": [...], "links": [...]}'
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className="nr-top-action-btn nr-btn-primary"
                >
                  <Upload size={14} />
                  <span>Import JSON Topology</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
