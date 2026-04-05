import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Screen, Card, Badge, LoadingSpinner, ErrorState } from '../../../src/components/ui';
import { colors, spacing, fontSize } from '../../../src/constants';
import { apiClient } from '../../../src/api/client';
import { formatDate, formatTime } from '../../../src/utils/date';
import type { Rental } from '../../../src/types';

export default function RentalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: rental, isLoading, error, refetch } = useQuery({
    queryKey: ['rental', id],
    queryFn: async () => {
      const { data } = await apiClient.get<{ rental: Rental }>(`/rentals/${id}`);
      return data.rental;
    },
  });

  if (isLoading) return <LoadingSpinner fullScreen />;
  if (error || !rental) return <ErrorState onRetry={refetch} />;

  const statusVariant = rental.status === 'active' ? 'success' : rental.status === 'upcoming' ? 'info' : rental.status === 'cancelled' ? 'error' : 'default';

  return (
    <Screen scrollable padded>
      <Card>
        <View style={styles.header}>
          <Text style={styles.name}>{rental.equipmentName}</Text>
          <Badge label={rental.status} variant={statusVariant} />
        </View>
        <Text style={styles.category}>{rental.category}</Text>
        <View style={styles.times}>
          <Text style={styles.timeLabel}>Start: {formatDate(rental.startTime)} {formatTime(rental.startTime)}</Text>
          {rental.endTime && <Text style={styles.timeLabel}>End: {formatDate(rental.endTime)} {formatTime(rental.endTime)}</Text>}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  name: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[800], flex: 1, marginRight: spacing.sm },
  category: { fontSize: fontSize.sm, color: colors.gray[500], marginBottom: spacing.md },
  times: { gap: spacing.xs },
  timeLabel: { fontSize: fontSize.sm, color: colors.gray[600] },
});
