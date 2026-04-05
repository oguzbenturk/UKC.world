import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { Link, router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useTranslation } from 'react-i18next';
import { Screen, Button, Input } from '../../src/components/ui';
import { colors, spacing, fontSize } from '../../src/constants';
import { registerSchema } from '../../src/utils/validation';
import { apiClient } from '../../src/api/client';
import { useAuthStore } from '../../src/stores/authStore';
import { AuthResponse } from '../../src/types';
import { haptics } from '../../src/services/haptics';

interface RegisterForm {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export default function RegisterScreen() {
  const { t } = useTranslation();
  const { setAuth } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<RegisterForm>({
    resolver: yupResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true);
    try {
      const { data: response } = await apiClient.post<AuthResponse>('/auth/register', {
        name: data.name,
        email: data.email,
        password: data.password,
      });
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

  return (
    <Screen scrollable avoidKeyboard padded>
      <View style={styles.header}>
        <Text style={styles.title}>{t('auth.signUpTitle')}</Text>
        <Text style={styles.caption}>{t('auth.signUpSubtitle')}</Text>
      </View>

      <View style={styles.form}>
        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label={t('auth.name')}
              placeholder="John Doe"
              autoCapitalize="words"
              autoComplete="name"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.name?.message}
            />
          )}
        />

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
              secureTextEntry
              autoComplete="new-password"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label={t('auth.confirmPassword')}
              placeholder="••••••••"
              secureTextEntry
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.confirmPassword?.message}
            />
          )}
        />

        <Button
          title={t('auth.signUp')}
          onPress={handleSubmit(onSubmit)}
          loading={loading}
          style={styles.submitButton}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('auth.haveAccount')} </Text>
        <Link href="/(auth)/login" asChild>
          <Pressable>
            <Text style={styles.footerLink}>{t('auth.signIn')}</Text>
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
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.gray[800],
    marginBottom: spacing.xs,
  },
  caption: {
    fontSize: fontSize.base,
    color: colors.gray[500],
  },
  form: { gap: spacing.md, paddingVertical: spacing.lg },
  submitButton: { marginTop: spacing.sm },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: spacing.lg,
  },
  footerText: { fontSize: fontSize.base, color: colors.gray[600] },
  footerLink: { fontSize: fontSize.base, color: colors.brand.primary, fontWeight: '600' },
});
