import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { Link, router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useTranslation } from 'react-i18next';
import { Screen, Button, Input } from '../../src/components/ui';
import { colors, spacing, fontSize } from '../../src/constants';
import { loginSchema } from '../../src/utils/validation';
import { apiClient } from '../../src/api/client';
import { useAuthStore } from '../../src/stores/authStore';
import { AuthResponse } from '../../src/types';
import { getBiometricPref, isBiometricAvailable, authenticateWithBiometrics } from '../../src/services/biometric';
import { haptics } from '../../src/services/haptics';

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginScreen() {
  const { t } = useTranslation();
  const { setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: yupResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      const { data: response } = await apiClient.post<AuthResponse>('/auth/login', data);

      if (response.requires2FA) {
        router.push({ pathname: '/(auth)/verify-2fa', params: { email: data.email, password: data.password } });
        return;
      }

      await setAuth(response.user, response.token);
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

  const handleBiometric = async () => {
    const available = await isBiometricAvailable();
    const enabled = await getBiometricPref();
    if (!available || !enabled) return;
    const success = await authenticateWithBiometrics(t('auth.signIn'));
    if (success) {
      // Re-validate existing stored token
      router.replace('/(app)/(home)');
    }
  };

  return (
    <Screen scrollable avoidKeyboard padded>
      <View style={styles.header}>
        <Text style={styles.title}>{t('app.name')}</Text>
        <Text style={styles.subtitle}>{t('auth.signInTitle')}</Text>
        <Text style={styles.caption}>{t('auth.signInSubtitle')}</Text>
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

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label={t('auth.password')}
              placeholder="••••••••"
              secureTextEntry={!showPassword}
              autoComplete="password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
              rightIcon={
                <Text style={styles.showHide}>{showPassword ? '🙈' : '👁'}</Text>
              }
              onRightIconPress={() => setShowPassword(!showPassword)}
            />
          )}
        />

        <Link href="/(auth)/reset-password" asChild>
          <Pressable>
            <Text style={styles.forgotPassword}>{t('auth.forgotPassword')}</Text>
          </Pressable>
        </Link>

        <Button
          title={t('auth.signIn')}
          onPress={handleSubmit(onSubmit)}
          loading={loading}
          style={styles.submitButton}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('auth.noAccount')} </Text>
        <Link href="/(auth)/register" asChild>
          <Pressable>
            <Text style={styles.footerLink}>{t('auth.signUp')}</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: colors.brand.dark,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.gray[800],
    marginBottom: spacing.xs,
  },
  caption: {
    fontSize: fontSize.base,
    color: colors.gray[500],
    textAlign: 'center',
  },
  form: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  showHide: { fontSize: 16 },
  forgotPassword: {
    color: colors.brand.primary,
    fontSize: fontSize.sm,
    fontWeight: '500',
    textAlign: 'right',
  },
  submitButton: {
    marginTop: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing.lg,
  },
  footerText: {
    fontSize: fontSize.base,
    color: colors.gray[600],
  },
  footerLink: {
    fontSize: fontSize.base,
    color: colors.brand.primary,
    fontWeight: '600',
  },
});
