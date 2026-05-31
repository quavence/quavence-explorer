import React, { useState, useEffect } from 'react';

interface AnchorNode {
  host: string;
  port: number;
  addnode: string;
  label: string;
}

interface VerifiedPeer {
  host: string;
  port: number;
  addnode: string;
  label: string;
  lastSeenAt: number;
  verifiedSince: number | null;
}

interface NodesResponse {
  officialAnchors: AnchorNode[];
  verifiedPeers: VerifiedPeer[];
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="9" y="9" width="10" height="10" rx="1.5" />
      <path d="M5 15V5h10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export default function NetworkNodesSidebar() {
  const [nodes, setNodes] = useState<NodesResponse | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      fetch('/api/network/nodes')
        .then(res => res.json())
        .then(data => {
          if (active) setNodes(data);
        })
        .catch(() => {
          if (active) setNodes({ officialAnchors: [], verifiedPeers: [] });
        });
    };
    load();
    const interval = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    }
  };

  const anchors = nodes?.officialAnchors ?? [];
  const verified = nodes?.verifiedPeers ?? [];

  return (
    <div className="nodes-sidebar">
      <div className="nodes-sidebar-header">
        <h3 className="nodes-sidebar-title">Network Nodes</h3>
      </div>

      <div className="nodes-sidebar-section">
        <div className="nodes-section-label">Official Anchor Nodes</div>
        {anchors.length === 0 ? (
          <div className="nodes-empty-text">No official anchor nodes configured</div>
        ) : (
          <div className="nodes-list">
            {anchors.map((node, idx) => {
              const k = `anchor-${idx}`;
              return (
                <div className="node-item" key={k}>
                  <div className="node-top">
                    <code className="node-addnode mono">{node.addnode}</code>
                    <button
                      className={`node-copy-btn ${copiedKey === k ? 'copied' : ''}`}
                      onClick={() => handleCopy(node.addnode, k)}
                      aria-label={copiedKey === k ? 'Copied' : 'Copy addnode'}
                      title={copiedKey === k ? 'Copied' : 'Copy'}
                    >
                      {copiedKey === k ? <CheckIcon /> : <CopyIcon />}
                    </button>
                  </div>
                  <div className="node-label">{node.label}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="nodes-sidebar-section">
        <div className="nodes-section-label">Verified Public Peers</div>
        {verified.length === 0 ? (
          <div className="nodes-empty-text">No verified public peers yet</div>
        ) : (
          <>
            <div className="nodes-list">
              {verified.map((node, idx) => {
                const k = `verified-${idx}`;
                return (
                  <div className="node-item" key={k}>
                    <div className="node-top">
                      <code className="node-addnode mono">{node.addnode}</code>
                      <button
                        className={`node-copy-btn ${copiedKey === k ? 'copied' : ''}`}
                        onClick={() => handleCopy(node.addnode, k)}
                        aria-label={copiedKey === k ? 'Copied' : 'Copy addnode'}
                        title={copiedKey === k ? 'Copied' : 'Copy'}
                      >
                        {copiedKey === k ? <CheckIcon /> : <CopyIcon />}
                      </button>
                    </div>
                    <div className="node-label">{node.label}</div>
                  </div>
                );
              })}
            </div>
            <div className="nodes-status-hint">Verified by network checks</div>
          </>
        )}
      </div>
    </div>
  );
}
