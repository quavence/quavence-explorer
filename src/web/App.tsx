import React, { useEffect, useState } from 'react';
import { fetchJson } from './utils/fetchJson';
import DashboardView from './views/DashboardView';
import BlocksListView from './views/BlocksListView';
import BlockDetailView from './views/BlockDetailView';
import TxDetailView from './views/TxDetailView';
import AddressDetailView from './views/AddressDetailView';
import RichListView from './views/RichListView';
import MovementsView from './views/MovementsView';
import NodesView from './views/NodesView';
import AttestationsView from './views/AttestationsView';
import GlyphsView from './views/GlyphsView';
import GlyphDetailView from './views/GlyphDetailView';
import FooterSocialLinks from './components/FooterSocialLinks';
import brandLogo from './icon-192.png';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('ErrorBoundary caught an unhandled rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          maxWidth: '600px',
          margin: '6rem auto',
          backgroundColor: '#161a22',
          border: '1px solid #7f1d1d',
          borderRadius: '6px',
          color: '#f87171',
          fontFamily: 'sans-serif'
        }}>
          <h2 style={{ marginBottom: '1rem', color: '#fca5a5' }}>Explorer UI Error</h2>
          <p style={{ marginBottom: '1rem', color: '#94a3b8', fontSize: '0.9rem' }}>
            An unexpected error occurred in the user interface rendering layer.
          </p>
          <pre style={{
            backgroundColor: '#0d0f12',
            padding: '1rem',
            borderRadius: '4px',
            overflowX: 'auto',
            fontSize: '0.8rem',
            color: '#fca5a5',
            border: '1px solid #202734',
            fontFamily: 'monospace'
          }}>
            {this.state.error?.toString() || 'Unknown React error'}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1.5rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '4px',
              color: '#f1f5f9',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Retry / Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainAppContent />
    </ErrorBoundary>
  );
}

