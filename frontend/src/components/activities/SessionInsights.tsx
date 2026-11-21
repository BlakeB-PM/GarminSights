import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getSessionInsights } from '../../lib/api';

export function SessionInsights({ activityId }: { activityId: number }) {
  const [metric, setMetric] = useState('heart_rate');
  const query = useQuery({ queryKey: ['session-insights',activityId], queryFn: () => getSessionInsights(activityId) });
  if (query.isPending) return <p>Loading session insights…</p>;
  if (query.error) return <p role="alert">Session insights could not load. {query.error.message}</p>;
  const data = query.data;
  const options = [
    { key: 'heart_rate', label: 'Heart rate', unit: ' bpm' },
    { key: 'speed_mps', label: 'Recorded speed', unit: ' m/s' },
    { key: 'power_watts', label: 'Recorded power', unit: ' W' },
  ].filter(m => data.timeline.some(p => p[m.key as 'heart_rate' | 'speed_mps' | 'power_watts'] != null));
  const chosen = options.find(o => o.key === metric) ?? options[0];
  return <section className="space-y-3 rounded-lg border border-card-border p-3">
    <h4 className="font-medium">Session insights</h4>
    {data.notes.map(note => <p className="text-sm text-gray-400" key={note}>{note}</p>)}
    {chosen && <>
      <label className="text-sm">Timeline <select className="bg-card border border-card-border rounded p-1"
        value={chosen.key} onChange={e => setMetric(e.target.value)}>
        {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select></label>
      <div className="h-48"><ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.timeline.map(p => ({ ...p, minute: p.elapsed_seconds/60 }))}>
          <XAxis dataKey="minute" type="number" tickFormatter={v => String(Math.round(Number(v)))} />
          <YAxis width={45} domain={['auto','auto']} /><Tooltip labelFormatter={v => Number(v).toFixed(1)+' min'} />
          <Line dataKey={chosen.key} name={chosen.label} unit={chosen.unit} stroke="#60a5fa" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer></div>
      <p className="text-xs text-gray-500">Elapsed minutes · {data.sample_count.toLocaleString()} stored samples · {data.observed_hr_minutes} minutes of observed HR</p>
    </>}
    {data.exercises.length > 0 && <div className="overflow-x-auto">
      <table className="w-full text-sm text-left"><thead><tr>
        <th>Exercise</th><th>This session</th><th>Previous session</th>
      </tr></thead><tbody>{data.exercises.map(e => <tr className="border-t border-card-border" key={e.exercise_name}>
        <td className="py-2 pr-3">{e.exercise_name}</td>
        <td className="pr-3">{e.sets} sets · {e.reps} reps{e.heaviest_lbs != null && <> · up to {e.heaviest_lbs.toFixed(1)} lb</>}</td>
        <td>{e.previous ? <>{e.previous.date}<br />{e.previous.sets} sets · {e.previous.reps} reps
          {e.previous.heaviest_lbs != null && <> · up to {e.previous.heaviest_lbs.toFixed(1)} lb</>}
        </> : 'First recorded session'}</td>
      </tr>)}</tbody></table>
    </div>}
  </section>;
}
