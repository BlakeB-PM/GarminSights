import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { garminOriginalUrl, getGarminCoverage, getGarminTrend, getGarminObservations, getGarminRecord } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';

const button = 'text-accent underline disabled:text-gray-500 disabled:no-underline';
const field = 'rounded bg-card border border-card-border px-2 py-1';

function RecordFields({ source, recordKey }: { source: string; recordKey: string }) {
  const [path, setPath] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const query = useQuery({ queryKey: ['garmin-record', source, recordKey, path, offset],
    queryFn: () => getGarminRecord(source, recordKey, path, offset) });
  function navigate(next: string[]) { setPath(next); setOffset(0); }
  return <div className="space-y-2 border-t border-card-border pt-3">
    <div className="flex flex-wrap gap-3"><strong>{[recordKey, ...path].join(' / ')}</strong>
      {source === 'original_activity' && <a className={button} href={garminOriginalUrl(recordKey)}>Download original activity</a>}
      {path.length > 0 && <button className={button} onClick={() => navigate(path.slice(0, -1))}>Up one level</button>}
    </div>
    {query.isLoading && <p>Loading record…</p>}
    {query.error && <p role="alert">{query.error.message}</p>}
    <dl className="max-h-72 overflow-auto">
      {query.data?.fields?.map(f => <div className="flex flex-wrap justify-between gap-2 border-b border-card-border py-1" key={f.key}>
        <dt>{f.key}</dt><dd>{f.kind ? <button className={button} onClick={() => navigate([...path, f.key])}>
          Open {f.size} fields
        </button> : JSON.stringify(f.value)}</dd></div>)}
    </dl>
    {(query.data?.total ?? 0) > 50 && <div className="flex gap-4">
      <button className={button} disabled={!offset} onClick={() => setOffset(offset-50)}>Previous fields</button>
      <button className={button} disabled={offset+50 >= (query.data?.total ?? 0)} onClick={() => setOffset(offset+50)}>Next fields</button>
    </div>}
  </div>;
}

