import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../../src/components/ui';
import { colors, spacing, fontSize } from '../../src/constants';

export default function PublicHome() {
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>🪁</Text>
        <Text style={styles.title}>UKC World</Text>
        <Text style={styles.subtitle}>Kite School & Watersports</Text>
        <Text style={styles.tagline}>Book lessons, rent equipment, and track your progress</Text>
      </View>

      <View style={styles.actions}>
        <Button
          title="Sign In"
          onPress={() => router.push('/(auth)/login')}
          style={styles.button}
        />
        <Button
          title="Create Account"
          onPress={() => router.push('/(auth)/register')}
          variant="outline"
          style={styles.button}
        />
        <Pressable onPress={() => router.push('/(app)/(home)')} style={styles.guestLink} accessibilityRole="link">
          <Text style={styles.guestText}>Browse as Guest →</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brand.dark, justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing['2xl'] },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  logo: { fontSize: 64, marginBottom: spacing.md },
  title: { fontSize: fontSize['3xl'], fontWeight: '800', color: colors.white },
  subtitle: { fontSize: fontSize.lg, color: colors.brand.primary, fontWeight: '600' },
  tagline: { fontSize: fontSize.base, color: colors.gray[400], textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  actions: { gap: spacing.md },
  button: {},
  guestLink: { alignItems: 'center', paddingVertical: spacing.sm },
  guestText: { color: colors.gray[400], fontSize: fontSize.base },
});
