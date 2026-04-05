import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/shared/services/apiClient';

/**
 * Fetch notes for a specific student
 * @param {string} studentId 
 * @param {Object} options 
 * @returns {Promise<Object>}
 */
const fetchStudentNotes = async (studentId, { includePrivate = true, limit = 50, offset = 0 } = {}) => {
  const params = new URLSearchParams();
  if (includePrivate) params.append('includePrivate', 'true');
  if (limit) params.append('limit', String(limit));
  if (offset) params.append('offset', String(offset));
  
  const url = `/instructors/me/students/${studentId}/notes${params.toString() ? `?${params}` : ''}`;
  const { data } = await apiClient.get(url);
  return data;
};

/**
 * Create a new note for a student
 * @param {string} studentId 
 * @param {Object} noteData 
 * @returns {Promise<Object>}
 */
const createNote = async (studentId, noteData) => {
  const { data } = await apiClient.post(`/instructors/me/students/${studentId}/notes`, noteData);
  return data;
};

/**
 * Update an existing note
 * @param {string} noteId 
 * @param {Object} noteData 
 * @returns {Promise<Object>}
 */
const updateNote = async (noteId, noteData) => {
  const { data } = await apiClient.put(`/instructors/me/notes/${noteId}`, noteData);
  return data;
};

/**
 * Delete a note
 * @param {string} noteId 
 * @returns {Promise<void>}
 */
const deleteNote = async (noteId) => {
  await apiClient.delete(`/instructors/me/notes/${noteId}`);
};

/**
 * Hook to fetch and manage instructor notes for a student
 * @param {string} studentId 
 * @param {Object} options 
 * @returns {Object}
 */
export function useInstructorStudentNotes(studentId, { includePrivate = true, limit = 50, enabled = true } = {}) {
  const queryClient = useQueryClient();
  const queryKey = ['instructor', 'student-notes', studentId, { includePrivate, limit }];

  const notesQuery = useQuery({
    queryKey,
    queryFn: () => fetchStudentNotes(studentId, { includePrivate, limit }),
    enabled: enabled && !!studentId,
    staleTime: 60_000
  });

  const createMutation = useMutation({
    mutationFn: (noteData) => createNote(studentId, noteData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructor', 'student-notes', studentId] });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ noteId, ...noteData }) => updateNote(noteId, noteData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructor', 'student-notes', studentId] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId) => deleteNote(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructor', 'student-notes', studentId] });
    }
  });

  return {
    notes: notesQuery.data?.notes ?? [],
    isLoading: notesQuery.isLoading,
    isFetching: notesQuery.isFetching,
    error: notesQuery.error,
    refetch: notesQuery.refetch,
    createNote: createMutation.mutateAsync,
    updateNote: updateMutation.mutateAsync,
    deleteNote: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending
  };
}

export default useInstructorStudentNotes;
