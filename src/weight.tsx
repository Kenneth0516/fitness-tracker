import { useState } from 'react'
import { Activity, Clock3, Pencil, Plus, Scale, Trash2, TrendingUp } from 'lucide-react'
import { db, removeRecord, saveMeasurement, type Snapshot } from './db'
import { compareMeasurements, dailyMeans, sevenDayAverage, weightChartData } from './fitness'
import { type Measurement, dateFromKey, displayNumber, localDate, localTime, nowIso, offsetDay, parseNumber, uid } from './model'
import { Button, Confirm, Dialog, Empty, Field, FormActions, IconButton, PageHeading, SectionHeading, Tile, onSubmit, useAction } from './ui'
import { WeightChart } from './charts'

const ranges = [{ label: '7 日', value: '7' }, { label: '30 日', value: '30' }, { label: '90 日', value: '90' }, { label: '1 年', value: 'year' }, { label: '全部', value: 'all' }]

export function WeightPage({ snapshot, notify }: { snapshot: Snapshot; notify: (message: string) => void }) {
  const [editing, setEditing] = useState<Measurement | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Measurement | null>(null)
  const [range, setRange] = useState('30')
  const [raw, setRaw] = useState(true)
  const [average, setAverage] = useState(true)
  const [showAll, setShowAll] = useState(false)
  const today = localDate()
  const items = [...snapshot.measurements].sort((a, b) => compareMeasurements(b, a))
  const latest = items[0]
  const mean = sevenDayAverage(dailyMeans(items), today)
  const year = dateFromKey(today)
  year.setFullYear(year.getFullYear() - 1)
  const start = range === 'all' ? '0001-01-01' : range === 'year' ? localDate(year) : offsetDay(today, 1 - Number(range))
  const points = weightChartData(items, start, range === 'all' ? '9999-12-31' : today)

  return <>
    <PageHeading title="體重紀錄" description="記錄每次測量，查看體重趨勢。"
      action={<Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>記錄體重</Button>} />
    <div className="stat-grid">
      <section className="panel stat"><Tile icon={Scale} /><div><h2>最新體重</h2><strong>{latest ? displayNumber.format(latest.weight) : '—'} <small>kg</small></strong>
        <p>{latest ? `${latest.date} · ${latest.time}` : '等待首次測量'}</p></div></section>
      <section className="panel stat"><Tile icon={Activity} tone="teal" /><div><h2>最近 7 日平均</h2><strong>{mean.value === null ? '—' : displayNumber.format(mean.value)} <small>kg</small></strong>
        <p>{mean.days}/7 個測量日</p></div></section>
    </div>
    <section className="panel">
      <SectionHeading title="體重趨勢" icon={TrendingUp} />
      <div className="chart-controls">
        <div className="segments" aria-label="圖表日期範圍">
          {ranges.map(item => <button type="button" key={item.value} aria-pressed={range === item.value} onClick={() => setRange(item.value)}>{item.label}</button>)}
        </div>
        <div className="series">
          <label><input type="checkbox" checked={raw} onChange={event => setRaw(event.target.checked)} /><span className="series-dot" />原始體重</label>
          <label><input type="checkbox" checked={average} onChange={event => setAverage(event.target.checked)} /><span className="series-dot average" />7 日移動平均</label>
        </div>
      </div>
      {points.length && (raw || average) ? <div className="chart-container"><WeightChart data={points} raw={raw} average={average} /></div>
        : <Empty icon={TrendingUp} title={raw || average ? '這段期間未有測量' : '請選擇數據系列'} message={raw || average ? '選擇其他日期範圍，或加入一筆體重紀錄。' : undefined} />}
    </section>
    <section className="panel">
      <SectionHeading title="測量歷史" icon={Clock3} count={items.length} />
      {items.length ? (showAll ? items : items.slice(0, 8)).map(item => <div className="list-row" key={item.id}>
        <div className="row-text"><strong>{displayNumber.format(item.weight)} kg</strong><small>{item.date} · {item.time}</small>
          {item.note && <p className="record-note">{item.note}</p>}</div>
        <div className="inline-actions">
          <IconButton icon={Pencil} label={`編輯 ${item.date} ${item.time} 體重`} onClick={() => setEditing(item)} />
          <IconButton icon={Trash2} label={`刪除 ${item.date} ${item.time} 體重`} variant="quiet" onClick={() => setDeleting(item)} />
        </div>
      </div>) : <Empty icon={Scale} title="尚未有測量紀錄" />}
      {items.length > 8 && <div className="panel-bottom"><Button onClick={() => setShowAll(!showAll)}>{showAll ? '只顯示最近紀錄' : '顯示所有紀錄'}</Button></div>}
    </section>
    {editing && <MeasurementForm original={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)}
      onSaved={() => { setEditing(null); notify('已儲存體重。') }} />}
    {deleting && <Confirm title="刪除體重紀錄？" message={`${deleting.date} ${deleting.time} 的 ${deleting.weight} kg 紀錄將被刪除。`}
      onClose={() => setDeleting(null)} onConfirm={async () => { await removeRecord(db.measurements, deleting); notify('已刪除體重紀錄。') }} />}
  </>
}

function MeasurementForm({ original, onClose, onSaved }: { original?: Measurement; onClose: () => void; onSaved: () => void }) {
  const now = new Date()
  const [values, setValues] = useState({
    date: original?.date ?? localDate(now), time: original?.time ?? localTime(now),
    weight: original?.weight.toString() ?? '', note: original?.note ?? '',
  })
  const action = useAction()
  return <Dialog title={original ? '編輯體重' : '記錄體重'} onClose={() => { if (!action.pending) onClose() }}>
    <form className="stack compact" onSubmit={onSubmit(action, async () => {
      const weight = parseNumber(values.weight)
      if (!Number.isFinite(weight) || weight <= 0) throw new Error('請輸入大於 0 的體重。')
      const stamp = nowIso()
      await saveMeasurement({
        ...values, weight, id: original?.id ?? uid(), createdAt: original?.createdAt ?? stamp, updatedAt: stamp,
      }, original?.updatedAt)
      onSaved()
    })}>
      <Field label="體重（kg）"><input autoFocus required inputMode="decimal" maxLength={40} placeholder="例如 70.5"
        value={values.weight} onChange={event => setValues({ ...values, weight: event.target.value })} /></Field>
      <div className="form-grid">
        <Field label="日期"><input required type="date" max={localDate()} value={values.date} onChange={event => setValues({ ...values, date: event.target.value })} /></Field>
        <Field label="時間"><input required type="time" value={values.time} onChange={event => setValues({ ...values, time: event.target.value })} /></Field>
      </div>
      <Field label="備註（選填）"><textarea rows={3} maxLength={2000} value={values.note} onChange={event => setValues({ ...values, note: event.target.value })} /></Field>
      <FormActions action={action} onClose={onClose} />
    </form>
  </Dialog>
}
