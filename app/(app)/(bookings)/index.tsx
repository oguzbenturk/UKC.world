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
import type { Booking } from '../../../src/types';

function BookingItem({ booking }: { booking: Booking }) {
  const { t } = useTranslation();
  const statusVariant = booking.status === 'confirmed' ? 'success'
    : booking.status === 'pending' ? 'warning'
    : booking.status === 'cancelled' ? 'error'
    : 'default';

  return (
    <Pressable
      onPress={() => router.push(`/(app)/(bookings)/${booking.id}`)}
      style={styles.item}
      accessibilityRole="button"
      accessibilityLabel={`${booking.serviceName}, ${formatDate(booking.date)}, ${t(`bookings.status.${booking.status}`)}`}
    >
      <View style={styles.itemLeft}>
        <Text style={styles.serviceName}>{booking.serviceName}</Text>
        <Text style={styles.meta}>{formatDate(booking.date)} · {formatTime(booking.startTime)}</Text>
        {booking.instructorName && (
          <Text style={styles.instructor}>👤 {booking.instructorName}</Text>
        )}
      </View>
      <Badge label={t(`bookings.status.${booking.status}`)} variant={statusVariant} />
    </Pressable>
  );
}

export default function BookingsScreen() {
  const { t } = useTranslation();

  const { data: bookings, isLoading, refetch, isRefetching, error } = useQuery({
    queryKey: ['bookings', 'list'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ bookings: Booking[] }>('/student/bookings');
      return data.bookings ?? [];
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) return <LoadingSpinner fullScreen />;
  if (error) return <ErrorState onRetry={refetch} />;

  return (
    <Screen padded={false}>
      <Button
        title={t('bookings.bookLesson')}
        onPress={() => router.push('/(app)/(bookings)/new')}
        style={styles.newButton}
        icon={<Text style={{ color: 'white', fontSize: 16 }}>+</Text>}
      />

      <FlashList
        data={bookings}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <BookingItem booking={item} />}
        contentContainerStyle={styles.list}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListEmptyComponent={
          <EmptyState
            icon="📅"
            title={t('bookings.noBookings')}
            actionLabel={t('bookings.bookLesson')}
            onAction={() => router.push('/(app)/(bookings)/new')}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  newButton: { margin: spacing.md },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  itemLeft: { flex: 1, marginRight: spacing.sm },
  serviceName: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[800] },
  meta: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  instructor: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 2 },
  separator: { height: spacing.sm },
});
