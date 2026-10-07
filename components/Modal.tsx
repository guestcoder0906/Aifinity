import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onCancel}></div>
      <div className="relative bg-neutral-900 border border-neutral-700 p-6 rounded-lg shadow-2xl max-w-sm w-full">
        <h3 className="text-xl font-bold text-red-500 mb-4">Reset World?</h3>
        <p className="text-gray-300 mb-6 text-sm leading-relaxed">
          This will permanently delete all world files and restart the simulation. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button 
            onClick={onCancel}
            className="px-4 py-2 rounded border border-neutral-600 text-gray-300 hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-500 transition-colors font-bold"
          >
            Reset Everything
          </button>
        </div>
      </div>
    </div>
  );
};

export default Modal;