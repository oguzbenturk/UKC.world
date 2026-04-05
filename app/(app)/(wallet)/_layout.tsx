import { Stack } from 'expo-router';
import { colors } from '../../../src/constants';

export default function WalletStack() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.brand.dark }, headerTintColor: colors.white, headerTitleStyle: { fontWeight: '700' } }}>
      <Stack.Screen name="index" options={{ title: 'Wallet' }} />
      <Stack.Screen name="deposit" options={{ title: 'Add Funds', presentation: 'modal' }} />
    </Stack>
  );
}
