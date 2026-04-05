import React from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../../src/components/ui';
import { colors, spacing, fontSize } from '../../../src/constants';
import { useAuth } from '../../../src/hooks/useAuth';
import { haptics } from '../../../src/services/haptics';
import { apiClient } from '../../../src/api/client';

function MenuItem({ icon, label, onPress, danger }: { icon: string; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.menuItem}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.menuIcon}>{icon}</Text>
      <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>{label}</Text>
      <Text style={styles.menuArrow}>›</Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert(t('auth.logout'), `${t('auth.logout')}?`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('auth.logout'),
        style: 'destructive',
        onPress: async () => {
          try { await apiClient.post('/auth/logout'); } catch {}
          await logout();
          haptics.success();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) ?? '?';

  return (
    <Screen scrollable padded={false}>
      {/* Avatar & Name */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user?.name ?? 'User'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <Text style={styles.role}>{user?.role}</Text>
      </View>

      {/* Menu */}
      <View style={styles.menu}>
        <MenuItem icon="✏️" label={t('profile.editProfile')} onPress={() => router.push('/(app)/(profile)/edit')} />
        <MenuItem icon="⚙️" label={t('profile.settings')} onPress={() => router.push('/(app)/(profile)/settings')} />
        <MenuItem icon="🔔" label={t('notifications.title')} onPress={() => router.push('/(app)/(profile)/settings')} />
        <MenuItem icon="🔒" label={t('profile.privacy')} onPress={() => router.push('/(app)/(profile)/privacy')} />
        <MenuItem icon="🚪" label={t('auth.logout')} onPress={handleLogout} danger />
      </View>

      <Text style={styles.version}>{t('profile.version')} 1.0.0</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.brand.dark, alignItems: 'center', padding: spacing.xl, paddingBottom: spacing['2xl'] },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.brand.primary, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  avatarText: { fontSize: fontSize.xl, fontWeight: '700', color: colors.white },
  name: { fontSize: fontSize.lg, fontWeight: '700', color: colors.white },
  email: { fontSize: fontSize.sm, color: colors.gray[400], marginTop: 2 },
  role: { fontSize: fontSize.xs, color: colors.gray[500], marginTop: 2, textTransform: 'capitalize' },
  menu: { backgroundColor: colors.white, marginTop: -spacing.lg, borderRadius: 16, marginHorizontal: spacing.md, paddingVertical: spacing.sm, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: spacing.md, minHeight: 52 },
  menuIcon: { fontSize: 20, width: 28 },
  menuLabel: { flex: 1, fontSize: fontSize.base, color: colors.gray[700], fontWeight: '500' },
  menuLabelDanger: { color: colors.error },
  menuArrow: { fontSize: 18, color: colors.gray[400] },
  version: { textAlign: 'center', fontSize: fontSize.xs, color: colors.gray[400], padding: spacing.xl },
});
