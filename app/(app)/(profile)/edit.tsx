import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen, Button, Input } from '../../../src/components/ui';
import { colors, spacing, fontSize } from '../../../src/constants';
import { apiClient } from '../../../src/api/client';
import { useAuthStore } from '../../../src/stores/authStore';
import { haptics } from '../../../src/services/haptics';

export default function EditProfileScreen() {
  const { t } = useTranslation();
  const { user, updateUser } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');

  const updateMutation = useMutation({
    mutationFn: () => apiClient.put('/student/profile', { name, phone }),
    onSuccess: () => {
      updateUser({ name, phone });
      haptics.success();
      router.back();
    },
    onError: () => {
      haptics.error();
      Alert.alert('', t('errors.unknown'));
    },
  });

  return (
    <Screen scrollable avoidKeyboard padded>
      <View style={styles.form}>
        <Input
          label={t('auth.name')}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
        <Input
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <Button
          title={t('common.save')}
          onPress={() => updateMutation.mutate()}
          loading={updateMutation.isPending}
          style={styles.saveBtn}
        />
        <Button title={t('common.cancel')} onPress={() => router.back()} variant="ghost" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  saveBtn: { marginTop: spacing.sm },
});
