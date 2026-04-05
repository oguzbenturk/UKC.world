import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Screen, LoadingSpinner, ErrorState, Button } from '../../src/components/ui';
import { colors, spacing, fontSize } from '../../src/constants';
import { apiClient } from '../../src/api/client';
import { useAuthStore } from '../../src/stores/authStore';

interface QuickLink {
  type: 'booking' | 'service' | 'rental';
  title: string;
  description: string;
  serviceId?: string;
  rentalId?: string;
}

export default function QuickLinkScreen() {
  const { linkCode } = useLocalSearchParams<{ linkCode: string }>();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data: link, isLoading, error, refetch } = useQuery({
    queryKey: ['quick-link', linkCode],
    queryFn: async () => {
      const { data } = await apiClient.get<{ link: QuickLink }>(`/quick/${linkCode}`);
      return data.link;
    },
    enabled: !!linkCode,
  });

  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      router.replace({
        pathname: '/(auth)/login',
        params: { redirect: `/quick/${linkCode}` },
      });
    }
  }, [isAuthenticated, isLoading, linkCode]);

  if (isLoading) return <LoadingSpinner fullScreen />;
  if (error || !link) return <ErrorState onRetry={refetch} />;

  const handleAction = () => {
    if (link.type === 'booking' && link.serviceId) {
      router.push({ pathname: '/(app)/(bookings)/new', params: { serviceId: link.serviceId } });
    } else if (link.type === 'rental' && link.rentalId) {
      router.push({ pathname: '/(app)/(rentals)/new', params: { rentalId: link.rentalId } });
    } else {
      router.replace('/(app)/(home)');
    }
  };

  return (
    <Screen padded>
      <View style={styles.container}>
        <Text style={styles.icon}>🔗</Text>
        <Text style={styles.title}>{link.title}</Text>
        <Text style={styles.description}>{link.description}</Text>
        <Button title="Continue" onPress={handleAction} style={styles.button} />
        <Button
          title="Go Home"
          onPress={() => router.replace('/(app)/(home)')}
          variant="ghost"
          style={styles.button}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  icon: { fontSize: 48 },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.gray[800], textAlign: 'center' },
  description: { fontSize: fontSize.base, color: colors.gray[500], textAlign: 'center', lineHeight: 22 },
  button: { width: '100%' },
});
