import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useTranslation } from 'react-i18next';
import { Screen, Button, Input } from '../../src/components/ui';
import { colors, spacing, fontSize } from '../../src/constants';
import { totpSchema } from '../../src/utils/validation';
import { apiClient } from '../../src/api/client';
import { useAuthStore } from '../../src/stores/authStore';
import { AuthResponse } from '../../src/types';
import { haptics } from '../../src/services/haptics';

interface TotpForm { code: string; }

export default function Verify2FAScreen() {
  const { t } = useTranslation();
  const { setAuth } = useAuthStore();
  const params = useLocalSearchParams<{ email: string; password: string }>();
  const [loading, setLoading] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<TotpForm>({
    resolver: yupResolver(totpSchema),
  });

  const onSubmit = async ({ code }: TotpForm) => {
    setLoading(true);
    try {
      const { data } = await apiClient.post<AuthResponse>('/auth/2fa/verify', {
        email: params.email,
        password: params.password,
        token: code,
      });
      await setAuth(data.user, data.token);
      haptics.success();
      router.replace('/(app)/(home)');
    } catch (err: unknown) {
      haptics.error();
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t('errors.unknown');
      Alert.alert('', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scrollable avoidKeyboard padded>
      <View style={styles.header}>
        <Text style={styles.icon}>🔐</Text>
        <Text style={styles.title}>{t('auth.twoFactor')}</Text>
        <Text style={styles.subtitle}>{t('auth.twoFactorSubtitle')}</Text>
      </View>

      <View style={styles.form}>
        <Controller
          control={control}
          name="code"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label={t('auth.twoFactorCode')}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.code?.message}
            />
          )}
        />

        <Button
          title={t('auth.verify')}
          onPress={handleSubmit(onSubmit)}
          loading={loading}
          style={styles.submitButton}
        />

        <Button
          title={t('common.back')}
          onPress={() => router.back()}
          variant="ghost"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', paddingVertical: spacing.xl },
  icon: { fontSize: 48, marginBottom: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.gray[800], marginBottom: spacing.xs },
  subtitle: { fontSize: fontSize.base, color: colors.gray[500], textAlign: 'center' },
  form: { gap: spacing.md, paddingVertical: spacing.lg },
  submitButton: { marginTop: spacing.sm },
});
