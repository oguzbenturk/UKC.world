const BootSplash = () => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#ffffff',
    }}
  >
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        border: '3px solid #e2e8f0',
        borderTopColor: '#0ea5e9',
        animation: 'plannivo-boot-spin 0.9s linear infinite',
      }}
    />
    <style>{`@keyframes plannivo-boot-spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

export default BootSplash;
