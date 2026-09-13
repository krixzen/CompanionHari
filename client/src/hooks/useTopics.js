import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';

/** Loads and keeps the topic list for one subject, with search and filters. */
export function useTopics(subjectId, filters) {
  const [topics, setTopics] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const { status: statusFilter, difficulty, q } = filters ?? {};

  const load = useCallback(async () => {
    if (!subjectId) return;
    setStatus('loading');
    try {
      setTopics(
        await api.topics.list({
          subject_id: subjectId,
          status: statusFilter,
          difficulty,
          q,
        })
      );
      setStatus('ready');
      setError(null);
    } catch (caught) {
      setError(caught.message);
      setStatus('error');
    }
  }, [subjectId, statusFilter, difficulty, q]);

  useEffect(() => {
    load();
  }, [load]);

  return { topics, setTopics, status, error, reload: load };
}

/** Debounces a value so typing in the search box does not hit the API per key. */
export function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
