import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const StudyDataContext = createContext(null);

/**
 * Holds the two things every screen needs — who is studying, and which
 * subjects exist — so they are fetched once rather than on every navigation.
 */
export function StudyDataProvider({ children }) {
  const [student, setStudent] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [loadedStudent, loadedSubjects] = await Promise.all([
        api.student.get(),
        api.subjects.list(),
      ]);
      setStudent(loadedStudent);
      setSubjects(loadedSubjects);
      setStatus('ready');
      setError(null);
    } catch (caught) {
      setError(caught.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshSubjects = useCallback(async () => {
    setSubjects(await api.subjects.list());
  }, []);

  const value = useMemo(
    () => ({
      student,
      subjects,
      status,
      error,
      reload: load,
      refreshSubjects,
      setSubjects,
      saveStudent: async (changes) => {
        const updated = await api.student.update(changes);
        setStudent(updated);
        return updated;
      },
    }),
    [student, subjects, status, error, load, refreshSubjects]
  );

  return <StudyDataContext.Provider value={value}>{children}</StudyDataContext.Provider>;
}

export function useStudyData() {
  const context = useContext(StudyDataContext);
  if (!context) throw new Error('useStudyData must be used inside a StudyDataProvider.');
  return context;
}
