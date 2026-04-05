import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_PREF_KEY = 'ukc_biometric_enabled';

export async function getBiometricPref(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(BIOMETRIC_PREF_KEY);
  return val === 'true';
}

export async function setBiometricPref(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_PREF_KEY, enabled ? 'true' : 'false');
}

export async function isBiometricAvailable(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return compatible && enrolled;
}

export async function getBiometricType(): Promise<string> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return 'faceid';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'touchid';
  }
  return 'biometric';
}

export async function authenticateWithBiometrics(promptMessage = 'Sign in to UKC World'): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Use password',
      fallbackLabel: 'Use password',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
