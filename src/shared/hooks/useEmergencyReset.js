// Emergency reset hook for stuck loading states
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { DataContext } from '../contexts/DataContext';

export const useEmergencyReset = () => {
  const auth = useContext(AuthContext);
  const data = useContext(DataContext);

  const forceReset = () => {
    console.log('🚨 EMERGENCY RESET: Forcing all loading states to false');
    
    // Force reset auth loading
    if (auth && typeof auth.setLoading === 'function') {
      auth.setLoading(false);
    }
    
    // Force reset data loading
    if (data && typeof data.setLoading === 'function') {
      data.setLoading(false);
    }
    
    // Clear any stuck API calls
    if (window.apiCallManager) {
      window.apiCallManager.clearAll();
    }
    
    // Dispatch a global reset event
    window.dispatchEvent(new CustomEvent('forceLoadingReset'));
    
    console.log('✅ Emergency reset completed');
  };

  return { forceReset };
};
