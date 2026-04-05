import { Stack } from 'expo-router';
import { colors } from '../../../src/constants';

export default function BookingsStack() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.brand.dark },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'My Bookings' }} />
      <Stack.Screen name="new" options={{ title: 'Book a Lesson', presentation: 'modal' }} />
      <Stack.Screen name="[id]" options={{ title: 'Booking Detail' }} />
    </Stack>
  );
}
