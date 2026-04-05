import { View, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../src/components/ui';
import { colors, spacing, fontSize } from '../src/constants';

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔍</Text>
      <Text style={styles.title}>Page Not Found</Text>
      <Button title="Go Home" onPress={() => router.replace('/')} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  icon: { fontSize: 48, marginBottom: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.gray[800], marginBottom: spacing.xl },
  button: { minWidth: 150 },
});
