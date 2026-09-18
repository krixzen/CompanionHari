import { useEffect, useState } from 'react';
import { Modal } from './Modal.jsx';
import { Button, Field, TextInput } from './ui.jsx';

/**
 * Set-up for the one feature that breaks this app's "everything stays on
 * your machine" rule on purpose: automatic, no-copy-paste AI planning.
 * It needs an API key from an AI provider's own account — this app never
 * ships or shares one — and that key is stored locally and only ever sent
 * in the one request that actually calls the AI service.
 */
export function AiSettingsDialog({ open, onClose, status, onSave }) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('claude-sonnet-5');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setApiKey('');
      setModel(status?.model || 'claude-sonnet-5');
      setPin('');
      setError(null);
    }
  }, [open, status]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const changes = { model };
      if (apiKey.trim()) changes.api_key = apiKey.trim();
      if (pin.trim()) changes.pin = pin.trim();
      await onSave(changes);
      onClose();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  };

  const clearPin = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ pin: '' });
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Automatic AI planning"
      description="Lets 'Plan automatically with AI' fetch a schedule for you, chunk by chunk, without you copying anything into Claude or ChatGPT by hand."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl2 bg-paper-sunk p-3 text-sm text-ink-soft">
          This is the one feature in the app that sends anything off your machine. Using it means
          your topics, availability and schedule go to whichever AI account this key belongs to,
          for the one request that generates each chunk of the plan — and each request costs a
          small amount on that account. Everything else in the app stays fully local either way.
        </div>

        <Field
          label="Anthropic API key"
          hint={
            status?.has_key
              ? 'A key is already saved. Paste a new one to replace it, or leave this blank to keep the current one.'
              : 'Create one at console.anthropic.com, then paste it here. It is stored only on this machine.'
          }
        >
          <TextInput
            type="password"
            autoComplete="off"
            placeholder={status?.has_key ? '••••••••••••••••' : 'sk-ant-…'}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </Field>

        <Field label="Model" hint="The model used for every automatic planning request.">
          <TextInput value={model} onChange={(event) => setModel(event.target.value)} />
        </Field>

        <Field
          label="Planning PIN (optional)"
          hint={
            status?.has_pin
              ? 'A PIN is set — it will be asked for every time before an automatic plan runs. Enter a new one to replace it, or use "Remove PIN" below to drop it.'
              : '4–8 digits. If set, this is asked for every time before an automatic plan runs — so a paid API call never fires without whoever holds the PIN agreeing to it.'
          }
        >
          <TextInput
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder={status?.has_pin ? '••••' : 'e.g. 4821'}
            value={pin}
            onChange={(event) => setPin(event.target.value)}
          />
        </Field>
        {status?.has_pin && (
          <Button variant="ghost" size="sm" onClick={clearPin} disabled={saving}>
            Remove PIN
          </Button>
        )}

        {error && <p className="text-sm text-amber-800">{error}</p>}
      </div>
    </Modal>
  );
}
