import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { Screen, Card, Button, EmptyState, ErrorState, LoadingSpinner } from '../../../src/components/ui';
import { colors, spacing, fontSize } from '../../../src/constants';
import { apiClient } from '../../../src/api/client';
import { formatCurrency } from '../../../src/utils/currency';
import { formatDateTime } from '../../../src/utils/date';
import type { WalletBalance, WalletTransaction, Currency } from '../../../src/types';

const CURRENCIES: Currency[] = ['EUR', 'TRY', 'USD', 'GBP'];

function TransactionItem({ tx }: { tx: WalletTransaction }) {
  const { t } = useTranslation();
  const isCredit = tx.type === 'credit' || tx.type === 'deposit' || tx.type === 'refund' || tx.type === 'voucher';
  return (
    <View style={styles.txItem}>
      <View style={styles.txLeft}>
        <Text style={styles.txType}>{t(`wallet.transactionTypes.${tx.type}`)}</Text>
        <Text style={styles.txDate}>{formatDateTime(tx.createdAt)}</Text>
        {tx.description && <Text style={styles.txDesc}>{tx.description}</Text>}
      </View>
      <Text style={[styles.txAmount, isCredit ? styles.credit : styles.debit]}>
        {isCredit ? '+' : '-'}{formatCurrency(tx.amount, tx.currency)}
      </Text>
    </View>
  );
}

export default function WalletScreen() {
  const { t } = useTranslation();
  const [activeCurrency, setActiveCurrency] = useState<Currency>('EUR');

  const { data: balances, isLoading: balancesLoading, refetch } = useQuery({
    queryKey: ['wallet', 'balances'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ balances: WalletBalance[] }>('/wallet/balance');
      return data.balances ?? [];
    },
    staleTime: 30 * 1000,
  });

  const { data: transactions, isLoading: txLoading, error } = useQuery({
    queryKey: ['wallet', 'transactions', activeCurrency],
    queryFn: async () => {
      const { data } = await apiClient.get<{ transactions: WalletTransaction[] }>(`/wallet/transactions?currency=${activeCurrency}&limit=50`);
      return data.transactions ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const activeBalance = balances?.find(b => b.currency === activeCurrency);

  if (balancesLoading) return <LoadingSpinner fullScreen />;

  return (
    <Screen padded={false}>
      {/* Balance Card */}
      <View style={styles.balanceSection}>
        <Text style={styles.balanceLabel}>{t('wallet.balance')}</Text>
        <Text style={styles.balanceAmount}>
          {activeBalance ? formatCurrency(activeBalance.balance, activeBalance.currency) : '—'}
        </Text>
        <Button title={t('wallet.deposit')} onPress={() => router.push('/(app)/(wallet)/deposit')} style={styles.depositButton} />

        {/* Currency tabs */}
        <View style={styles.currencyTabs}>
          {CURRENCIES.map(c => (
            <Pressable
              key={c}
              onPress={() => setActiveCurrency(c)}
              style={[styles.currencyTab, activeCurrency === c && styles.currencyTabActive]}
              accessibilityRole="tab"
              accessibilityLabel={c}
              accessibilityState={{ selected: activeCurrency === c }}
            >
              <Text style={[styles.currencyTabText, activeCurrency === c && styles.currencyTabTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Transactions */}
      <Text style={styles.txTitle}>{t('wallet.transactions')}</Text>
      {error ? (
        <ErrorState onRetry={refetch} />
      ) : txLoading ? (
        <LoadingSpinner />
      ) : (
        <FlashList
          data={transactions}
          keyExtractor={(item) => String(item.id)}
          estimatedItemSize={70}
          renderItem={({ item }) => <TransactionItem tx={item} />}
          contentContainerStyle={styles.txList}
          ListEmptyComponent={<EmptyState icon="💳" title={t('wallet.noTransactions')} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  balanceSection: { backgroundColor: colors.brand.dark, padding: spacing.lg, paddingBottom: spacing.xl, alignItems: 'center' },
  balanceLabel: { fontSize: fontSize.sm, color: colors.gray[400], fontWeight: '500' },
  balanceAmount: { fontSize: fontSize['3xl'], fontWeight: '800', color: colors.white, marginVertical: spacing.sm },
  depositButton: { marginBottom: spacing.lg },
  currencyTabs: { flexDirection: 'row', gap: spacing.xs },
  currencyTab: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  currencyTabActive: { backgroundColor: colors.white },
  currencyTabText: { fontSize: fontSize.sm, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  currencyTabTextActive: { color: colors.brand.dark },
  txTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[700], padding: spacing.md },
  txList: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  txItem: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: spacing.sm },
  txLeft: { flex: 1, marginRight: spacing.sm },
  txType: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray[800] },
  txDate: { fontSize: fontSize.xs, color: colors.gray[400], marginTop: 2 },
  txDesc: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 2 },
  txAmount: { fontSize: fontSize.base, fontWeight: '700' },
  credit: { color: colors.success },
  debit: { color: colors.gray[700] },
  separator: { height: 1, backgroundColor: colors.gray[100] },
});
