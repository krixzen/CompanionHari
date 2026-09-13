import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { addDays } from '../lib/week.js';

/**
 * Everything one week of the calendar needs: the blocks on it, the weekly
 * commitments behind them, the planner's settings and the topics still
 * waiting for a slot.
 */
export function usePlanner(mondayIso) {
  const [entries, setEntries] = useState([]);
  const [anchors, setAnchors] = useState([]);
  const [settings, setSettings] = useState(null);
  const [unscheduled, setUnscheduled] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [loadedEntries, loadedAnchors, loadedSettings, loadedUnscheduled] = await Promise.all([
        api.plan.list(mondayIso, addDays(mondayIso, 6)),
        api.anchors.effective(mondayIso, addDays(mondayIso, 6)),
        api.settings.planner(),
        api.plan.unscheduled(),
      ]);
      setEntries(loadedEntries);
      setAnchors(loadedAnchors);
      setSettings(loadedSettings);
      setUnscheduled(loadedUnscheduled);
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

  /** Reloads the blocks and the waiting list without flashing a spinner. */
  const refresh = useCallback(async () => {
    const [loadedEntries, loadedUnscheduled] = await Promise.all([
      api.plan.list(mondayIso, addDays(mondayIso, 6)),
      api.plan.unscheduled(),
    ]);
    setEntries(loadedEntries);
    setUnscheduled(loadedUnscheduled);
  }, [mondayIso]);

  return {
    entries,
    setEntries,
    anchors,
    settings,
    setSettings,
    unscheduled,
    status,
    error,
    reload: load,
    refresh,
  };
}
