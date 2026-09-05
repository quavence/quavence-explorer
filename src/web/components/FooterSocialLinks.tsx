import React from 'react';

interface SocialLinkItem {
  id: string;
  name: string;
  url: string;
  tooltip: string;
  glowColor: string;
  hoverBorder: string;
  hoverColor: string;
  icon: React.ReactNode;
}

const SOCIAL_LINKS: SocialLinkItem[] = [
  {
    id: 'hub',
    name: 'Platform Hub',
    url: 'https://quavence.com/',
    tooltip: 'Quavence Platform Hub',
    glowColor: 'rgba(56, 189, 248, 0.25)',
    hoverBorder: 'rgba(56, 189, 248, 0.65)',
    hoverColor: '#38bdf8',
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <path d="M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9z" />
      </svg>
    ),
  },
  {
    id: 'discord',
    name: 'Discord',
    url: 'https://discord.gg/5c8jY9aCa7',
    tooltip: 'Discord Community',
    glowColor: 'rgba(129, 140, 248, 0.25)',
    hoverBorder: 'rgba(129, 140, 248, 0.65)',
    hoverColor: '#a5b4fc',
    icon: (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    ),
  },
  {
    id: 'github',
    name: 'GitHub',
    url: 'https://github.com/quavence',
    tooltip: 'GitHub Organization',
    glowColor: 'rgba(226, 232, 240, 0.2)',
    hoverBorder: 'rgba(226, 232, 240, 0.65)',
    hoverColor: '#ffffff',
    icon: (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
        />
      </svg>
    ),
  },
  {
    id: 'bitcointalk',
    name: 'Bitcointalk',
    url: 'https://bitcointalk.org/index.php?topic=5592414.0',
    tooltip: 'Bitcointalk Official ANN Thread',
    glowColor: 'rgba(251, 191, 36, 0.25)',
    hoverBorder: 'rgba(251, 191, 36, 0.7)',
    hoverColor: '#fbbf24',
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* Modern chat bubble contour */}
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        {/* Stylized 'B' crypto monogram */}
        <path d="M9.5 8.5h3a1.6 1.6 0 0 1 0 3.2H9.5" />
        <path d="M9.5 11.7h3.3a1.6 1.6 0 0 1 0 3.2H9.5" />
        <path d="M10.8 7.2v1.3M12.6 7.2v1.3M10.8 14.9v1.3M12.6 14.9v1.3" />
      </svg>
    ),
  },
  {
    id: 'x',
    name: 'Twitter (X)',
    url: 'https://x.com/QuavenceX',
    tooltip: 'Official X (Twitter)',
    glowColor: 'rgba(203, 213, 225, 0.2)',
    hoverBorder: 'rgba(203, 213, 225, 0.65)',
    hoverColor: '#f8fafc',
    icon: (
      <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: 'telegram',
    name: 'Telegram Wallet Bot',
    url: 'https://t.me/qvnc_wallet_bot?start=ref_f4e353b8',
    tooltip: 'Telegram Wallet Bot (@qvnc_wallet_bot)',
    glowColor: 'rgba(56, 189, 248, 0.25)',
    hoverBorder: 'rgba(56, 189, 248, 0.65)',
    hoverColor: '#38bdf8',
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M22 2L11 13" />
        <path d="M22 2l-7 20-4-9-9-4 20-7z" />
      </svg>
    ),
  },
];

export default function FooterSocialLinks() {
  return (
    <div
      className="footer-social-cluster"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
      }}
      aria-label="Official Links & Socials"
    >
      {SOCIAL_LINKS.map((item) => (
        <a
          key={item.id}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          title={item.tooltip}
          aria-label={item.name}
          className="footer-social-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            borderRadius: '5px',
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(51, 65, 85, 0.65)',
            color: '#94a3b8',
            textDecoration: 'none',
            transition: 'all 0.16s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = item.hoverBorder;
            e.currentTarget.style.color = item.hoverColor;
            e.currentTarget.style.background = 'rgba(30, 41, 59, 0.85)';
            e.currentTarget.style.boxShadow = `0 0 10px ${item.glowColor}`;
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(51, 65, 85, 0.65)';
            e.currentTarget.style.color = '#94a3b8';
            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.65)';
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {item.icon}
        </a>
      ))}
    </div>
  );
}
