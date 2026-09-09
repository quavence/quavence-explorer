import React, { useState, useEffect } from 'react';

interface AnchorNode {
  host: string;
  port: number;
  addnode: string;
  label: string;
  networkType?: 'onion' | 'ipv4' | 'ipv6';
}

interface VerifiedPeer {
  host: string;
  port: number;
  addnode: string;
  label: string;
  networkType?: 'onion' | 'ipv4' | 'ipv6';
  lastSeenAt: number;
  verifiedSince: number | null;
}

interface NodesResponse {
  officialAnchors: AnchorNode[];
  verifiedPeers: VerifiedPeer[];
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: 13, height: 13 }}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: 13, height: 13 }}>
      <polyline points="20 6 9 17 4 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function OnionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: 12, height: 12, flexShrink: 0 }}>
      <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ width: 12, height: 12, flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="2" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default function NodesView() {
  const [nodes, setNodes] = useState<NodesResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'anchors' | 'verified'>('anchors');
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

  const copyCurrentAll = () => {
    const list = activeTab === 'anchors' ? anchors : verified;
    if (list.length === 0) return;
    const text = list.map(item => item.addnode).join('\n');
    handleCopy(text, 'copy-all');
  };

  return (
    <div className="panel">
      <div className="panel-header panel-header-stacked">
        <div className="panel-heading-row">
          <div className="panel-heading-main">
            <h3 className="panel-title">Network Nodes</h3>
            <p className="panel-description">
              Dual-Stack official anchor seednodes (Tor v3 Hidden Services &amp; Clearnet IPv4) and verified public peers.
            </p>
          </div>
          <div className="panel-heading-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <div className="nodes-tab-group">
              <button
                type="button"
                className={`nodes-tab-btn ${activeTab === 'anchors' ? 'active' : ''}`}
                onClick={() => setActiveTab('anchors')}
              >
                Official Anchors
                <span className="nodes-tab-badge">{anchors.length}</span>
              </button>
              <button
                type="button"
                className={`nodes-tab-btn ${activeTab === 'verified' ? 'active' : ''}`}
                onClick={() => setActiveTab('verified')}
              >
                Verified Peers
                <span className="nodes-tab-badge">{verified.length}</span>
              </button>
            </div>

            {((activeTab === 'anchors' && anchors.length > 0) || (activeTab === 'verified' && verified.length > 0)) && (
              <button
                type="button"
                className={`node-copy-btn ${copiedKey === 'copy-all' ? 'copied' : ''}`}
                onClick={copyCurrentAll}
                title="Copy all shown addnode directives to clipboard"
              >
                {copiedKey === 'copy-all' ? (
                  <>
                    <CheckIcon /> <span>All Copied</span>
                  </>
                ) : (
                  <>
                    <CopyIcon /> <span>Copy All</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="table-responsive sticky-headers">
        <table className="dense-table">
          <thead>
            <tr>
              <th style={{ width: '150px' }}>Network</th>
              <th>Addnode Directive</th>
              <th style={{ width: '320px' }}>Role / Label</th>
              <th style={{ width: '100px', textAlign: 'right', paddingRight: '1.25rem' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {activeTab === 'anchors' && anchors.length === 0 && (
              <tr>
                <td colSpan={4} className="nodes-table-empty">
                  No official anchor nodes configured in explorer environment.
                </td>
              </tr>
            )}

            {activeTab === 'anchors' && anchors.map((node, idx) => {
              const k = `anchor-${idx}`;
              const isCopied = copiedKey === k;
              const isOnion = (node.networkType === 'onion') || node.host.endsWith('.onion');

              return (
                <tr key={k}>
                  <td>
                    <span className={`node-badge-pill ${isOnion ? 'onion' : 'ipv4'}`}>
                      {isOnion ? (
                        <>
                          <OnionIcon /> <span>Tor v3</span>
                        </>
                      ) : (
                        <>
                          <GlobeIcon /> <span>IPv4</span>
                        </>
                      )}
                    </span>
                  </td>
                  <td>
                    <code className="node-table-code mono" title="Click to copy" onClick={() => handleCopy(node.addnode, k)}>
                      {node.addnode}
                    </code>
                  </td>
                  <td style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>
                    {node.label}
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: '1.25rem' }}>
                    <button
                      type="button"
                      className={`node-copy-btn ${isCopied ? 'copied' : ''}`}
                      onClick={() => handleCopy(node.addnode, k)}
                      title="Copy addnode directive"
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
                  </td>
                </tr>
              );
            })}

            {activeTab === 'verified' && verified.length === 0 && (
              <tr>
                <td colSpan={4} className="nodes-table-empty">
                  No verified public peers observed yet. Public reachable nodes appear here after automated consensus checks.
                </td>
              </tr>
            )}

            {activeTab === 'verified' && verified.map((peer, idx) => {
              const k = `verified-${idx}`;
              const isCopied = copiedKey === k;
              const isOnion = (peer.networkType === 'onion') || peer.host.endsWith('.onion');

              return (
                <tr key={k}>
                  <td>
                    <span className={`node-badge-pill ${isOnion ? 'onion' : 'ipv4'}`}>
                      {isOnion ? (
                        <>
                          <OnionIcon /> <span>Tor v3</span>
                        </>
                      ) : (
                        <>
                          <GlobeIcon /> <span>IPv4</span>
                        </>
                      )}
                    </span>
                  </td>
                  <td>
                    <code className="node-table-code mono" title="Click to copy" onClick={() => handleCopy(peer.addnode, k)}>
                      {peer.addnode}
                    </code>
                  </td>
                  <td style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                    {peer.label || 'Verified Public Peer'}
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: '1.25rem' }}>
                    <button
                      type="button"
                      className={`node-copy-btn ${isCopied ? 'copied' : ''}`}
                      onClick={() => handleCopy(peer.addnode, k)}
                      title="Copy addnode directive"
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="nodes-table-footer">
        <span style={{ color: '#38bdf8', fontWeight: 600 }}>Quick Setup:</span> Paste <code className="mono inline-code">addnode=&lt;host:port&gt;</code> into your <code className="mono inline-code">quavence.conf</code> (or run daemon with <code className="mono inline-code">-addnode=&lt;address&gt;</code>) to connect instantly to the network mesh.
      </div>
    </div>
  );
}
