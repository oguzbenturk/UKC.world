import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  Form,
  Input,
  Modal,
  Space,
  Switch,
  Typography,
  Tag,
  Divider,
  Radio
} from 'antd';
import {
  EditOutlined,
  LockOutlined,
  UnlockOutlined,
  PushpinOutlined,
  UserOutlined,
  CalendarOutlined,
  BookOutlined
} from '@ant-design/icons';
import { useInstructorStudentNotes } from '../hooks/useInstructorStudentNotes';

const { Text, Title, Paragraph } = Typography;

// Header component
const ModalHeader = ({ t }) => (
  <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 px-6 py-6 text-white">
    <div className="flex items-center gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/30 bg-white/20 shadow-lg backdrop-blur">
        <EditOutlined className="text-2xl text-white" />
      </div>
      <div>
        <Title level={4} className="!mb-0 !text-white">{t('instructor:lessonNote.title')}</Title>
        <Text className="text-white/80">{t('instructor:lessonNote.subtitle')}</Text>
      </div>
    </div>
  </div>
);

// Lesson info component
const LessonInfo = ({ studentName, serviceName, lessonDate }) => (
  <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
    <div className="flex items-center gap-4">
      <Avatar size={48} icon={<UserOutlined />} className="bg-gradient-to-br from-sky-400 to-indigo-500">
        {studentName[0]?.toUpperCase()}
      </Avatar>
      <div className="flex-1">
        <Text strong className="text-lg">{studentName}</Text>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <Tag icon={<BookOutlined />} color="blue">{serviceName}</Tag>
          {lessonDate && <Tag icon={<CalendarOutlined />} color="default">{lessonDate}</Tag>}
        </div>
      </div>
    </div>
  </div>
);

LessonInfo.propTypes = {
  studentName: PropTypes.string.isRequired,
  serviceName: PropTypes.string.isRequired,
  lessonDate: PropTypes.string
};

// Visibility selector component
const VisibilitySelector = ({ visibility, setVisibility, t }) => (
  <Form.Item
    name="visibility"
    label={
      <Space>
        {visibility === 'student_visible' ? <UnlockOutlined className="text-emerald-500" /> : <LockOutlined className="text-amber-500" />}
        <Text className="text-slate-600">{t('instructor:lessonNote.visibility')}</Text>
      </Space>
    }
    initialValue="student_visible"
  >
    <Radio.Group onChange={(e) => setVisibility(e.target.value)} className="w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Radio.Button
          value="student_visible"
          className="h-auto rounded-xl border-2 p-4 text-left hover:border-emerald-300"
          style={{ borderColor: visibility === 'student_visible' ? '#10b981' : undefined, backgroundColor: visibility === 'student_visible' ? '#ecfdf5' : undefined }}
        >
          <div className="flex items-start gap-3">
            <UnlockOutlined className="mt-1 text-emerald-500" />
            <div>
              <Text strong>{t('instructor:lessonNote.studentVisible')}</Text>
              <Paragraph className="!mb-0 text-xs text-slate-500">{t('instructor:lessonNote.studentVisibleDesc')}</Paragraph>
            </div>
          </div>
        </Radio.Button>
        <Radio.Button
          value="instructor_only"
          className="h-auto rounded-xl border-2 p-4 text-left hover:border-amber-300"
          style={{ borderColor: visibility === 'instructor_only' ? '#f59e0b' : undefined, backgroundColor: visibility === 'instructor_only' ? '#fffbeb' : undefined }}
        >
          <div className="flex items-start gap-3">
            <LockOutlined className="mt-1 text-amber-500" />
            <div>
              <Text strong>{t('instructor:lessonNote.privateNote')}</Text>
              <Paragraph className="!mb-0 text-xs text-slate-500">{t('instructor:lessonNote.privateNoteDesc')}</Paragraph>
            </div>
          </div>
        </Radio.Button>
      </div>
    </Radio.Group>
  </Form.Item>
);

VisibilitySelector.propTypes = {
  visibility: PropTypes.string.isRequired,
  setVisibility: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired
};

// Pin option component
const PinOption = ({ t }) => (
  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <PushpinOutlined className="text-lg text-indigo-500" />
        <div>
          <Text strong className="text-slate-700">{t('instructor:lessonNote.pinNote')}</Text>
          <Paragraph className="!mb-0 text-xs text-slate-500">{t('instructor:lessonNote.pinNoteDesc')}</Paragraph>
        </div>
      </div>
      <Form.Item name="isPinned" valuePropName="checked" className="!mb-0">
        <Switch />
      </Form.Item>
    </div>
  </div>
);

