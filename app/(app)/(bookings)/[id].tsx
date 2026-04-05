import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, Card, Badge, Button, LoadingSpinner, ErrorState } from '../../../src/components/ui';
import { colors, spacing, fontSize } from '../../../src/constants';
import { apiClient } from '../../../src/api/client';
import { formatDateTime } from '../../../src/utils/date';
import { formatCurrency } from '../../../src/utils/currency';
import { haptics } from '../../../src/services/haptics';
import type { Booking } from '../../../src/types';

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: booking, isLoading, error, refetch } = useQuery({
    queryKey: ['booking', id],
    queryFn: async () => {
      const { data } = await apiClient.get<{ booking: Booking }>(`/bookings/${id}`);
      return data.booking;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiClient.delete(`/bookings/${id}`),
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      router.back();
    },
    onError: () => {
      haptics.error();
    },
  });

  const handleCancel = () => {
    Alert.alert(
      t('bookings.cancel'),
      t('bookings.cancelConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('bookings.cancel'), style: 'destructive', onPress: () => cancelMutation.mutate() },
      ]
    );
  };

  if (isLoading) return <LoadingSpinner fullScreen />;
  if (error || !booking) return <ErrorState onRetry={refetch} />;

  const canCancel = booking.status === 'pending' || booking.status === 'confirmed';
  const statusVariant = booking.status === 'confirmed' ? 'success'
    : booking.status === 'pending' ? 'warning'
    : booking.status === 'cancelled' ? 'error' : 'default';

  return (
    <Screen scrollable padded>
      <Card style={styles.mainCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.serviceName}>{booking.serviceName}</Text>
          <Badge label={t(`bookings.status.${booking.status}`)} variant={statusVariant} />
        </View>

        <View style={styles.detailRows}>
          <DetailRow icon="📅" label={t('bookings.date')} value={formatDateTime(booking.date)} />
          {booking.instructorName && (
            <DetailRow icon="👤" label={t('bookings.instructor')} value={booking.instructorName} />
          )}
          {booking.totalAmount && (
            <DetailRow icon="💳" label="Amount" value={formatCurrency(booking.totalAmount, booking.currency)} />
          )}
        </View>
      </Card>

      {canCancel && (
        <Button
          title={t('bookings.cancel')}
          onPress={handleCancel}
          variant="danger"
          loading={cancelMutation.isPending}
          style={styles.cancelButton}
        />
      )}
    </Screen>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mainCard: { marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  serviceName: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[800], flex: 1, marginRight: spacing.sm },
  detailRows: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowIcon: { fontSize: 16, width: 24 },
  rowLabel: { flex: 1, fontSize: fontSize.sm, color: colors.gray[500] },
  rowValue: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[800] },
  cancelButton: { marginTop: spacing.md },
});
