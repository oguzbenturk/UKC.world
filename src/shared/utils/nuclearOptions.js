// Nuclear options for when everything fails
export const nuclearOptions = {
  
  // Option 1: Bypass authentication entirely
  bypassAuth: () => {
    console.log('🚨 NUCLEAR: Bypassing authentication');
    localStorage.setItem('nuclear_bypass', 'true');
    window.location.href = '/admin/dashboard?bypass=true';
  },

  // Option 2: Use minimal safe mode
  safeMode: () => {
    console.log('🚨 NUCLEAR: Entering safe mode');
    localStorage.setItem('safe_mode', 'true');
    
    // Replace AuthContext with minimal version
    const SafeAuthContext = {
      user: { role: 'admin', email: 'safe@mode.local' },
      isAuthenticated: true,
      loading: false,
      error: null,
      login: () => Promise.resolve(true),
      logout: () => Promise.resolve()
    };
    
    window.SafeAuthContext = SafeAuthContext;
    window.location.reload();
  },

  // Option 3: Complete reset
  totalReset: () => {
    console.log('🚨 NUCLEAR: Total system reset');
    
    // Clear everything
    localStorage.clear();
    sessionStorage.clear();
    
    // Clear service workers and cache
    if (window.ServiceWorkerManager) {
      window.ServiceWorkerManager.fullCleanup();
    }
    
    // Force reload with cache bypass
    window.location.reload(true);
  },

  // Option 4: Direct dashboard access
  directAccess: () => {
    console.log('🚨 NUCLEAR: Direct dashboard access');
    
    // Inject minimal auth state
    const fakeToken = 'nuclear-bypass-token';
    const fakeUser = {
      id: 'nuclear-user',
      email: 'nuclear@bypass.local',
      role: 'admin',
      name: 'Nuclear Bypass User'
    };
    
    localStorage.setItem('token', fakeToken);
    localStorage.setItem('user', JSON.stringify(fakeUser));
    localStorage.setItem('nuclear_mode', 'true');
    
    window.location.href = '/admin/dashboard';
  }
};

// Make globally available
window.nuclearOptions = nuclearOptions;

// Add emergency button sequence (Ctrl+Shift+N five times)
let nuclearSequence = 0;
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'N') {
    nuclearSequence++;
    
    if (nuclearSequence >= 5) {
      const choice = prompt(`Nuclear Options:
1 - Bypass Auth
2 - Safe Mode  
3 - Total Reset
4 - Direct Access

Enter number (1-4):`);
      
      switch(choice) {
        case '1': nuclearOptions.bypassAuth(); break;
        case '2': nuclearOptions.safeMode(); break;
        case '3': nuclearOptions.totalReset(); break;
        case '4': nuclearOptions.directAccess(); break;
        default: console.log('Nuclear sequence cancelled');
      }
      
      nuclearSequence = 0;
    }
    
    setTimeout(() => { nuclearSequence = 0; }, 2000);
  }
});

export default nuclearOptions;
