import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { Screen, Badge, Button, EmptyState, ErrorState, LoadingSpinner } from '../../../src/components/ui';
import { colors, spacing, fontSize } from '../../../src/constants';
import { apiClient } from '../../../src/api/client';
import { formatDate, formatTime } from '../../../src/utils/date';
import type { Rental } from '../../../src/types';

function RentalItem({ rental }: { rental: Rental }) {
  const { t } = useTranslation();
  const statusVariant = rental.status === 'active' ? 'success' : rental.status === 'upcoming' ? 'info' : rental.status === 'cancelled' ? 'error' : 'default';
  return (
    <Pressable
      onPress={() => router.push(`/(app)/(rentals)/${rental.id}`)}
      style={styles.item}
      accessibilityRole="button"
      accessibilityLabel={`${rental.equipmentName} rental, ${t(`rentals.status.${rental.status}`)}`}
    >
      <View style={styles.left}>
        <Text style={styles.name}>{rental.equipmentName}</Text>
        <Text style={styles.meta}>{rental.category} · {formatDate(rental.startTime)} {formatTime(rental.startTime)}</Text>
      </View>
      <Badge label={t(`rentals.status.${rental.status}`)} variant={statusVariant} />
    </Pressable>
  );
}

export default function RentalsScreen() {
  const { t } = useTranslation();
  const { data: rentals, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['rentals', 'list'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ rentals: Rental[] }>('/rentals?mine=true');
      return data.rentals ?? [];
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return <LoadingSpinner fullScreen />;
  if (error) return <ErrorState onRetry={refetch} />;

  return (
    <Screen padded={false}>
      <Button title={t('rentals.newRental')} onPress={() => router.push('/(app)/(rentals)/new')} style={styles.newButton} icon={<Text style={{ color: 'white' }}>+</Text>} />
      <FlashList
        data={rentals}
        keyExtractor={(item) => String(item.id)}
        estimatedItemSize={80}
        renderItem={({ item }) => <RentalItem rental={item} />}
        contentContainerStyle={styles.list}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListEmptyComponent={<EmptyState icon="🏄" title={t('rentals.noRentals')} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  newButton: { margin: spacing.md },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, borderRadius: 12, padding: spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  left: { flex: 1, marginRight: spacing.sm },
  name: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[800] },
  meta: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  separator: { height: spacing.sm },
});
