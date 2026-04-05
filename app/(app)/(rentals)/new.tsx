import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen } from '../../../src/components/ui';
import { colors, spacing, fontSize } from '../../../src/constants';

export default function NewRentalScreen() {
  return (
    <Screen padded>
      <Text style={styles.title}>Book Equipment</Text>
      <Text style={styles.subtitle}>Rental booking wizard — coming in Phase 2</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.gray[800] },
  subtitle: { fontSize: fontSize.base, color: colors.gray[500], marginTop: spacing.sm },
});
