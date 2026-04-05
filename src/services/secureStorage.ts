import * as SecureStore from 'expo-secure-store';

const AUTH_TOKEN_KEY = 'ukc_auth_token';
const BIOMETRIC_PREF_KEY = 'ukc_biometric_enabled';
const DEFERRED_LINK_KEY = 'ukc_deferred_link';

export async function saveAuthToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  });
}

export async function getAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(AUTH_TOKEN_KEY);
}

export async function clearAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
}

export async function saveBiometricPref(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_PREF_KEY, enabled ? '1' : '0');
}

export async function getBiometricPref(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(BIOMETRIC_PREF_KEY);
  return val === '1';
}

export async function saveDeferredLink(url: string): Promise<void> {
  await SecureStore.setItemAsync(DEFERRED_LINK_KEY, url);
}

export async function getDeferredLink(): Promise<string | null> {
  return SecureStore.getItemAsync(DEFERRED_LINK_KEY);
}

export async function clearDeferredLink(): Promise<void> {
  await SecureStore.deleteItemAsync(DEFERRED_LINK_KEY);
}
