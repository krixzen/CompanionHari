import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { RevisionSuggestion } from './SessionDialog.jsx';
import { LLMBridge } from './LLMBridge.jsx';
import { WeeklyPlanView } from './AnalysisCards.jsx';
import { Button, Card, Spinner } from './ui.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { weeklyActionPlanPrompt } from '../lib/prompts.js';
import { weeklyActionPlanSchema } from '../lib/schemas.js';
import { longDate } from '../lib/week.js';

/**
 * The Progress page's "what should I do this week" card.
 *
 * Building the prompt needs three things this page doesn't otherwise load —
 * recent test-pattern analyses, the live topic list, and the full topic set
 * to resolve a suggested tracking number back to a bookable topic — so this
 * component fetches its own data rather than asking the page to carry it.
 */
export function WeeklyActionPlanCard({ progressSummary }) {
  const toast = useToast();
  const [plan, setPlan] = useState(null);
  const [previousPlan, setPreviousPlan] = useState(null);
  const [topics, setTopics] = useState([]);
  const [status, setStatus] = useState('loading');
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [addingKey, setAddingKey] = useState(null);
  const [suggestion, setSuggestion] = useState(null);

  const load = async () => {
    setStatus('loading');
    try {
      const [plans, loadedTopics] = await Promise.all([
        api.analysis.list({ type: 'weekly_action_plan' }),
        api.topics.list(),
      ]);
      setPlan(plans[0] ?? null);
      setPreviousPlan(plans[1] ?? null);
      setTopics(loadedTopics);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const buildPrompt = async () => {
    const recentPatterns = await api.analysis.list({ type: 'test_pattern' });
    return weeklyActionPlanPrompt({
      recentPatterns: recentPatterns.slice(0, 3),
      topics,
      progressSummary,
      lastWeekGoals: plan?.payload?.behavioural_goals,
    });
  };

  const [prompt, setPrompt] = useState('');
  const openBridge = async () => {
    setPrompt(await buildPrompt());
    setBridgeOpen(true);
  };

  const addPriority = async (item) => {
    const topic = topics.find((candidate) => candidate.tracking_number === item.tracking_number);
    if (!topic) {
      toast.warn(`"${item.topic_title}" doesn't match a topic on your list any more.`);
      return;
    }

    const itemKey = item.tracking_number ?? `${item.topic_title}`;
    setAddingKey(itemKey);
    try {
      const found = await api.plan.suggest(topic.id, { minutes: item.suggested_minutes });
      if (!found) {
        toast.warn('There is no free gap for this in the next week — try clearing some time first.');
        return;
      }
      setSuggestion(found);
    } catch (caught) {
      toast.warn(caught.message);
    } finally {
      setAddingKey(null);
    }
  };

  if (status === 'loading') return <Spinner label="Checking for a plan…" />;
  if (status === 'error') return null;

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-ink">This week's plan</h2>
          <p className="text-xs text-ink-faint">
            {plan
              ? `From ${longDate(plan.created_at.slice(0, 10))}. Nothing is booked without you saying so.`
              : 'Ask Claude or ChatGPT to turn your tests and topics into a short list of priorities.'}
          </p>
        </div>
        <Button variant="primary" onClick={openBridge}>
          {plan ? 'Get a fresh plan' : "Get this week's plan"}
        </Button>
      </div>

      {plan && <WeeklyPlanView payload={plan.payload} onAddPriority={addPriority} addingKey={addingKey} />}

      {previousPlan?.payload?.behavioural_goals?.length > 0 && (
        <div className="mt-3 border-t border-black/5 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Last week's goals — from {longDate(previousPlan.created_at.slice(0, 10))}
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {previousPlan.payload.behavioural_goals.map((goal) => (
              <li key={goal.goal} className="text-ink-soft">
                <span className="text-ink">{goal.goal}</span>
                <span className="text-xs text-ink-faint"> — measured by {goal.how_to_measure}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <LLMBridge
        open={bridgeOpen}
        onClose={() => setBridgeOpen(false)}
        title="Plan the coming week"
        purpose="This app never contacts an AI service — copy the prompt across yourself, then bring the reply back."
        prompt={prompt}
        schema={weeklyActionPlanSchema}
        saveLabel="Save this plan"
        renderPreview={(data) => <WeeklyPlanView payload={data} />}
        onSave={async (data) => {
          const saved = await api.analysis.create({ analysis_type: 'weekly_action_plan', payload: data });
          setPreviousPlan(plan);
          setPlan(saved);
          setBridgeOpen(false);
          toast.celebrate('This week is sorted.');
        }}
      />

      <RevisionSuggestion
        suggestion={suggestion}
        open={Boolean(suggestion)}
        title="Add this to your week?"
        lead="This came up in your plan."
        onClose={() => setSuggestion(null)}
        onAccept={async (found) => {
          try {
            await api.plan.create({
              topic_id: found.topic_id,
              scheduled_date: found.scheduled_date,
              scheduled_start_time: found.scheduled_start_time,
              scheduled_duration_minutes: found.scheduled_duration_minutes,
              entry_type: 'study',
            });
            toast.celebrate('Booked in.');
          } catch (caught) {
            toast.warn(caught.message);
          } finally {
            setSuggestion(null);
          }
        }}
      />
    </Card>
  );
}
