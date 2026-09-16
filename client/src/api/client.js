const BASE = '/api';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, formData } = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: formData ? undefined : { 'Content-Type': 'application/json' },
      body: formData ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
  } catch {
    throw new ApiError(
      'Could not reach the app’s own server. Check that the terminal window running it is still open.',
      0
    );
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(payload.error || `Something went wrong (${response.status}).`, response.status);
  }
  return payload;
}

const query = (params) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  }
  const string = search.toString();
  return string ? `?${string}` : '';
};

export const api = {
  student: {
    get: () => request('/student').then((r) => r.student),
    update: (changes) => request('/student', { method: 'PATCH', body: changes }).then((r) => r.student),
  },

  subjects: {
    list: () => request('/subjects').then((r) => r.subjects),
    get: (id) => request(`/subjects/${id}`).then((r) => r.subject),
    create: (subject) => request('/subjects', { method: 'POST', body: subject }).then((r) => r.subject),
    update: (id, changes) =>
      request(`/subjects/${id}`, { method: 'PATCH', body: changes }).then((r) => r.subject),
    remove: (id) => request(`/subjects/${id}`, { method: 'DELETE' }),
    reorder: (order) => request('/subjects/reorder', { method: 'POST', body: { order } }).then((r) => r.subjects),
  },

  topics: {
    list: (filters) => request(`/topics${query(filters)}`).then((r) => r.topics),
    create: (payload) => request('/topics', { method: 'POST', body: payload }).then((r) => r.topics),
    update: (id, changes) => request(`/topics/${id}`, { method: 'PATCH', body: changes }).then((r) => r.topic),
    remove: (id) => request(`/topics/${id}`, { method: 'DELETE' }),
    reorder: (subjectId, order) =>
      request('/topics/reorder', { method: 'POST', body: { subject_id: subjectId, order } }).then(
        (r) => r.topics
      ),
    bulkUpdate: (ids, changes) =>
      request('/topics/bulk', { method: 'PATCH', body: { ids, changes } }).then((r) => r.topics),
  },

  anchors: {
    list: () => request('/anchors').then((r) => r.anchors),
    effective: (from, to) => request(`/anchors/effective${query({ from, to })}`).then((r) => r.anchors),
    create: (anchor) => request('/anchors', { method: 'POST', body: anchor }).then((r) => r.anchor),
    update: (id, changes) =>
      request(`/anchors/${id}`, { method: 'PATCH', body: changes }).then((r) => r.anchor),
    remove: (id) => request(`/anchors/${id}`, { method: 'DELETE' }),
    starterWeek: () => request('/anchors/starter-week', { method: 'POST' }).then((r) => r.anchors),
  },

  templates: {
    list: () => request('/templates').then((r) => r.templates),
    create: (name) => request('/templates', { method: 'POST', body: { name } }).then((r) => r.template),
    rename: (id, name) => request(`/templates/${id}`, { method: 'PATCH', body: { name } }).then((r) => r.template),
    remove: (id) => request(`/templates/${id}`, { method: 'DELETE' }),
    addBlock: (id, block) =>
      request(`/templates/${id}/blocks`, { method: 'POST', body: block }).then((r) => r.block),
    updateBlock: (id, blockId, changes) =>
      request(`/templates/${id}/blocks/${blockId}`, { method: 'PATCH', body: changes }).then((r) => r.block),
    removeBlock: (id, blockId) => request(`/templates/${id}/blocks/${blockId}`, { method: 'DELETE' }),
    assign: (id, weeks) =>
      request(`/templates/${id}/assign`, { method: 'POST', body: { weeks } }).then((r) => r.templates),
    unassign: (weeks) =>
      request('/templates/unassign', { method: 'POST', body: { weeks } }).then((r) => r.templates),
  },

  studyBlocks: {
    list: () => request('/study-blocks').then((r) => r.blocks),
    propose: () => request('/study-blocks/propose').then((r) => r.blocks),
    save: (blocks) => request('/study-blocks', { method: 'PUT', body: { blocks } }).then((r) => r.blocks),
    create: (block) => request('/study-blocks', { method: 'POST', body: block }).then((r) => r.block),
    update: (id, changes) =>
      request(`/study-blocks/${id}`, { method: 'PATCH', body: changes }).then((r) => r.block),
    remove: (id) => request(`/study-blocks/${id}`, { method: 'DELETE' }),
  },

  practiceItems: {
    list: (params) => request(`/practice-items${query(params)}`).then((r) => r.items),
    generate: (subjectId) =>
      request('/practice-items/generate', { method: 'POST', body: { subject_id: subjectId } }).then((r) => r.items),
    update: (id, changes) =>
      request(`/practice-items/${id}`, { method: 'PATCH', body: changes }).then((r) => r.item),
    mark: (id, done) => request(`/practice-items/${id}/mark`, { method: 'POST', body: { done } }).then((r) => r.item),
  },

  scheduleSnapshots: {
    list: () => request('/schedule-snapshots').then((r) => r.snapshots),
    save: (label) => request('/schedule-snapshots', { method: 'POST', body: { label } }).then((r) => r.snapshot),
    gapReport: (id) => request(`/schedule-snapshots/${id}/gap-report`),
    remove: (id) => request(`/schedule-snapshots/${id}`, { method: 'DELETE' }),
  },

  errorNotes: {
    list: (params) => request(`/error-notes${query(params)}`).then((r) => r.notes),
    summary: (params) => request(`/error-notes/summary${query(params)}`).then((r) => r.counts),
    create: (note) => request('/error-notes', { method: 'POST', body: note }).then((r) => r.note),
    update: (id, changes) =>
      request(`/error-notes/${id}`, { method: 'PATCH', body: changes }).then((r) => r.note),
    remove: (id) => request(`/error-notes/${id}`, { method: 'DELETE' }),
  },

  plan: {
    list: (from, to) => request(`/plan${query({ from, to })}`).then((r) => r.entries),
    unscheduled: () => request('/plan/unscheduled').then((r) => r.topics),
    needsRevision: () => request('/plan/needs-revision').then((r) => r.topics),
    create: (entry) => request('/plan', { method: 'POST', body: entry }),
    update: (id, changes) => request(`/plan/${id}`, { method: 'PATCH', body: changes }),
    remove: (id) => request(`/plan/${id}`, { method: 'DELETE' }),
    auto: (from, to) => request('/plan/auto', { method: 'POST', body: { from, to } }),
    suggest: (topicId, opts = {}) =>
      request('/plan/suggest', { method: 'POST', body: { topic_id: topicId, ...opts } }).then((r) => r.suggestion),
    clear: (from, to, includeCompleted = false) =>
      request('/plan/clear', { method: 'POST', body: { from, to, includeCompleted } }),
  },

  sessions: {
    list: (params) => request(`/sessions${query(params)}`),
    forPlanEntry: (planEntryId) =>
      request(`/sessions/for-plan-entry/${planEntryId}`).then((r) => r.session),
    create: (session) => request('/sessions', { method: 'POST', body: session }),
    update: (id, changes) => request(`/sessions/${id}`, { method: 'PATCH', body: changes }),
    remove: (id) => request(`/sessions/${id}`, { method: 'DELETE' }),
  },

  tests: {
    list: (params) => request(`/tests${query(params)}`).then((r) => r.tests),
    get: (id) => request(`/tests/${id}`).then((r) => r.test),
    create: (test) => request('/tests', { method: 'POST', body: test }).then((r) => r.test),
    update: (id, changes) => request(`/tests/${id}`, { method: 'PATCH', body: changes }).then((r) => r.test),
    remove: (id) => request(`/tests/${id}`, { method: 'DELETE' }),
    setResults: (id, results) =>
      request(`/tests/${id}/results`, { method: 'PUT', body: { results } }).then((r) => r.test),
    updateResult: (id, resultId, changes) =>
      request(`/tests/${id}/results/${resultId}`, { method: 'PATCH', body: changes }).then((r) => r.test),
    removeResult: (id, resultId) =>
      request(`/tests/${id}/results/${resultId}`, { method: 'DELETE' }).then((r) => r.test),
  },

  analysis: {
    list: (params) => request(`/analysis${query(params)}`).then((r) => r.analyses),
    get: (id) => request(`/analysis/${id}`).then((r) => r.analysis),
    create: (analysis) => request('/analysis', { method: 'POST', body: analysis }).then((r) => r.analysis),
    remove: (id) => request(`/analysis/${id}`, { method: 'DELETE' }),
  },

  progress: {
    get: (params) => request(`/progress${query(params)}`),
  },

  settings: {
    planner: () => request('/settings/planner').then((r) => r.settings),
    savePlanner: (changes) =>
      request('/settings/planner', { method: 'PATCH', body: changes }).then((r) => r.settings),
    term: () => request('/settings/term').then((r) => r.settings),
    saveTerm: (changes) =>
      request('/settings/term', { method: 'PATCH', body: changes }).then((r) => r.settings),
  },

  syllabus: {
    /** Accepts either a File or already-extracted text, plus parser options. */
    parse: ({ file, text, unitHandling, splitColonLists }) => {
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        if (unitHandling) formData.append('unitHandling', unitHandling);
        if (splitColonLists !== undefined) formData.append('splitColonLists', String(splitColonLists));
        return request('/syllabus/parse', { method: 'POST', formData });
      }
      return request('/syllabus/parse', {
        method: 'POST',
        body: { text, unitHandling, splitColonLists },
      });
    },
  },
};
