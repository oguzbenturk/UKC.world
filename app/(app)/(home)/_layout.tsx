import { Stack } from 'expo-router';
import { colors } from '../../../src/constants';

export default function HomeStack() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.brand.dark },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'UKC World' }} />
    </Stack>
  );
}
