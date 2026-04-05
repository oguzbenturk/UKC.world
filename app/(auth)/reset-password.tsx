import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useTranslation } from 'react-i18next';
import { Screen, Button, Input } from '../../src/components/ui';
import { colors, spacing, fontSize } from '../../src/constants';
import { resetPasswordSchema } from '../../src/utils/validation';
import { apiClient } from '../../src/api/client';
import { haptics } from '../../src/services/haptics';

interface ResetForm { email: string; }

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<ResetForm>({
    resolver: yupResolver(resetPasswordSchema),
  });

  const onSubmit = async (data: ResetForm) => {
    setLoading(true);
    try {
      await apiClient.post('/auth/reset-password/request', data);
      haptics.success();
      setSent(true);
    } catch (err: unknown) {
      haptics.error();
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t('errors.unknown');
      Alert.alert('', message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <Screen padded>
        <View style={styles.center}>
          <Text style={styles.successIcon}>✉️</Text>
          <Text style={styles.title}>{t('auth.resetPassword')}</Text>
          <Text style={styles.subtitle}>{t('auth.resetPasswordSent')}</Text>
          <Button title={t('auth.signIn')} onPress={() => router.replace('/(auth)/login')} style={styles.button} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scrollable avoidKeyboard padded>
      <Button title={t('common.back')} onPress={() => router.back()} variant="ghost" style={styles.backButton} />
      <View style={styles.header}>
        <Text style={styles.title}>{t('auth.forgotPassword')}</Text>
        <Text style={styles.subtitle}>Enter your email to receive a reset link</Text>
      </View>
      <View style={styles.form}>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label={t('auth.email')}
              placeholder="email@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.email?.message}
            />
          )}
        />
        <Button title={t('auth.resetPassword')} onPress={handleSubmit(onSubmit)} loading={loading} style={styles.button} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backButton: { alignSelf: 'flex-start', marginBottom: spacing.lg },
  header: { alignItems: 'center', paddingVertical: spacing.xl },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.gray[800], marginBottom: spacing.xs },
  subtitle: { fontSize: fontSize.base, color: colors.gray[500], textAlign: 'center' },
  form: { gap: spacing.md },
  button: { marginTop: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  successIcon: { fontSize: 48 },
});
