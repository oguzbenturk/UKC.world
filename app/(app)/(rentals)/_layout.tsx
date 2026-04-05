import { Stack } from 'expo-router';
import { colors } from '../../../src/constants';

export default function RentalsStack() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: colors.brand.dark }, headerTintColor: colors.white, headerTitleStyle: { fontWeight: '700' } }}>
      <Stack.Screen name="index" options={{ title: 'My Rentals' }} />
      <Stack.Screen name="new" options={{ title: 'Book Rental', presentation: 'modal' }} />
      <Stack.Screen name="[id]" options={{ title: 'Rental Detail' }} />
    </Stack>
  );
}
