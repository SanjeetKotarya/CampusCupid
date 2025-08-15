import React from 'react';

const LoadingSpinner = ({ size = 40, color = '#ff4081', text = 'Loading...', fullScreen = false }) => {
  const spinnerStyle = {
    width: size,
    height: size,
    border: `4px solid #ffe0ec`,
    borderTop: `4px solid ${color}`,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  };

  const containerStyle = fullScreen ? {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.95)',
    zIndex: 9999,
  } : {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
  };

  return (
    <div style={containerStyle}>
      <div style={spinnerStyle} />
      {text && (
        <div style={{ 
          marginTop: 16, 
          color: '#888', 
          fontSize: 16, 
          fontWeight: 500,
          textAlign: 'center'
        }}>
          {text}
        </div>
      )}
    </div>
  );
};

export default LoadingSpinner; 