function MainAppContent() {
  const [path, setPath] = useState(window.location.pathname);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Global hotkey: '/' or 'Cmd+K' / 'Ctrl+K' focuses the search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === '/' && document.activeElement !== searchInputRef.current && !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)) ||
          ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navigate = (to: string) => {
    window.history.pushState({}, '', to);
    setPath(to);
    setSearchError('');
    setIsMobileMenuOpen(false);
  };

  const handleNavigate = (to: string) => {
    navigate(to);
    setIsMobileMenuOpen(false);
  };

  const sanitizeSearchQuery = (raw: string): string => {
    let clean = raw.trim();
    // Strip surrounding quotes and backticks (single, double, curly, backticks)
    clean = clean.replace(/^['"`«»“”‘’]+|['"`«»“”‘’]+$/g, '').trim();

    // Check full URLs or path fragments
    const txMatch = clean.match(/(?:^|\/)(?:tx|transaction)\/([0-9a-fA-F]{64})/i);
    if (txMatch) return txMatch[1];

    const blockMatch = clean.match(/(?:^|\/)block\/([0-9a-fA-F]{64}|\d+)/i);
    if (blockMatch) return blockMatch[1];

    const addrMatch = clean.match(/(?:^|\/)address\/([Ss][1-9A-HJ-NP-Za-km-z]{25,40})/i);
    if (addrMatch) return addrMatch[1];

    const glyphMatch = clean.match(/(?:^|\/)glyphs?\/([a-zA-Z0-9_-]+)/i);
    if (glyphMatch) return `glyph:${glyphMatch[1]}`;

    // Strip labels like tx:, txid:, block:, address:, addr:
    clean = clean.replace(/^(?:tx|txid|transaction|block|address|addr):\s*/i, '').trim();

    // Strip 0x if followed by 64 hex chars
    if (/^0x([0-9a-fA-F]{64})$/i.test(clean)) {
      clean = clean.slice(2);
    }

    return clean;
  };

  const handleSearch = async (e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
    }
    const cleanQuery = sanitizeSearchQuery(searchQuery);
    if (!cleanQuery) return;
    setSearchError('');

    if (/^(?:glyph[:\s#]+|#)(\d+)$/i.test(cleanQuery)) {
      const match = cleanQuery.match(/^(?:glyph[:\s#]+|#)(\d+)$/i);
      if (match) {
        navigate(`/glyphs/${match[1]}`);
        setSearchQuery('');
        return;
      }
    }

    if (cleanQuery.startsWith('glyph:')) {
      const gid = cleanQuery.slice(6);
      navigate(`/glyphs/${gid}`);
      setSearchQuery('');
      return;
    }

    const query = cleanQuery.replace(/^#+/, '').trim();

    if (/^\d+$/.test(query)) {
      navigate(`/block/${query}`);
      setSearchQuery('');
      return;
    }

    if (/^7[1-9A-HJ-NP-Za-km-z]+$/.test(query)) {
      setSearchError('Private keys are not searchable. Enter a public address, block, or transaction.');
      return;
    }

    if (/^[Ss][1-9A-HJ-NP-Za-km-z]{25,40}$/.test(query)) {
      navigate(`/address/${query}`);
      setSearchQuery('');
      return;
    }

    if (/^[0-9a-fA-F]{64}$/.test(query)) {
      try {
        const data = await fetchJson<any>(`/api/search?q=${encodeURIComponent(query)}`, null);
        if (data && (data.type === 'block' || data.type === 'tx' || data.type === 'glyph')) {
          navigate(data.type === 'glyph' ? `/glyphs/${data.value}` : `/${data.type}/${data.value}`);
          setSearchQuery('');
          return;
        }
      } catch (err) {
        // Fall back to direct navigation below
      }

      // If search API returns not_found or network failed, fallback to direct route:
      // PoS/PoW block hashes typically have leading zeros (e.g. 00000...), txids do not.
      if (query.startsWith('00000')) {
        navigate(`/block/${query}`);
      } else {
        navigate(`/tx/${query}`);
      }
      setSearchQuery('');
      return;
    }

    setSearchError('No result found for search query: "' + query + '"');
  };

  const renderContent = () => {
    if (path === '/' || path === '') return <DashboardView navigate={navigate} />;
    if (path === '/blocks') return <BlocksListView navigate={navigate} />;
    if (path === '/attestations') return <AttestationsView navigate={navigate} />;
    if (path === '/glyphs') return <GlyphsView navigate={navigate} />;
    if (path === '/richlist') return <RichListView navigate={navigate} />;
    if (path === '/movements') return <MovementsView navigate={navigate} />;
    if (path === '/nodes') return <NodesView />;

    const glyphMatch = path.match(/^\/glyphs?\/([a-zA-F0-9_-]+)$/);
    if (glyphMatch) return <GlyphDetailView idOrEdition={glyphMatch[1]} navigate={navigate} />;

    const blockMatch = path.match(/^\/block\/([a-zA-F0-9]+)$/);
    if (blockMatch) return <BlockDetailView heightOrHash={blockMatch[1]} navigate={navigate} />;

    const txMatch = path.match(/^\/tx\/([a-zA-F0-9]+)$/);
    if (txMatch) return <TxDetailView txid={txMatch[1]} navigate={navigate} />;

    const addressMatch = path.match(/^\/address\/([^/?#]+)$/);
    if (addressMatch) return <AddressDetailView address={decodeURIComponent(addressMatch[1])} navigate={navigate} />;

    return (
      <div className="no-results-box">
        <h2>404 - Page Not Found</h2>
        <p style={{ marginTop: '1rem' }}><a href="#" onClick={(e) => { e.preventDefault(); navigate('/'); }}>Back to Dashboard</a></p>
      </div>
    );
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-brand">
          <a href="#" onClick={(e) => { e.preventDefault(); navigate('/'); }} className="brand-title">
            <img src={brandLogo} alt="" className="brand-logo" width={24} height={24} />
            <span className="brand-name">QUAVENCE</span>
          </a>

          <button
            className="mobile-menu-button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={isMobileMenuOpen}
          >
            <span className="hamburger-icon"></span>
          </button>
        </div>

        <nav className="desktop-nav">
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/'); }} className={path === '/' ? 'nav-link active' : 'nav-link'}>Overview</a>
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/blocks'); }} className={path === '/blocks' ? 'nav-link active' : 'nav-link'}>Blocks</a>
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/attestations'); }} className={path === '/attestations' ? 'nav-link active' : 'nav-link'}>Attestations</a>
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/glyphs'); }} className={path === '/glyphs' || path.startsWith('/glyph/') ? 'nav-link active' : 'nav-link'}>Glyphs</a>
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/richlist'); }} className={path === '/richlist' ? 'nav-link active' : 'nav-link'}>Top 100</a>
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/movements'); }} className={path === '/movements' ? 'nav-link active' : 'nav-link'}>Movements</a>
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/nodes'); }} className={path === '/nodes' ? 'nav-link active' : 'nav-link'}>Nodes</a>
        </nav>

        <div className="search-container">
          <form onSubmit={handleSearch} className="search-form">
            <svg
              className="search-lead-icon"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              onClick={() => handleSearch()}
              style={{ cursor: 'pointer' }}
              title="Search"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search height, hash, txid, or address..."
              className="search-input"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (searchError) setSearchError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch(e);
                }
              }}
            />
            <button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1}>Search</button>
            <div className="search-shortcut-badge">/</div>
          </form>
        </div>
      </header>

      <div className="mobile-search-row">
        <div className="search-container">
          <form onSubmit={handleSearch} className="search-form">
            <svg
              className="search-lead-icon"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              onClick={() => handleSearch()}
              style={{ cursor: 'pointer' }}
              title="Search"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search height, hash, txid, or address..."
              className="search-input"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (searchError) setSearchError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch(e);
                }
              }}
            />
            <button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1}>Search</button>
            {searchQuery ? (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => {
                  setSearchQuery('');
                  setSearchError('');
                }}
                aria-label="Clear search"
              >
                ×
              </button>
            ) : null}
          </form>
        </div>
      </div>

      {isMobileMenuOpen && (
        <nav className="mobile-nav">
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/'); }} className={path === '/' ? 'nav-link active' : 'nav-link'}>Overview</a>
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/blocks'); }} className={path === '/blocks' ? 'nav-link active' : 'nav-link'}>Blocks</a>
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/attestations'); }} className={path === '/attestations' ? 'nav-link active' : 'nav-link'}>Attestations</a>
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/glyphs'); }} className={path === '/glyphs' || path.startsWith('/glyph/') ? 'nav-link active' : 'nav-link'}>Glyphs</a>
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/richlist'); }} className={path === '/richlist' ? 'nav-link active' : 'nav-link'}>Top 100</a>
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/movements'); }} className={path === '/movements' ? 'nav-link active' : 'nav-link'}>Movements</a>
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/nodes'); }} className={path === '/nodes' ? 'nav-link active' : 'nav-link'}>Nodes</a>
        </nav>
      )}

      <main className="main-content">
        {searchError && (
          <div className="error-box" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{searchError}</span>
            <button
              onClick={() => setSearchError('')}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold', marginLeft: 'auto' }}
            >
              x
            </button>
          </div>
        )}
        {renderContent()}
      </main>

      <footer className="footer">
        <div className="footer-content">
          <div className="footer-meta">
            <span>Quavence Explorer · PoS + PoUS Telemetry Terminal</span>
          </div>
          <FooterSocialLinks />
        </div>
      </footer>
    </div>
  );
}

