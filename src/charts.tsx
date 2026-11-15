import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { exerciseProgress, weightChartData } from './fitness'
import { displayNumber, type WeightType } from './model'

const dateTick = new Intl.DateTimeFormat('zh-HK', { month: 'numeric', day: 'numeric' })
const timeTick = new Intl.DateTimeFormat('zh-HK', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const tick = { fill: '#939cb4', fontSize: 11 }
const stroke = '#34394d'
const colorWeight = '#928bff'
const colorAverage = '#53dec6'

export function WeightChart({ data, raw, average }: { data: ReturnType<typeof weightChartData>; raw: boolean; average: boolean }) {
  const showTimes = data[0]?.date === data.at(-1)?.date
  return <div className="chart" aria-label="體重走勢圖">
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <LineChart data={data} margin={{ top: 16, right: 20, bottom: 0, left: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke={stroke} strokeDasharray="4 5" />
        <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']} tick={tick} padding={{ left: 8, right: 8 }}
          tickMargin={10} axisLine={false} tickLine={false} minTickGap={18}
          tickFormatter={value => (showTimes ? timeTick : dateTick).format(new Date(value))} />
        <YAxis width={48} unit=" kg" domain={['auto', 'auto']} tick={tick} axisLine={false} tickLine={false} padding={{ top: 7, bottom: 7 }} />
        <Tooltip cursor={{ stroke }} trigger="click" content={({ active, label }) => {
          if (!active || label === undefined) return null
          const entries = data.filter(point => point.timestamp === Number(label))
          if (!entries.length) return null
          const mean = entries.find(entry => entry.average !== null)?.average
          return <div className="chart-tooltip">
            {entries.map(entry => <div key={entry.id}>{entry.date} · {entry.time}{raw && <strong> {displayNumber.format(entry.weight)} kg</strong>}</div>)}
            {average && mean != null && <div className="trend-value">7 日平均 {displayNumber.format(mean)} kg</div>}
          </div>
        }} />
        {raw && <Line type="linear" dataKey="weight" stroke={colorWeight} strokeWidth={2.5} name="原始體重"
          dot={{ r: 3, fill: colorWeight, strokeWidth: 0 }} activeDot={{ r: 6 }} isAnimationActive={false} />}
        {average && <Line type="linear" dataKey="average" name="7 日移動平均" stroke={colorAverage} strokeWidth={2} strokeDasharray="5 5"
          dot={{ r: 3, fill: colorAverage, strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />}
      </LineChart>
    </ResponsiveContainer>
  </div>
}

export function ProgressChart({ data, weightType }: { data: ReturnType<typeof exerciseProgress>; weightType: WeightType }) {
  const [metric, setMetric] = useState('best')
  const assisted = weightType === 'assistance'
  const bodyweight = weightType === 'bodyweight'
  const options = [
    ...(!bodyweight ? [{ key: 'best', label: assisted ? '最低輔助重量' : '最高工作重量', unit: 'kg' }] : []),
    ...(!bodyweight && !assisted ? [{ key: 'volume', label: '訓練量', unit: 'kg·Reps' }] : []),
    { key: 'repetitions', label: '總 Reps', unit: 'Reps' },
  ]
  const selected = options.find(option => option.key === metric) ?? options[0]
  return <>
    <div className="segments">
      {options.map(option => <button key={option.key} type="button" aria-pressed={selected.key === option.key}
        onClick={() => setMetric(option.key)}>{option.label}</button>)}
    </div>
    {selected.key === 'volume' && weightType === 'perDumbbell' && <p className="muted">訓練量以每隻啞鈴重量 × Reps 計算。</p>}
    <div className="chart" aria-label={selected.label}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={data} margin={{ top: 14, right: 18, bottom: 0, left: 2 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke={stroke} strokeDasharray="4 5" />
          <XAxis dataKey="date" tick={tick} tickMargin={10} axisLine={false} tickLine={false} minTickGap={20} tickFormatter={value => value.slice(5)} />
          <YAxis width={54} tick={tick} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
          <Tooltip trigger="click" cursor={{ stroke }} contentStyle={{ background: '#191d2e', borderColor: stroke, borderRadius: 10 }}
            labelStyle={{ color: '#edf0ff' }} formatter={value => [`${value} ${selected.unit}`, selected.label]} />
          <Line name={selected.label} dataKey={selected.key} stroke={colorWeight} strokeWidth={2.5} dot={{ r: 3, fill: colorWeight }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </>
}
