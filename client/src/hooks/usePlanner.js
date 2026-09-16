import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { addDays } from '../lib/week.js';

/**
 * Everything one week of the calendar needs: the blocks on it, the weekly
 * commitments behind them, the planner's settings, and the master-list
 * items still pending a slot (each chapter's five-stage practice cycle,
 * one row per stage not yet scheduled or done).
 */
export function usePlanner(mondayIso) {
  const [entries, setEntries] = useState([]);
  const [anchors, setAnchors] = useState([]);
  const [settings, setSettings] = useState(null);
  const [term, setTerm] = useState(null);
  const [pendingItems, setPendingItems] = useState([]);
  const [studyBlocks, setStudyBlocks] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [loadedEntries, loadedAnchors, loadedSettings, loadedTerm, loadedPendingItems, loadedStudyBlocks] =
        await Promise.all([
          api.plan.list(mondayIso, addDays(mondayIso, 6)),
          api.anchors.effective(mondayIso, addDays(mondayIso, 6)),
          api.settings.planner(),
          api.settings.term(),
          api.practiceItems.list({ status: 'pending' }),
          api.studyBlocks.list(),
        ]);
      setEntries(loadedEntries);
      setAnchors(loadedAnchors);
      setSettings(loadedSettings);
      setTerm(loadedTerm);
      setPendingItems(loadedPendingItems);
      setStudyBlocks(loadedStudyBlocks);
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

  /** Reloads the blocks, commitments and the waiting list without flashing a spinner. */
  const refresh = useCallback(async () => {
    const [loadedEntries, loadedAnchors, loadedPendingItems] = await Promise.all([
      api.plan.list(mondayIso, addDays(mondayIso, 6)),
      api.anchors.effective(mondayIso, addDays(mondayIso, 6)),
      api.practiceItems.list({ status: 'pending' }),
    ]);
    setEntries(loadedEntries);
    setAnchors(loadedAnchors);
    setPendingItems(loadedPendingItems);
  }, [mondayIso]);

  return {
    entries,
    setEntries,
    anchors,
    settings,
    setSettings,
    term,
    pendingItems,
    studyBlocks,
    status,
    error,
    reload: load,
    refresh,
  };
}
