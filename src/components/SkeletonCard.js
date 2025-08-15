import React from 'react';

const shimmer = {
  animation: 'skeleton-shimmer 1.2s linear infinite',
  background: 'linear-gradient(90deg, #f3f3f3 25%, #ececec 37%, #f3f3f3 63%)',
  backgroundSize: '400% 100%',
};

const SkeletonCard = () => (
  <div style={{
    position: 'absolute',
    width: '90%',
    height: '75vh',
    maxHeight: 600,
    background: '#fff',
    borderRadius: 24,
    boxShadow: '0 8px 32px #ff408122',
    left: 0,
    right: 0,
    margin: 'auto',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    overflowX: 'hidden',
    overscrollBehaviorY: 'contain',
    WebkitOverscrollBehaviorY: 'contain',
    touchAction: 'auto',
  }}>
    {/* Profile details at the top */}
    <div style={{ padding: '24px 24px 12px 24px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Avatar */}
      <div style={{ width: 110, height: 110, borderRadius: '50%', marginBottom: 12, ...shimmer }} />
      {/* Name */}
      <div style={{ width: 120, height: 28, borderRadius: 8, margin: '8px 0 2px 0', ...shimmer }} />
      {/* Pronouns */}
      <div style={{ width: 60, height: 15, borderRadius: 6, marginBottom: 2, ...shimmer }} />
      {/* College/Dept/Year */}
      <div style={{ width: 180, height: 18, borderRadius: 7, marginBottom: 4, ...shimmer }} />
      {/* About */}
      <div style={{ width: 220, height: 18, borderRadius: 7, marginBottom: 8, ...shimmer }} />
      {/* Interests */}
      <div style={{ width: 160, height: 16, borderRadius: 7, marginBottom: 8, ...shimmer }} />
    </div>
    {/* Gallery Images Section */}
    <div style={{ width: '100%', padding: '0 18px 0 18px', marginBottom: 8, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ width: '100%', height: 80, borderRadius: 12, ...shimmer }} />
        <div style={{ width: '100%', height: 80, borderRadius: 12, ...shimmer }} />
      </div>
    </div>
    {/* Buttons */}
    <div style={{ display: 'flex', justifyContent: 'space-around', width: '100%', marginTop: 'auto', padding: 16, background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)', borderTop: '1px solid #eee', position: 'sticky', bottom: 0, flexShrink: 0 }}>
      <div style={{ width: 48, height: 32, borderRadius: 16, ...shimmer }} />
      <div style={{ width: 48, height: 32, borderRadius: 16, ...shimmer }} />
    </div>
    {/* Keyframes for shimmer */}
    <style>{`
      @keyframes skeleton-shimmer {
        0% { background-position: -400px 0; }
        100% { background-position: 400px 0; }
      }
    `}</style>
  </div>
);

export default SkeletonCard; 