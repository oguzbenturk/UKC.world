import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoadingSpinner, ErrorState } from '../../../src/components/ui';
import { colors, spacing, fontSize } from '../../../src/constants';
import { apiClient } from '../../../src/api/client';
import { formatRelative } from '../../../src/utils/date';
import { useAuth } from '../../../src/hooks/useAuth';
import { haptics } from '../../../src/services/haptics';
import type { ChatMessage } from '../../../src/types';

function MessageBubble({ message, isMe }: { message: ChatMessage; isMe: boolean }) {
  return (
    <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
      <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
        {message.content}
      </Text>
      <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
        {formatRelative(message.createdAt)}
      </Text>
    </View>
  );
}

export default function ChatRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);

  const { data: messages, isLoading, error, refetch } = useQuery({
    queryKey: ['chat', 'messages', id],
    queryFn: async () => {
      const { data } = await apiClient.get<{ messages: ChatMessage[] }>(`/chat/rooms/${id}/messages`);
      return data.messages ?? [];
    },
    staleTime: 30 * 1000,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) => apiClient.post(`/chat/rooms/${id}/messages`, { content, type: 'text' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', id] });
      setText('');
      haptics.light();
    },
    onError: () => haptics.error(),
  });

  const handleSend = () => {
    if (!text.trim()) return;
    sendMutation.mutate(text.trim());
  };

  if (isLoading) return <LoadingSpinner fullScreen />;
  if (error) return <ErrorState onRetry={refetch} />;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <MessageBubble message={item} isMe={item.senderId === user?.id} />
          )}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => listRef.current?.scrollToEnd()}
          inverted={false}
        />
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={t('chat.typeMessage')}
            placeholderTextColor={colors.gray[400]}
            multiline
            maxLength={1000}
          />
          <Pressable
            onPress={handleSend}
            disabled={!text.trim() || sendMutation.isPending}
            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t('chat.send')}
          >
            <Text style={styles.sendIcon}>➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.gray[50] },
  flex: { flex: 1 },
  messageList: { padding: spacing.md, paddingBottom: spacing.sm },
  bubble: { maxWidth: '75%', borderRadius: 16, padding: spacing.sm + 4, marginBottom: spacing.sm },
  bubbleMe: { alignSelf: 'flex-end', backgroundColor: colors.brand.primary, borderBottomRightRadius: 4 },
  bubbleThem: { alignSelf: 'flex-start', backgroundColor: colors.white, borderBottomLeftRadius: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  bubbleText: { fontSize: fontSize.base, lineHeight: 20 },
  bubbleTextMe: { color: colors.white },
  bubbleTextThem: { color: colors.gray[800] },
  bubbleTime: { fontSize: 10, color: 'rgba(0,0,0,0.3)', marginTop: 2 },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.6)', textAlign: 'right' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: spacing.sm, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.gray[200], gap: spacing.sm },
  input: { flex: 1, maxHeight: 100, backgroundColor: colors.gray[100], borderRadius: 20, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.base, color: colors.gray[800] },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.gray[300] },
  sendIcon: { color: colors.white, fontSize: 16 },
});
