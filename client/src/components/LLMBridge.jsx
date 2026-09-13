import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './Modal.jsx';
import { Button, TextArea } from './ui.jsx';
import { parseAndValidate } from '../lib/jsonSchema.js';

/**
 * The bridge between this app and a chat assistant.
 *
 * This app never talks to an AI service. Instead it writes the prompt, you
 * paste it into Claude or ChatGPT yourself, and paste the reply back here.
 * The reply is checked against an expected shape before anything is saved.
 *
 * It is deliberately generic: give it a prompt, a JSON schema and a save
 * handler, and it works for any feature. Phase 4's test analysis uses the very
 * same component.
 *
 * Props:
 *   prompt        string        — the text to copy into the assistant
 *   schema        object        — JSON Schema the reply must match
 *   renderPreview (data) => JSX — how to show the parsed reply for review
 *   onSave        (data) => any — called only after you confirm the preview
 */
export function LLMBridge({
  open,
  onClose,
  title = 'Ask Claude or ChatGPT',
  purpose,
  prompt,
  schema,
  renderPreview,
  onSave,
  saveLabel = 'Save',
}) {
  const [pasted, setPasted] = useState('');
  const [result, setResult] = useState(null); // { ok, data, errors }
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const pasteRef = useRef(null);

  // Reopening the bridge should always start from a clean slate.
  useEffect(() => {
    if (open) {
      setPasted('');
      setResult(null);
      setCopied(false);
      setSaving(false);
      setSaveError(null);
    }
  }, [open]);

  const preview = useMemo(
    () => (result?.ok && renderPreview ? renderPreview(result.data) : null),
    [result, renderPreview]
  );

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      // Clipboard permissions vary between browsers; selecting the text so it
      // can be copied by hand is a dependable fallback.
      const box = document.getElementById('llm-bridge-prompt');
      if (box) {
        box.focus();
        box.select();
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    pasteRef.current?.focus();
  };

  const parse = () => {
    setSaveError(null);
    setResult(parseAndValidate(pasted, schema));
  };

  const save = async () => {
    if (!result?.ok) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(result.data);
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={purpose}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          {result?.ok ? (
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : saveLabel}
            </Button>
          ) : (
            <Button variant="primary" onClick={parse} disabled={!pasted.trim()}>
              Parse &amp; preview
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-6">
        {/* ---- Top half: the prompt to copy ---- */}
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">1. Copy this prompt</h3>
            <Button variant="primary" size="sm" onClick={copyPrompt}>
              {copied ? 'Copied ✓' : 'Copy prompt'}
            </Button>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            Paste it into Claude or ChatGPT, then copy the whole reply back here. Nothing is sent
            anywhere by this app.
          </p>
          <textarea
            id="llm-bridge-prompt"
            readOnly
            value={prompt}
            rows={8}
            onFocus={(event) => event.target.select()}
            className="mt-3 w-full resize-y rounded-xl bg-paper-sunk p-3 font-mono text-xs leading-relaxed text-ink-soft focus:outline-none focus:ring-2 focus:ring-sage-200"
          />
        </section>

        {/* ---- Bottom half: the reply to paste back ---- */}
        <section>
          <h3 className="text-sm font-semibold text-ink">2. Paste the reply</h3>
          <TextArea
            ref={pasteRef}
            rows={8}
            value={pasted}
            placeholder="Paste the assistant's whole answer here. Code fences are fine — they are stripped automatically."
            onChange={(event) => {
              setPasted(event.target.value);
              if (result) setResult(null);
            }}
            className="mt-2 font-mono text-xs"
          />
        </section>

        {result && !result.ok && (
          <section className="rounded-xl2 bg-amber-50 px-4 py-3">
            <h3 className="text-sm font-semibold text-amber-900">That reply could not be used yet</h3>
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
              {result.errors.map((error) => (
                <li key={error} className="flex gap-2">
                  <span aria-hidden="true">•</span>
                  <span>{error}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-amber-800">
              Fix it in the box above, or ask the assistant to try again, then press Parse &amp;
              preview.
            </p>
          </section>
        )}

        {result?.ok && (
          <section className="rounded-xl2 border border-sage-200 bg-sage-50 px-4 py-3">
            <h3 className="text-sm font-semibold text-sage-800">
              3. Check this over before saving
            </h3>
            <div className="mt-3">
              {preview ?? (
                <pre className="max-h-64 overflow-auto rounded-xl bg-paper-raised p-3 text-xs text-ink-soft">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              )}
            </div>
            {saveError && <p className="mt-3 text-sm text-amber-800">{saveError}</p>}
          </section>
        )}
      </div>
    </Modal>
  );
}
