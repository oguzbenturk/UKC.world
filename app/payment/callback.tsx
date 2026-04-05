import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Button, LoadingSpinner } from '../../src/components/ui';
import { colors, spacing, fontSize } from '../../src/constants';
import { useQueryClient } from '@tanstack/react-query';
import { haptics } from '../../src/services/haptics';

export default function PaymentCallbackScreen() {
  const params = useLocalSearchParams<{ status?: string; token?: string }>();
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading');
  const queryClient = useQueryClient();

  useEffect(() => {
    const paymentStatus = params.status;
    if (paymentStatus === 'success' || paymentStatus === '1') {
      setStatus('success');
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    } else if (paymentStatus === 'failed' || paymentStatus === '0') {
      setStatus('failed');
      haptics.error();
    } else {
      // Default: assume success if we got a callback
      setStatus('success');
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    }
  }, [params.status]);

  if (status === 'loading') return <LoadingSpinner fullScreen />;

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{status === 'success' ? '✅' : '❌'}</Text>
      <Text style={styles.title}>
        {status === 'success' ? 'Payment Successful' : 'Payment Failed'}
      </Text>
      <Text style={styles.subtitle}>
        {status === 'success'
          ? 'Your payment has been processed successfully.'
          : 'Something went wrong with your payment. Please try again.'}
      </Text>
      <Button
        title={status === 'success' ? 'Go to Wallet' : 'Try Again'}
        onPress={() => router.replace(status === 'success' ? '/(app)/(wallet)' : '/(app)/(wallet)/deposit')}
        style={styles.button}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  icon: { fontSize: 64, marginBottom: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.gray[800], marginBottom: spacing.sm },
  subtitle: { fontSize: fontSize.base, color: colors.gray[500], textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl },
  button: { minWidth: 200 },
});
