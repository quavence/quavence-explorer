import React, { useEffect, useState } from 'react';
import { fetchJson } from './utils/fetchJson';
import DashboardView from './views/DashboardView';
import BlocksListView from './views/BlocksListView';
import BlockDetailView from './views/BlockDetailView';
import TxDetailView from './views/TxDetailView';
import AddressDetailView from './views/AddressDetailView';
import RichListView from './views/RichListView';
import MovementsView from './views/MovementsView';

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

  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

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
        if (data && (data.type === 'block' || data.type === 'tx')) {
          navigate(`/${data.type}/${data.value}`);
          setSearchQuery('');
        } else {
          setSearchError('No transaction or block hash found for: ' + query);
        }
      } catch (err) {
        setSearchError('Search query failed.');
      }
      return;
    }

    setSearchError('No result found for search query: "' + query + '"');
  };

  const renderContent = () => {
    if (path === '/' || path === '') return <DashboardView navigate={navigate} />;
    if (path === '/blocks') return <BlocksListView navigate={navigate} />;
    if (path === '/richlist') return <RichListView navigate={navigate} />;
    if (path === '/movements') return <MovementsView navigate={navigate} />;

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
            QUAVENCE EXPLORER
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
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/richlist'); }} className={path === '/richlist' ? 'nav-link active' : 'nav-link'}>Top 100</a>
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/movements'); }} className={path === '/movements' ? 'nav-link active' : 'nav-link'}>Movements</a>
        </nav>

        <div className="search-container">
          <form onSubmit={handleSearch}>
            <input
              type="text"
              placeholder="Search by block height, hash, txid, or address..."
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" className="search-icon-btn">
              Search
            </button>
          </form>
        </div>
      </header>

      <div className="mobile-search-row">
        <div className="search-container">
          <form onSubmit={handleSearch}>
            <input
              type="text"
              placeholder="Search by block height, hash, txid, or address..."
              className="search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button type="submit" className="search-icon-btn">
              Search
            </button>
          </form>
        </div>
      </div>

      {isMobileMenuOpen && (
        <nav className="mobile-nav">
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/'); }} className={path === '/' ? 'nav-link active' : 'nav-link'}>Overview</a>
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/blocks'); }} className={path === '/blocks' ? 'nav-link active' : 'nav-link'}>Blocks</a>
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/richlist'); }} className={path === '/richlist' ? 'nav-link active' : 'nav-link'}>Top 100</a>
          <a href="#" onClick={(e) => { e.preventDefault(); handleNavigate('/movements'); }} className={path === '/movements' ? 'nav-link active' : 'nav-link'}>Movements</a>
        </nav>
      )}

      <main className="main-content">
        {searchError && (
          <div className="error-box" style={{ display: 'flex', justifyContent: 'between', alignItems: 'center' }}>
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
        <div>Quavence Explorer · Read-only network data</div>
      </footer>
    </div>
  );
}
