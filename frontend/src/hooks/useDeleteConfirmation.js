import { createContext, useContext } from 'react';

export const DeleteConfirmationContext = createContext(null);

export function useDeleteConfirmation() {
  const context = useContext(DeleteConfirmationContext);
  if (!context) {
    return {
      confirmDelete: ({ onConfirm }) => onConfirm?.(),
    };
  }
  return context;
}
