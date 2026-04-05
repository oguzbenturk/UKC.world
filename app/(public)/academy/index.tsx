import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Button, Card } from '../../../src/components/ui';
import { colors, spacing, fontSize } from '../../../src/constants';

const LEVELS = [
  { icon: '🌊', title: 'Beginner', subtitle: 'IKO Level 1-2', description: 'Learn kite control, body dragging, and your first board starts.' },
  { icon: '🪁', title: 'Intermediate', subtitle: 'IKO Level 3-4', description: 'Water relaunches, upwind riding, and transitions.' },
  { icon: '🏄', title: 'Advanced', subtitle: 'IKO Level 5+', description: 'Jumps, waves, freestyle tricks, and foil introduction.' },
];

export default function AcademyScreen() {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>UKC World Academy</Text>
        <Text style={styles.heroSubtitle}>IKO Certified Instruction</Text>
        <Text style={styles.heroText}>
          Our certified instructors deliver world-class kitesurfing education at every level, from absolute beginner to freestyle competitor.
        </Text>
      </View>

      {LEVELS.map((level) => (
        <Card key={level.title} style={styles.card}>
          <Text style={styles.levelIcon}>{level.icon}</Text>
          <View style={styles.levelInfo}>
            <Text style={styles.levelTitle}>{level.title}</Text>
            <Text style={styles.levelSubtitle}>{level.subtitle}</Text>
            <Text style={styles.levelDesc}>{level.description}</Text>
          </View>
        </Card>
      ))}

      <View style={styles.cta}>
        <Button
          title="Sign In to Book a Lesson"
          onPress={() => router.push('/(auth)/login')}
          style={styles.button}
        />
        <Button
          title="Create Account"
          onPress={() => router.push('/(auth)/register')}
          variant="outline"
          style={styles.button}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.gray[50] },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing['2xl'] },
  hero: { backgroundColor: colors.brand.dark, borderRadius: 12, padding: spacing.xl, gap: spacing.sm, marginBottom: spacing.sm },
  heroTitle: { fontSize: fontSize['2xl'], fontWeight: '800', color: colors.white },
  heroSubtitle: { fontSize: fontSize.base, color: colors.brand.primary, fontWeight: '600' },
  heroText: { fontSize: fontSize.sm, color: colors.gray[400], lineHeight: 20 },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  levelIcon: { fontSize: 32 },
  levelInfo: { flex: 1, gap: spacing.xs },
  levelTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[800] },
  levelSubtitle: { fontSize: fontSize.sm, color: colors.brand.primary, fontWeight: '600' },
  levelDesc: { fontSize: fontSize.sm, color: colors.gray[500], lineHeight: 18 },
  cta: { gap: spacing.sm, marginTop: spacing.md },
  button: {},
});
