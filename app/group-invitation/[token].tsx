import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Screen, Button, Card, LoadingSpinner, ErrorState } from '../../src/components/ui';
import { colors, spacing, fontSize } from '../../src/constants';
import { apiClient } from '../../src/api/client';
import { haptics } from '../../src/services/haptics';

export default function GroupInvitationScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['group-invitation', token],
    queryFn: async () => {
      const { data } = await apiClient.get(`/group-bookings/invitation/${token}`);
      return data;
    },
  });

  const joinMutation = useMutation({
    mutationFn: () => apiClient.post(`/group-bookings/join/${token}`),
    onSuccess: () => {
      haptics.success();
      Alert.alert('✅', 'You have joined the group booking!');
      router.replace('/(app)/(bookings)');
    },
    onError: () => {
      haptics.error();
      Alert.alert('', 'Failed to join group booking');
    },
  });

  if (isLoading) return <LoadingSpinner fullScreen />;
  if (error) return <ErrorState />;

  return (
    <Screen padded>
      <Card style={styles.card}>
        <Text style={styles.icon}>👥</Text>
        <Text style={styles.title}>Group Booking Invitation</Text>
        <Text style={styles.subtitle}>{data?.groupName ?? 'You have been invited to join a group lesson'}</Text>
      </Card>
      <Button title="Join Group" onPress={() => joinMutation.mutate()} loading={joinMutation.isPending} style={styles.button} />
      <Button title="Decline" onPress={() => router.back()} variant="ghost" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', padding: spacing.xl, marginBottom: spacing.lg },
  icon: { fontSize: 48, marginBottom: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.gray[800], marginBottom: spacing.xs },
  subtitle: { fontSize: fontSize.base, color: colors.gray[500], textAlign: 'center' },
  button: { marginBottom: spacing.sm },
});
