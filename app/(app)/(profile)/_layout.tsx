import { Stack } from 'expo-router';
import { colors } from '../../../src/constants';

export default function ProfileStack() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.brand.dark }, headerTintColor: colors.white, headerTitleStyle: { fontWeight: '700' } }}>
      <Stack.Screen name="index" options={{ title: 'Profile' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
      <Stack.Screen name="edit" options={{ title: 'Edit Profile', presentation: 'modal' }} />
    </Stack>
  );
}
