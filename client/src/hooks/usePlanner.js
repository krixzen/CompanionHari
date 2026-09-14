import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { addDays } from '../lib/week.js';

/**
 * Everything one week of the calendar needs: the blocks on it, the weekly
 * commitments behind them, the planner's settings and the topics still
 * waiting for a slot — either for a first pass, or (having been marked
 * "Revised" already, whether through this app or before it) for revision.
 */
export function usePlanner(mondayIso) {
  const [entries, setEntries] = useState([]);
  const [anchors, setAnchors] = useState([]);
  const [settings, setSettings] = useState(null);
  const [term, setTerm] = useState(null);
  const [unscheduled, setUnscheduled] = useState([]);
  const [needsRevision, setNeedsRevision] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [loadedEntries, loadedAnchors, loadedSettings, loadedTerm, loadedUnscheduled, loadedNeedsRevision] =
        await Promise.all([
          api.plan.list(mondayIso, addDays(mondayIso, 6)),
          api.anchors.effective(mondayIso, addDays(mondayIso, 6)),
          api.settings.planner(),
          api.settings.term(),
          api.plan.unscheduled(),
          api.plan.needsRevision(),
        ]);
      setEntries(loadedEntries);
      setAnchors(loadedAnchors);
      setSettings(loadedSettings);
      setTerm(loadedTerm);
      setUnscheduled(loadedUnscheduled);
      setNeedsRevision(loadedNeedsRevision);
      setStatus('ready');
      setError(null);
    } catch (caught) {
      setError(caught.message);
      setStatus('error');
    }
  }, [mondayIso]);

  useEffect(() => {
    load();
  }, [load]);

  /** Reloads the blocks, commitments and the waiting lists without flashing a spinner. */
  const refresh = useCallback(async () => {
    const [loadedEntries, loadedAnchors, loadedUnscheduled, loadedNeedsRevision] = await Promise.all([
      api.plan.list(mondayIso, addDays(mondayIso, 6)),
      api.anchors.effective(mondayIso, addDays(mondayIso, 6)),
      api.plan.unscheduled(),
      api.plan.needsRevision(),
    ]);
    setEntries(loadedEntries);
    setAnchors(loadedAnchors);
    setUnscheduled(loadedUnscheduled);
    setNeedsRevision(loadedNeedsRevision);
  }, [mondayIso]);

  return {
    entries,
    setEntries,
    anchors,
    settings,
    setSettings,
    term,
    unscheduled,
    needsRevision,
    status,
    error,
    reload: load,
    refresh,
  };
}
