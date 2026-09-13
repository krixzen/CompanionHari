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
    create: (anchor) => request('/anchors', { method: 'POST', body: anchor }).then((r) => r.anchor),
    update: (id, changes) =>
      request(`/anchors/${id}`, { method: 'PATCH', body: changes }).then((r) => r.anchor),
    remove: (id) => request(`/anchors/${id}`, { method: 'DELETE' }),
    starterWeek: () => request('/anchors/starter-week', { method: 'POST' }).then((r) => r.anchors),
  },

  plan: {
    list: (from, to) => request(`/plan${query({ from, to })}`).then((r) => r.entries),
    unscheduled: () => request('/plan/unscheduled').then((r) => r.topics),
    create: (entry) => request('/plan', { method: 'POST', body: entry }),
    update: (id, changes) => request(`/plan/${id}`, { method: 'PATCH', body: changes }),
    remove: (id) => request(`/plan/${id}`, { method: 'DELETE' }),
    auto: (from, to) => request('/plan/auto', { method: 'POST', body: { from, to } }),
    clear: (from, to, includeCompleted = false) =>
      request('/plan/clear', { method: 'POST', body: { from, to, includeCompleted } }),
  },

  settings: {
    planner: () => request('/settings/planner').then((r) => r.settings),
    savePlanner: (changes) =>
      request('/settings/planner', { method: 'PATCH', body: changes }).then((r) => r.settings),
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