// Submit buttons component
const SubmitButtons = ({ isCreating, onSubmit, onCancel, t }) => (
  <>
    <button
      type="button"
      onClick={onSubmit}
      disabled={isCreating}
      className="mt-6 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 font-semibold text-white shadow-lg transition-all duration-200 hover:from-indigo-600 hover:to-purple-700 hover:shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isCreating ? (
        <span className="flex items-center justify-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          {t('instructor:lessonNote.saving')}
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2"><EditOutlined />{t('instructor:lessonNote.saveNote')}</span>
      )}
    </button>
    <button
      type="button"
      onClick={onCancel}
      disabled={isCreating}
      className="mt-3 w-full rounded-lg px-4 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
    >
      {t('instructor:lessonNote.cancel')}
    </button>
  </>
);

SubmitButtons.propTypes = {
  isCreating: PropTypes.bool.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired
};

/**
 * Modal for instructors to add notes about a lesson/student
 * Can be used after lesson checkout or from student detail page
 */
// eslint-disable-next-line complexity
export const LessonNoteModal = ({
  open = false,
  lesson = null,
  onClose = undefined,
  onSuccess = undefined
}) => {
  const { t } = useTranslation(['instructor']);
  const [form] = Form.useForm();
  const [visibility, setVisibility] = useState('student_visible');

  const studentId = lesson?.studentId || lesson?.student?.id;
  const { createNote, isCreating } = useInstructorStudentNotes(studentId, { enabled: false });

  const shouldShowModal = open && Boolean(lesson) && Boolean(studentId);

  useEffect(() => {
    if (shouldShowModal) {
      form.setFieldsValue({ note: '', visibility: 'student_visible', isPinned: false });
      setVisibility('student_visible');
    } else {
      form.resetFields();
    }
  }, [shouldShowModal, form]);

  const studentName = lesson?.studentName || lesson?.student?.name || 'Student';
  const serviceName = lesson?.serviceName || lesson?.service?.name || 'Lesson';
  const lessonDate = lesson?.date || lesson?.lessonDate || null;

  const handleSubmit = async () => {
    if (!lesson || !studentId) return;
    try {
      const values = await form.validateFields();
      await createNote({
        bookingId: lesson.bookingId || lesson.id,
        note: values.note,
        visibility: values.visibility,
        isPinned: values.isPinned || false,
        metadata: { lessonDate, serviceName }
      });
      form.resetFields();
      onSuccess?.();
      onClose?.(true);
    } catch {
      // Form validation will show errors, mutation errors are handled by the hook
    }
  };

  return (
    <Modal
      open={shouldShowModal}
      title={null}
      destroyOnHidden
      forceRender
      footer={null}
      onCancel={() => onClose?.(false)}
      width={520}
      centered
      styles={{ body: { padding: 0 } }}
    >
      {lesson && studentId ? (
        <div className="overflow-hidden rounded-lg">
          <ModalHeader t={t} />
          <LessonInfo studentName={studentName} serviceName={serviceName} lessonDate={lessonDate} />
          <div className="px-6 py-6">
            <Form layout="vertical" form={form} requiredMark={false}>
              <Form.Item
                name="note"
                label={<Text className="text-slate-600">{t('instructor:lessonNote.yourNotes')}</Text>}
                rules={[{ required: true, message: t('instructor:lessonNote.pleaseEnterNotes') }]}
              >
                <Input.TextArea
                  rows={4}
                  maxLength={2000}
                  showCount
                  placeholder={t('instructor:lessonNote.notesPlaceholder')}
                  className="rounded-xl"
                />
              </Form.Item>
              <Divider className="my-4" />
              <VisibilitySelector visibility={visibility} setVisibility={setVisibility} t={t} />
              <PinOption t={t} />
              <SubmitButtons isCreating={isCreating} onSubmit={handleSubmit} onCancel={() => onClose?.(false)} t={t} />
            </Form>
          </div>
        </div>
      ) : (
        <div className="p-6 text-center">
          <Paragraph style={{ marginBottom: 0 }}>
            {t('instructor:lessonNote.noLessonDetails')}
          </Paragraph>
          <Form form={form} style={{ display: 'none' }} />
        </div>
      )}
    </Modal>
  );
};

LessonNoteModal.propTypes = {
  open: PropTypes.bool,
  lesson: PropTypes.shape({
    id: PropTypes.string,
    bookingId: PropTypes.string,
    studentId: PropTypes.string,
    studentName: PropTypes.string,
    student: PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string
    }),
    serviceName: PropTypes.string,
    service: PropTypes.shape({
      name: PropTypes.string
    }),
    date: PropTypes.string,
    lessonDate: PropTypes.string
  }),
  onClose: PropTypes.func,
  onSuccess: PropTypes.func
};

export default LessonNoteModal;
