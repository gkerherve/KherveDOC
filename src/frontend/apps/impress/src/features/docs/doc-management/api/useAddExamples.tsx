import { useMutation, useQueryClient } from '@tanstack/react-query';

import { APIError, errorCauses, fetchAPI } from '@/api';

import { KEY_LIST_DOC } from './useDocs';

/**
 * Adds an "Examples" folder to the user's documents: documents,
 * spreadsheets and slides to learn from. Returns the folder's id.
 */
export const addExamples = async (): Promise<{ id: string }> => {
  const response = await fetchAPI(`documents/examples/`, { method: 'POST' });
  if (!response.ok) {
    throw new APIError(
      'Failed to add the examples',
      await errorCauses(response),
    );
  }
  return response.json() as Promise<{ id: string }>;
};

export function useAddExamples({
  onSuccess,
}: {
  onSuccess: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  return useMutation<{ id: string }, APIError>({
    mutationFn: addExamples,
    onSuccess: ({ id }) => {
      void queryClient.resetQueries({ queryKey: [KEY_LIST_DOC] });
      onSuccess(id);
    },
  });
}
