import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, Button, Input } from '../../../src/components/ui';
import { colors, spacing, fontSize } from '../../../src/constants';
import { apiClient } from '../../../src/api/client';
import { haptics } from '../../../src/services/haptics';

export default function DepositScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');

  const depositMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ paymentPageUrl: string }>('/wallet/deposit', {
        amount: parseFloat(amount),
        currency,
        callbackUrl: 'https://plannivo.com/payment/callback?platform=mobile',
      });
      return data;
    },
    onSuccess: async (data) => {
      if (data.paymentPageUrl) {
        const result = await WebBrowser.openAuthSessionAsync(
          data.paymentPageUrl,
          'ukc://payment/callback'
        );
        if (result.type === 'success') {
          haptics.success();
          queryClient.invalidateQueries({ queryKey: ['wallet'] });
          router.back();
        }
      }
    },
    onError: () => {
      haptics.error();
      Alert.alert('', t('wallet.paymentFailed'));
    },
  });

  const handleDeposit = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      Alert.alert('', 'Please enter a valid amount');
      return;
    }
    depositMutation.mutate();
  };

  return (
    <Screen scrollable avoidKeyboard padded>
      <Text style={styles.title}>{t('wallet.deposit')}</Text>
      <Text style={styles.subtitle}>Add funds to your wallet to pay for lessons and rentals</Text>

      <View style={styles.form}>
        <Input
          label={t('wallet.depositAmount')}
          placeholder="100.00"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />

        <View style={styles.currencies}>
          {['EUR', 'TRY', 'USD'].map(c => (
            <Button
              key={c}
              title={c}
              onPress={() => setCurrency(c)}
              variant={currency === c ? 'primary' : 'outline'}
              size="sm"
              style={styles.currencyBtn}
            />
          ))}
        </View>

        <Button
          title={`${t('wallet.payWithCard')} (Iyzico)`}
          onPress={handleDeposit}
          loading={depositMutation.isPending}
          style={styles.payButton}
        />

        <Text style={styles.safeNote}>🔒 Payments are secured by Iyzico</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.gray[800], marginBottom: spacing.xs },
  subtitle: { fontSize: fontSize.sm, color: colors.gray[500], marginBottom: spacing.lg },
  form: { gap: spacing.md },
  currencies: { flexDirection: 'row', gap: spacing.sm },
  currencyBtn: { flex: 1 },
  payButton: { marginTop: spacing.sm },
  safeNote: { fontSize: fontSize.xs, color: colors.gray[400], textAlign: 'center' },
});
