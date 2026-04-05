import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen, Card } from '../../../src/components/ui';
import { colors, spacing, fontSize } from '../../../src/constants';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const [emailNotifs, setEmailNotifs] = React.useState(true);
  const [pushNotifs, setPushNotifs] = React.useState(true);

  return (
    <Screen scrollable padded>
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>{t('notifications.title')}</Text>
        <View style={styles.setting}>
          <Text style={styles.settingLabel}>Push Notifications</Text>
          <Switch
            value={pushNotifs}
            onValueChange={setPushNotifs}
            trackColor={{ false: colors.gray[200], true: colors.brand.primary }}
            thumbColor={colors.white}
            accessibilityLabel="Toggle push notifications"
          />
        </View>
        <View style={styles.setting}>
          <Text style={styles.settingLabel}>{t('consent.emailMarketing')}</Text>
          <Switch
            value={emailNotifs}
            onValueChange={setEmailNotifs}
            trackColor={{ false: colors.gray[200], true: colors.brand.primary }}
            thumbColor={colors.white}
            accessibilityLabel="Toggle email notifications"
          />
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>{t('profile.language')}</Text>
        <Text style={styles.settingLabel}>Türkçe / English</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md, gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[800], marginBottom: spacing.sm },
  setting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xs, minHeight: 44 },
  settingLabel: { fontSize: fontSize.base, color: colors.gray[700] },
});
