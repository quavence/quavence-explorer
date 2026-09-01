import React from 'react';

interface LoadingStateProps {
  message?: string;
  minHeight?: string | number;
}

export default function LoadingState({
  message = 'Loading data...',
  minHeight,
}: LoadingStateProps) {
  return (
    <div className="loading-box" style={minHeight ? { minHeight } : undefined}>
      <div className="spinner" />
      <p className="loading-text">{message}</p>
    </div>
  );
}
