import { useState } from 'react';
import { Modal } from './Modal.jsx';
import { Button } from './ui.jsx';

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  confirmLabel = 'Delete',
  children,
}) {
  const [working, setWorking] = useState(false);

  const confirm = async () => {
    setWorking(true);
    try {
      await onConfirm();
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={working}>
            Keep it
          </Button>
          <Button variant="danger" onClick={confirm} disabled={working}>
            {working ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-soft">{children}</p>
    </Modal>
  );
}
