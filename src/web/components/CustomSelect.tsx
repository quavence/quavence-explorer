import React, { useEffect, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  badge?: string;
}

export interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  labelPrefix?: string;
  minWidth?: string | number;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  labelPrefix,
  minWidth = '140px',
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        userSelect: 'none',
      }}
    >
      {labelPrefix && (
        <span style={{ fontSize: '0.74rem', color: 'var(--text-dim, #94a3b8)', letterSpacing: '0.02em', fontWeight: 500 }}>
          {labelPrefix}
        </span>
      )}

      {/* Trigger button styled like quavence_app FilterDropdown */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: isOpen ? 'rgba(15, 23, 42, 0.9)' : 'rgba(15, 23, 42, 0.65)',
          border: isOpen ? '1px solid rgba(56, 189, 248, 0.6)' : '1px solid rgba(51, 65, 85, 0.65)',
          borderRadius: 6,
          padding: '0.3rem 0.65rem',
          color: '#f8fafc',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '0.74rem',
          fontWeight: 500,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.6rem',
          cursor: 'pointer',
          minWidth: minWidth,
          boxShadow: isOpen
            ? '0 0 0 1px rgba(56, 189, 248, 0.3), 0 4px 12px rgba(0, 0, 0, 0.4)'
            : '0 1px 2px rgba(0, 0, 0, 0.2)',
          transition: 'all 0.15s ease',
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', minWidth: 0, overflow: 'hidden' }}>
          {selectedOption?.badge && (
            <span
              style={{
                fontSize: '0.62rem',
                fontWeight: 600,
                color: '#38bdf8',
                background: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                padding: '0.05rem 0.3rem',
                borderRadius: '3px',
                textTransform: 'uppercase',
              }}
            >
              {selectedOption.badge}
            </span>
          )}
          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {selectedOption?.label || value}
          </span>
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: isOpen ? 1 : 0.65,
            color: isOpen ? '#38bdf8' : '#94a3b8',
            flexShrink: 0,
          }}
        >
          <path d="M6 8l4 4 4-4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown menu popup styled like quavence_app DropdownMenuContent */}
      {isOpen && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 5px)',
            right: 0,
            background: 'rgba(15, 23, 42, 0.98)',
            border: '1px solid rgba(51, 65, 85, 0.85)',
            borderRadius: 7,
            padding: '0.28rem',
            minWidth: '100%',
            width: 'max-content',
            zIndex: 150,
            boxShadow: '0 16px 36px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            animation: 'fadeIn 0.12s ease-out',
          }}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <div
                key={option.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.85rem',
                  padding: '0.38rem 0.65rem',
                  borderRadius: 5,
                  fontSize: '0.74rem',
                  fontFamily: 'var(--font-mono, monospace)',
                  color: isSelected ? '#67e8f9' : '#e2e8f0',
                  background: isSelected ? 'rgba(56, 189, 248, 0.14)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background-color 0.12s ease, color 0.12s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'rgba(51, 65, 85, 0.55)';
                    e.currentTarget.style.color = '#ffffff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = '#e2e8f0';
                  }
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  {option.badge && (
                    <span
                      style={{
                        fontSize: '0.62rem',
                        fontWeight: 600,
                        color: '#38bdf8',
                        background: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        padding: '0.05rem 0.3rem',
                        borderRadius: '3px',
                      }}
                    >
                      {option.badge}
                    </span>
                  )}
                  <span>{option.label}</span>
                </span>
                {isSelected && (
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="#38bdf8" style={{ flexShrink: 0 }}>
                    <path d="M4 10l4 4L18 6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

