import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar } from 'react-native-calendars';
import { Screen, Button, Card, LoadingSpinner } from '../../../src/components/ui';
import { colors, spacing, fontSize } from '../../../src/constants';
import { apiClient } from '../../../src/api/client';
import { haptics } from '../../../src/services/haptics';
import type { Service } from '../../../src/types';

type Step = 'service' | 'date' | 'time' | 'confirm';

const TIME_SLOTS = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];

export default function NewBookingScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('service');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');

  const { data: services, isLoading } = useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ services: Service[] }>('/services');
      return data.services ?? [];
    },
  });

  const bookMutation = useMutation({
    mutationFn: () => apiClient.post('/bookings', {
      serviceId: selectedService!.id,
      date: selectedDate,
      startTime: selectedTime,
      paymentMethod: 'wallet',
    }),
    onSuccess: () => {
      haptics.success();
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      router.back();
      Alert.alert('✅', 'Booking confirmed!');
    },
    onError: () => {
      haptics.error();
      Alert.alert('', t('errors.unknown'));
    },
  });

  if (isLoading) return <LoadingSpinner fullScreen />;

  return (
    <Screen scrollable padded>
      {/* Step: Service Selection */}
      {step === 'service' && (
        <View>
          <Text style={styles.stepTitle}>{t('bookings.selectService')}</Text>
          <View style={styles.serviceList}>
            {services?.map((service) => (
              <Pressable
                key={service.id}
                onPress={() => { setSelectedService(service); setStep('date'); }}
                style={[styles.serviceCard, selectedService?.id === service.id && styles.serviceCardSelected]}
                accessibilityRole="button"
                accessibilityLabel={service.name}
              >
                <Text style={styles.serviceName}>{service.name}</Text>
                <Text style={styles.serviceDetails}>{service.duration}h · {service.price} {service.currency}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Step: Date Selection */}
      {step === 'date' && (
        <View>
          <Text style={styles.stepTitle}>{t('bookings.selectDate')}</Text>
          <Calendar
            onDayPress={(day) => { setSelectedDate(day.dateString); setStep('time'); }}
            markedDates={selectedDate ? { [selectedDate]: { selected: true, selectedColor: colors.brand.primary } } : {}}
            minDate={new Date().toISOString().split('T')[0]}
            theme={{
              selectedDayBackgroundColor: colors.brand.primary,
              todayTextColor: colors.brand.primary,
              arrowColor: colors.brand.primary,
            }}
          />
          <Button title={t('common.back')} onPress={() => setStep('service')} variant="ghost" style={styles.backBtn} />
        </View>
      )}

      {/* Step: Time Selection */}
      {step === 'time' && (
        <View>
          <Text style={styles.stepTitle}>{t('bookings.selectTime')}</Text>
          <View style={styles.timeGrid}>
            {TIME_SLOTS.map((time) => (
              <Pressable
                key={time}
                onPress={() => { setSelectedTime(time); setStep('confirm'); }}
                style={[styles.timeSlot, selectedTime === time && styles.timeSlotSelected]}
                accessibilityRole="button"
                accessibilityLabel={time}
              >
                <Text style={[styles.timeText, selectedTime === time && styles.timeTextSelected]}>{time}</Text>
              </Pressable>
            ))}
          </View>
          <Button title={t('common.back')} onPress={() => setStep('date')} variant="ghost" style={styles.backBtn} />
        </View>
      )}

      {/* Step: Confirm */}
      {step === 'confirm' && selectedService && (
        <View>
          <Text style={styles.stepTitle}>{t('bookings.summary')}</Text>
          <Card style={styles.summaryCard}>
            <Text style={styles.summaryService}>{selectedService.name}</Text>
            <Text style={styles.summaryMeta}>📅 {selectedDate} · {selectedTime}</Text>
            <Text style={styles.summaryPrice}>{selectedService.price} {selectedService.currency}</Text>
          </Card>
          <Button
            title={t('bookings.confirmBooking')}
            onPress={() => bookMutation.mutate()}
            loading={bookMutation.isPending}
            style={styles.confirmBtn}
          />
          <Button title={t('common.back')} onPress={() => setStep('time')} variant="ghost" style={styles.backBtn} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[800], marginBottom: spacing.md },
  serviceList: { gap: spacing.sm },
  serviceCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.gray[200],
  },
  serviceCardSelected: { borderColor: colors.brand.primary, backgroundColor: '#EFF6FF' },
  serviceName: { fontSize: fontSize.base, fontWeight: '700', color: colors.gray[800] },
  serviceDetails: { fontSize: fontSize.sm, color: colors.gray[500], marginTop: 2 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  timeSlot: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    backgroundColor: colors.white,
    minWidth: 80,
    alignItems: 'center',
  },
  timeSlotSelected: { borderColor: colors.brand.primary, backgroundColor: colors.brand.primary },
  timeText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray[700] },
  timeTextSelected: { color: colors.white },
  backBtn: { marginTop: spacing.md },
  summaryCard: { marginBottom: spacing.md, gap: spacing.sm },
  summaryService: { fontSize: fontSize.lg, fontWeight: '700', color: colors.gray[800] },
  summaryMeta: { fontSize: fontSize.base, color: colors.gray[600] },
  summaryPrice: { fontSize: fontSize.xl, fontWeight: '800', color: colors.brand.primary },
  confirmBtn: { marginBottom: spacing.sm },
});
