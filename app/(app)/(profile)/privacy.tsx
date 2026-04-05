import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Screen, Button, Card } from '../../../src/components/ui';
import { colors, spacing, fontSize } from '../../../src/constants';
import { apiClient } from '../../../src/api/client';
import { useAuth } from '../../../src/hooks/useAuth';
import { haptics } from '../../../src/services/haptics';

export default function PrivacyScreen() {
  const { t } = useTranslation();
  const { logout } = useAuth();

  const exportMutation = useMutation({
    mutationFn: () => apiClient.post('/gdpr/export'),
    onSuccess: () => {
      haptics.success();
      Alert.alert('✅', 'Data export request submitted. You will receive an email with your data within 24 hours.');
    },
    onError: () => {
      haptics.error();
      Alert.alert('', t('errors.unknown'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (password: string) => apiClient.delete('/users/me', { data: { password } }),
    onSuccess: async () => {
      haptics.success();
      await logout();
      router.replace('/(auth)/login');
    },
    onError: () => {
      haptics.error();
      Alert.alert('', 'Account deletion failed. Please check your password and try again.');
    },
  });

  const handleDeleteAccount = () => {
    Alert.alert(
      t('profile.deleteAccount'),
      t('profile.deleteAccountConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.prompt(
              'Confirm Password',
              'Enter your password to confirm account deletion',
              (password) => { if (password) deleteMutation.mutate(password); },
              'secure-text'
            );
          },
        },
      ]
    );
  };

  return (
    <Screen scrollable padded>
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Your Data</Text>
        <Text style={styles.sectionText}>
          Under KVKK (Law 6698) and GDPR, you have the right to access, correct, and delete your personal data.
        </Text>
        <Button
          title="Export My Data"
          onPress={() => exportMutation.mutate()}
          loading={exportMutation.isPending}
          variant="outline"
          style={styles.button}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Privacy Policy</Text>
        <Text style={styles.sectionText}>
          View our full privacy policy at plannivo.com/privacy
        </Text>
      </Card>

      <Card style={[styles.card, styles.dangerCard]}>
        <Text style={[styles.sectionTitle, styles.dangerText]}>{t('profile.deleteAccount')}</Text>
        <Text style={styles.sectionText}>
          Permanently delete your account and all associated data. This action cannot be undone.
        </Text>
        <Button
          title={t('profile.deleteAccount')}
          onPress={handleDeleteAccount}
          loading={deleteMutation.isPending}
          variant="danger"
          style={styles.button}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md, gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[800] },
  sectionText: { fontSize: fontSize.sm, color: colors.gray[500], lineHeight: 20 },
  button: { marginTop: spacing.xs },
  dangerCard: { borderWidth: 1, borderColor: '#FEE2E2' },
  dangerText: { color: colors.error },
});
