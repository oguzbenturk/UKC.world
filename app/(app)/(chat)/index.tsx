import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { Screen, EmptyState, ErrorState, LoadingSpinner } from '../../../src/components/ui';
import { colors, spacing, fontSize } from '../../../src/constants';
import { apiClient } from '../../../src/api/client';
import { formatRelative } from '../../../src/utils/date';
import type { ChatConversation } from '../../../src/types';

function ConversationItem({ conv }: { conv: ChatConversation }) {
  const other = conv.participants[0];
  const initials = other?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) ?? '?';

  return (
    <Pressable
      onPress={() => router.push(`/(app)/(chat)/${conv.id}`)}
      style={styles.item}
      accessibilityRole="button"
      accessibilityLabel={`Chat with ${other?.name ?? 'Unknown'}`}
    >
      <View style={styles.avatar}>
        <Text style={styles.initials}>{initials}</Text>
      </View>
      <View style={styles.info}>
        <View style={styles.row}>
          <Text style={styles.name}>{other?.name ?? 'Unknown'}</Text>
          {conv.lastMessage && <Text style={styles.time}>{formatRelative(conv.lastMessage.createdAt)}</Text>}
        </View>
        {conv.lastMessage && (
          <Text style={styles.preview} numberOfLines={1}>{conv.lastMessage.content}</Text>
        )}
      </View>
      {conv.unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{conv.unreadCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

export default function ChatListScreen() {
  const { t } = useTranslation();
  const { data: conversations, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ rooms: ChatConversation[] }>('/chat/rooms');
      return data.rooms ?? [];
    },
    staleTime: 30 * 1000,
  });

  if (isLoading) return <LoadingSpinner fullScreen />;
  if (error) return <ErrorState onRetry={refetch} />;

  return (
    <Screen padded={false}>
      <FlashList
        data={conversations}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <ConversationItem conv={item} />}
        contentContainerStyle={styles.list}
        refreshing={isRefetching}
        onRefresh={refetch}
        ListEmptyComponent={<EmptyState icon="💬" title={t('chat.noConversations')} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: spacing.xl },
  item: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand.primary, alignItems: 'center', justifyContent: 'center' },
  initials: { color: colors.white, fontSize: fontSize.base, fontWeight: '700' },
  info: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[800] },
  time: { fontSize: fontSize.xs, color: colors.gray[400] },
  preview: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  badge: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.brand.primary, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, color: colors.white, fontWeight: '700' },
  separator: { height: 1, backgroundColor: colors.gray[100], marginLeft: 80 },
});
