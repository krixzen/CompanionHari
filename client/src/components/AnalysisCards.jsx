import { Button, Card } from './ui.jsx';
import { formatMinutes } from '../lib/format.js';
import { longDate } from '../lib/week.js';

/** How one test-pattern analysis reads, whether in the preview or saved. */
export function TestPatternView({ payload }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-ink">{payload.overall_summary}</p>

      {payload.strengths?.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sage-700">Going well</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-soft">
            {payload.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {payload.weak_areas?.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Worth attention</p>
          <ul className="mt-1 space-y-1.5">
            {payload.weak_areas.map((area, index) => (
              // Areas are free text from an assistant and can repeat.
              // eslint-disable-next-line react/no-array-index-key
              <li key={index} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-ink-soft">
                <span className="font-medium text-ink">
                  {area.tracking_number && (
                    <span className="mr-1.5 font-mono text-xs text-amber-800">{area.tracking_number}</span>
                  )}
                  {area.subject}
                  {area.topic ? ` · ${area.topic}` : ''}
                </span>
                <span className="block">{area.issue}</span>
                <span className="block text-xs text-amber-800">→ {area.recommendation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {payload.mistake_pattern && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-faint">
          {payload.mistake_pattern.careless_errors != null && (
            <span>
              {payload.mistake_pattern.careless_errors} careless{' '}
              {payload.mistake_pattern.careless_errors === 1 ? 'slip' : 'slips'}
            </span>
          )}
          {payload.mistake_pattern.concept_gaps != null && (
            <span>
              {payload.mistake_pattern.concept_gaps} concept{' '}
              {payload.mistake_pattern.concept_gaps === 1 ? 'gap' : 'gaps'}
            </span>
          )}
          {payload.mistake_pattern.time_pressure_evident && <span>Time pressure showed up</span>}
        </div>
      )}
      {payload.mistake_pattern?.notes && (
        <p className="text-xs italic text-ink-faint">{payload.mistake_pattern.notes}</p>
      )}

      {payload.recommendations?.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sage-700">This week</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-soft">
            {payload.recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A saved test-pattern analysis, with its date and a way to remove it. */
export function TestPatternCard({ analysis, onDelete }) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-ink-faint">{longDate(analysis.created_at.slice(0, 10))}</p>
        {onDelete && (
          <Button size="sm" variant="ghost" onClick={() => onDelete(analysis)}>
            Delete
          </Button>
        )}
      </div>
      <TestPatternView payload={analysis.payload} />
    </Card>
  );
}

/** How a weekly action plan reads, in the preview or saved on Progress. */
export function WeeklyPlanView({ payload, onAddPriority, addingKey }) {
  return (
    <div className="space-y-3 text-sm">
      {payload.focus_subjects?.length > 0 && (
        <p className="text-xs text-ink-faint">
          Focus this week: <span className="text-ink">{payload.focus_subjects.join(', ')}</span>
        </p>
      )}

      <ul className="space-y-1.5">
        {payload.priorities.map((item, index) => {
          const itemKey = item.tracking_number ?? `${index}-${item.topic_title}`;
          return (
            // Priorities are free text and can repeat; the composite key above
            // is unique enough for this list without depending on server ids.
            <li key={itemKey} className="flex items-start gap-2 rounded-lg bg-paper-sunk px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-ink">
                  {item.tracking_number && (
                    <span className="mr-1.5 font-mono text-xs text-ink-faint">{item.tracking_number}</span>
                  )}
                  {item.topic_title}
                  {item.suggested_minutes && (
                    <span className="ml-1.5 text-xs text-ink-faint">
                      · {formatMinutes(item.suggested_minutes)}
                    </span>
                  )}
                </p>
                <p className="text-xs text-ink-soft">{item.reason}</p>
              </div>
              {onAddPriority && item.tracking_number && (
                <Button
                  size="sm"
                  onClick={() => onAddPriority(item)}
                  disabled={addingKey === itemKey}
                >
                  {addingKey === itemKey ? 'Finding a slot…' : 'Add to plan'}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-ink-soft">{payload.general_advice}</p>
    </div>
  );
}
