import { useEffect, useState } from 'react';
import { Modal } from './Modal.jsx';
import { Button, TextInput } from './ui.jsx';

/** Asked right before an automatic AI plan runs, when a PIN is set up for it. */
export function PinPrompt({ open, onClose, onConfirm, error }) {
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (open) setPin('');
  }, [open]);

  const confirm = () => {
    if (!pin.trim()) return;
    onConfirm(pin.trim());
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enter the planning PIN"
      description="This request will call the AI service and use a small amount on that account."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} disabled={!pin.trim()}>
            Plan it
          </Button>
        </>
      }
    >
      <TextInput
        type="password"
        inputMode="numeric"
        autoFocus
        value={pin}
        onChange={(event) => setPin(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && confirm()}
        placeholder="PIN"
      />
      {error && <p className="mt-2 text-sm text-amber-800">{error}</p>}
    </Modal>
  );
}
