import { Stack } from 'expo-router';
import { colors } from '../../src/constants';

export default function PublicLayout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.brand.dark }, headerTintColor: colors.white, headerTitleStyle: { fontWeight: '700' } }}>
      <Stack.Screen name="index" options={{ title: 'UKC World', headerShown: false }} />
      <Stack.Screen name="academy/index" options={{ title: 'Academy' }} />
    </Stack>
  );
}
