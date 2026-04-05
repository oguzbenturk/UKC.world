import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../src/hooks/useAuth';
import { Screen, Card, Badge, LoadingSpinner, ErrorState } from '../../../src/components/ui';
import { colors, spacing, fontSize } from '../../../src/constants';
import { apiClient } from '../../../src/api/client';
import { formatDate, formatTime } from '../../../src/utils/date';
import { formatCurrency } from '../../../src/utils/currency';
import type { Booking, WalletBalance } from '../../../src/types';

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.quickAction}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.quickActionIcon}>{icon}</Text>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const { data: bookings, isLoading: bookingsLoading, refetch, isRefetching, error } = useQuery({
    queryKey: ['bookings', 'upcoming'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ bookings: Booking[] }>('/student/bookings?status=upcoming&limit=3');
      return data.bookings ?? [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: balances } = useQuery({
    queryKey: ['wallet', 'balances'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ balances: WalletBalance[] }>('/wallet/balance');
      return data.balances ?? [];
    },
    staleTime: 30 * 1000,
  });

  const primaryBalance = balances?.find(b => b.currency === 'EUR') ?? balances?.[0];

  return (
    <Screen
      scrollable
      refreshing={isRefetching}
      onRefresh={refetch}
      padded={false}
      backgroundColor={colors.gray[50]}
    >
      {/* Header Card */}
      <View style={styles.heroCard}>
        <Text style={styles.welcomeText}>{t('home.welcome')},</Text>
        <Text style={styles.userName}>{user?.name?.split(' ')[0] ?? 'Sailor'} 👋</Text>
        {primaryBalance && (
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>{t('home.myBalance')}</Text>
            <Text style={styles.balanceValue}>
              {formatCurrency(primaryBalance.balance, primaryBalance.currency)}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>{t('home.quickActions')}</Text>
        <View style={styles.quickActions}>
          <QuickAction
            icon="🪁"
            label={t('home.bookLesson')}
            onPress={() => router.push('/(app)/(bookings)/new')}
          />
          <QuickAction
            icon="🏄"
            label={t('home.bookRental')}
            onPress={() => router.push('/(app)/(rentals)/new')}
          />
          <QuickAction
            icon="💳"
            label={t('wallet.deposit')}
            onPress={() => router.push('/(app)/(wallet)/deposit')}
          />
          <QuickAction
            icon="🛍️"
            label={t('tabs.bookings')}
            onPress={() => router.push('/(app)/(bookings)')}
          />
        </View>

        {/* Upcoming Lessons */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.upcomingLessons')}</Text>
          <Pressable onPress={() => router.push('/(app)/(bookings)')}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        </View>

        {bookingsLoading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorState onRetry={refetch} />
        ) : !bookings?.length ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📅</Text>
            <Text style={styles.emptyTitle}>{t('home.noUpcoming')}</Text>
            <Text style={styles.emptyText}>{t('home.bookFirstLesson')}</Text>
          </Card>
        ) : (
          bookings.map((booking) => (
            <Pressable
              key={booking.id}
              onPress={() => router.push(`/(app)/(bookings)/${booking.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${booking.serviceName} on ${formatDate(booking.date)}`}
            >
              <Card style={styles.bookingCard}>
                <View style={styles.bookingRow}>
                  <View style={styles.bookingInfo}>
                    <Text style={styles.bookingService}>{booking.serviceName}</Text>
                    <Text style={styles.bookingMeta}>
                      {formatDate(booking.date)} · {formatTime(booking.startTime)}
                    </Text>
                    {booking.instructorName && (
                      <Text style={styles.bookingInstructor}>👤 {booking.instructorName}</Text>
                    )}
                  </View>
                  <Badge
                    label={t(`bookings.status.${booking.status}`)}
                    variant={booking.status === 'confirmed' ? 'success' : booking.status === 'pending' ? 'warning' : 'default'}
                  />
                </View>
              </Card>
            </Pressable>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.brand.dark,
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  welcomeText: {
    fontSize: fontSize.sm,
    color: colors.gray[400],
    fontWeight: '500',
  },
  userName: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.white,
    marginTop: 2,
    marginBottom: spacing.md,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: spacing.md,
    borderRadius: 12,
  },
  balanceLabel: { fontSize: fontSize.sm, color: colors.gray[300] },
  balanceValue: { fontSize: fontSize.lg, fontWeight: '700', color: colors.white },
  content: { padding: spacing.md, gap: spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.gray[800],
  },
  seeAll: { fontSize: fontSize.sm, color: colors.brand.primary, fontWeight: '600' },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickAction: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    minHeight: 80,
    justifyContent: 'center',
  },
  quickActionIcon: { fontSize: 24 },
  quickActionLabel: { fontSize: fontSize.xs, color: colors.gray[600], fontWeight: '600', textAlign: 'center' },
  bookingCard: { marginBottom: spacing.sm },
  bookingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  bookingInfo: { flex: 1, marginRight: spacing.sm },
  bookingService: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[800] },
  bookingMeta: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  bookingInstructor: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 2 },
  emptyCard: { alignItems: 'center', padding: spacing.xl },
  emptyIcon: { fontSize: 40, marginBottom: spacing.sm },
  emptyTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[700] },
  emptyText: { fontSize: fontSize.sm, color: colors.gray[500], textAlign: 'center', marginTop: spacing.xs },
});