export function GarminCoverage() {
  const coverage = useQuery({ queryKey: ['garmin-coverage'], queryFn: getGarminCoverage });
  const [source, setSource] = useState('sleep');
  const [offset, setOffset] = useState(0);
  const [recordKey, setRecordKey] = useState('');
  const [from, setFrom] = useState('');
  const [through, setThrough] = useState('');
  const selected = coverage.data?.sources.find(s => s.source === source);
  const start = from || selected?.first_day || '';
  const end = through || selected?.latest_day || '';
  const valid = Boolean(start && end && start <= end && selected?.records);
  const rows = useQuery({ queryKey: ['garmin-observations', source, start, end, offset],
    queryFn: () => getGarminObservations(source, start, end, offset), enabled: valid });
  const metrics = coverage.data?.metrics.filter(m => m.source === source) ?? [];
  const [chosenMetric, setChosenMetric] = useState('');
  const metric = metrics.find(m => m.metric === chosenMetric) ?? metrics.find(m => m.unit && m.unit !== 'samples') ?? metrics[0];
  const trend = useQuery({ queryKey: ['garmin-trend', source, metric?.metric, start, end],
    queryFn: () => getGarminTrend(source, metric!.metric, start, end), enabled: valid && Boolean(metric) });
  function resetPage() { setOffset(0); setRecordKey(''); }
  return <Card>
    <CardHeader><CardTitle>Garmin data coverage</CardTitle></CardHeader>
    <CardContent><div className="space-y-3 text-sm">
      {coverage.isLoading && <p>Loading coverage…</p>}
      {coverage.error && <p role="alert">{coverage.error.message}</p>}
      {coverage.data && <>
        <label>Source <select value={source} className={field} onChange={e => {
          setSource(e.target.value); setFrom(''); setThrough(''); resetPage();
        }}>{coverage.data.sources.map(s => <option key={s.source} value={s.source}>{s.source.replaceAll('_',' ')} ({s.records})</option>)}</select></label>
        <p>{selected?.records ?? 0} stored responses{selected?.latest_day && ` · Latest record ${selected.latest_day}`}
          {selected?.checked_at && ` · Last checked ${selected.checked_at} UTC`}
          {Boolean(selected?.errors) && ` · ${selected?.errors} failed requests`}
          {Boolean(selected?.empty) && ` · ${selected?.empty} empty responses`}</p>
        {metrics.length > 0 && <details><summary>Measured days by metric</summary>
          <ul>{metrics.map(m => <li key={m.metric}>{m.metric} · {m.days} days · {m.first_day} – {m.latest_day}</li>)}</ul>
        </details>}
        {Boolean(selected?.records) && <>
          <div className="flex flex-wrap gap-3">
            <label>From <input type="date" className={field} value={start} onChange={e => {setFrom(e.target.value); resetPage();}} /></label>
            <label>Through <input type="date" className={field} value={end} onChange={e => {setThrough(e.target.value); resetPage();}} /></label>
          </div>
          {start > end && <p>Choose an end date on or after the start date.</p>}
          {valid && metric && <div className="space-y-2">
            <label>Trend <select className={field} value={metric.metric} onChange={e => setChosenMetric(e.target.value)}>
              {metrics.map(m => <option key={m.metric} value={m.metric}>{m.metric}{m.unit && (' · ' + m.unit)}</option>)}
            </select></label>
            {trend.error && <p role="alert">{trend.error.message}</p>}
            {trend.data?.length === 1000 && <p>Showing the earliest 1,000 observations in this window.</p>}
            {trend.data?.length && typeof trend.data[0].value === 'number' ?
              <div className="h-44" aria-label={metric.metric + ' trend'}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend.data}><XAxis dataKey="day" minTickGap={50} /><YAxis width={46} domain={['auto','auto']} />
                    <Tooltip /><Line dataKey="value" name={metric.metric} unit={metric.unit ? ' ' + metric.unit : ''}
                      stroke="currentColor" className="text-accent" dot={trend.data.length < 20} isAnimationActive={false} /></LineChart>
                </ResponsiveContainer>
              </div> : trend.data?.length ? <p>Latest: {trend.data[trend.data.length-1].value} · {trend.data[trend.data.length-1].day}</p> : null}
          </div>}
          {rows.isFetching && <p>Loading observations…</p>}
          {rows.error && <p role="alert">{rows.error.message}</p>}
          {valid && rows.data && <>
            {rows.data.metrics.length > 0 && <div className="max-h-60 overflow-auto"><table className="w-full text-left">
              <thead><tr><th>Date</th><th>Metric</th><th>Value</th></tr></thead>
              <tbody>{rows.data.metrics.map(m => <tr key={[m.record_key,m.metric].join(':')}>
                <td>{m.day}</td><td>{m.metric}</td><td>{m.value} {m.unit}</td>
              </tr>)}</tbody></table></div>}
            <div className="flex flex-wrap gap-2">{rows.data.records.map(r => <button
              className={button} key={r.record_key} onClick={() => setRecordKey(r.record_key)}>
              {r.day}{r.day !== r.record_key && ` · ${r.record_key}`}
            </button>)}</div>
            {!rows.data.records.length && !rows.data.metrics.length && <p>No records on this page.</p>}
            <div className="flex gap-4"><button className={button} disabled={!offset}
              onClick={() => {setOffset(offset-30);setRecordKey('');}}>Previous</button>
              <button className={button} disabled={Math.max(rows.data.metrics.length,rows.data.records.length)<30}
              onClick={() => {setOffset(offset+30);setRecordKey('');}}>Next</button></div>
          </>}
          {recordKey && <RecordFields key={source+recordKey} source={source} recordKey={recordKey} />}
        </>}
      </>}
    </div></CardContent>
  </Card>;
}
