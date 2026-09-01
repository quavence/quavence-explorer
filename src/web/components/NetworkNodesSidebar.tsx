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

interface NodeEntry {
  addnode: string;
  label: string;
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function NodeList({
  nodes,
  keyPrefix,
  copiedKey,
  onCopy,
}: {
  nodes: NodeEntry[];
  keyPrefix: string;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  if (nodes.length === 0) {
    return null;
  }

  return (
    <div className="nodes-list">
      {nodes.map((node, idx) => {
        const k = `${keyPrefix}-${idx}`;
        const isCopied = copiedKey === k;
        return (
          <div className="node-item" key={k}>
            <div className="node-top">
              <code className="node-addnode mono">{node.addnode}</code>
              <button
                type="button"
                className={`node-copy-btn ${isCopied ? 'copied' : ''}`}
                onClick={() => onCopy(node.addnode, k)}
                aria-label={isCopied ? 'Copied' : 'Copy addnode'}
                title={isCopied ? 'Copied' : 'Copy addnode'}
              >
                {isCopied ? (
                  <>
                    <CheckIcon /> <span>Copied</span>
                  </>
                ) : (
                  <>
                    <CopyIcon /> <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <div className="node-label">{node.label}</div>
          </div>
        );
      })}
    </div>
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
    <div className="nodes-page">
      <div className="panel nodes-page-intro">
        <div className="panel-header panel-header-stacked">
          <div className="panel-heading-main">
            <h3 className="panel-title">Network Nodes</h3>
            <p className="panel-description">
              Official anchor nodes and verified public peers. Copy addnode lines into your quavenced.conf.
            </p>
          </div>
        </div>
      </div>

      <div className="nodes-page-grid">
        <div className="panel nodes-column-panel">
          <div className="panel-header">
            <h3 className="panel-title">Official Anchor Nodes</h3>
          </div>
          <div className="panel-body">
            {anchors.length === 0 ? (
              <div className="nodes-empty-text">No official anchor nodes configured</div>
            ) : (
              <NodeList
                nodes={anchors}
                keyPrefix="anchor"
                copiedKey={copiedKey}
                onCopy={handleCopy}
              />
            )}
          </div>
        </div>

        <div className="panel nodes-column-panel">
          <div className="panel-header">
            <h3 className="panel-title">Verified Public Peers</h3>
          </div>
          <div className="panel-body">
            {verified.length === 0 ? (
              <div className="nodes-empty-text">No verified public peers yet</div>
            ) : (
              <>
                <NodeList
                  nodes={verified}
                  keyPrefix="verified"
                  copiedKey={copiedKey}
                  onCopy={handleCopy}
                />
                <div className="nodes-status-hint">Verified by network checks</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
