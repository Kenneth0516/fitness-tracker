import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Activity, CalendarDays, Check, CloudOff, DatabaseBackup, Dumbbell, Ellipsis, HardDrive, LoaderCircle, Scale, Trophy, X } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { backupDue, getSnapshot, markBackup } from './db'
import { displayDate } from './model'
import { BackupPage, exportBackup, LibraryPage, MorePage, SettingsPage, TemplatesPage } from './more'
import { PRPage } from './pr'
import { WeightPage } from './weight'
import { ExerciseProgressPage, WorkoutPage } from './workout'
import { WorkoutEditor } from './workout-editor'
import { Button, Empty, IconButton, Notice, errorMessage, useAction } from './ui'

const navigation = [
  { id: 'workout', label: 'Workout', detail: '訓練', icon: Dumbbell },
  { id: 'weight', label: 'Weight', detail: '體重', icon: Scale },
  { id: 'pr', label: 'PR', detail: '個人紀錄', icon: Trophy },
  { id: 'more', label: 'More', detail: '更多選項', icon: Ellipsis },
] as const

function subscribe(callback: () => void) {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

function hashPath() { return window.location.hash.slice(1).replace(/^\/+|\/+$/g, '') || 'workout' }
function navigate(path: string) { window.location.hash = '#/' + path }

export function App() {
  const route = useSyncExternalStore(subscribe, hashPath)
  const [section, subsection, id] = route.split('/')
  const selected = navigation.find(item => item.id === section) ?? navigation[0]
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [retry, setRetry] = useState(0)
  const [reminder, setReminder] = useState(false)
  const dueChecked = useRef(false)
  const action = useAction()
  const result = useLiveQuery(async () => {
    try { return { snapshot: await getSnapshot(), error: null } }
    catch (problem) { return { snapshot: null, error: errorMessage(problem) } }
  }, [retry])
  const snapshot = result?.snapshot
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  useEffect(() => {
    if (snapshot && !dueChecked.current) {
      dueChecked.current = true
      setReminder(backupDue(snapshot.settings))
    }
  }, [snapshot])
  useEffect(() => {
    window.scrollTo(0, 0)
    root.current?.querySelector('h1')?.focus({ preventScroll: true })
  }, [route])
  useEffect(() => {
    if (!toast) return
    const handle = window.setTimeout(() => setToast(null), 3800)
    return () => window.clearTimeout(handle)
  }, [toast])

  function notify(text: string) { setToast({ text, id: Date.now() }) }

  const props = snapshot && { snapshot, navigate, notify }
  let page = <div className="panel loading" role="status"><LoaderCircle size={23} />正在讀取此裝置的資料…</div>
  if (result?.error) {
    page = <div className="panel padded stack compact"><Notice>{result.error}</Notice><Button onClick={() => setRetry(retry + 1)}>重試</Button></div>
  } else if (props) {
    if (selected.id === 'weight') page = <WeightPage {...props} />
    else if (selected.id === 'pr') page = <PRPage {...props} />
    else if (selected.id === 'more') {
      switch (subsection) {
        case 'library': page = <LibraryPage {...props} />; break
        case 'templates': page = <TemplatesPage {...props} creating={id === 'new'} />; break
        case 'backup': page = <BackupPage {...props} />; break
        case 'settings': page = <SettingsPage {...props} />; break
        default: page = <MorePage {...props} />
      }
    } else if (subsection === 'progress') {
      page = <ExerciseProgressPage {...props} />
    } else if (subsection === 'edit') {
      const draft = props.snapshot.drafts.find(item => item.id === id)
      page = draft ? <WorkoutEditor key={draft.id} initial={draft} snapshot={props.snapshot} onBack={() => navigate('workout')}
        onSaved={() => { navigate('workout'); notify('已儲存 Workout。') }} />
        : <div className="panel"><Empty icon={Dumbbell} title="找不到這份草稿"
          action={<Button onClick={() => navigate('workout')}>返回 Workout</Button>} /></div>
    } else page = <WorkoutPage {...props} />
  }

  return <div className="shell">
    <a href="#main-content" className="skip-link" onClick={event => { event.preventDefault(); root.current?.focus() }}>跳到主要內容</a>
    <aside className="sidebar">
      <Brand />
      <nav aria-label="主選單" className="desktop-nav">
        {navigation.map(({ id: item, icon: Icon, label, detail }) => <a key={item} href={`#/${item}`}
          aria-current={item === selected.id ? 'page' : undefined}>
          <Icon size={21} strokeWidth={1.8} aria-hidden="true" /><span><strong>{label}</strong><small>{detail}</small></span>
        </a>)}
      </nav>
      <div className="storage-status"><div className="storage-icon"><HardDrive size={17} aria-hidden="true" /></div>
        <span><strong>本地儲存</strong><small>資料儲存在此裝置</small></span></div>
    </aside>
    <div className="main-area">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="desktop-crumb"><selected.icon size={17} aria-hidden="true" /><span>{selected.label}</span></div>
          <div className="mobile-brand"><Brand /></div>
          <div className="top-meta">
            {offline && <span className="offline"><CloudOff size={15} aria-hidden="true" />離線</span>}
            <time className="today"><CalendarDays size={16} aria-hidden="true" />{displayDate.format(new Date())}</time>
          </div>
        </div>
      </header>
      <main id="main-content" className="content stack" ref={root} tabIndex={-1}>
        {reminder && snapshot && backupDue(snapshot.settings) && <section className="panel reminder">
          <div className="section-label"><DatabaseBackup size={21} /><div><strong>備份一下健身紀錄</strong><p>保存一份 JSON，可在換裝置或清除瀏覽器資料後還原。</p></div></div>
          <div className="inline-actions">
            <Button variant="primary" disabled={action.pending} onClick={() => void action.run(async () => {
              await exportBackup(); setReminder(false); notify('已觸發備份下載。')
            })}>匯出備份</Button>
            <Button disabled={action.pending} onClick={() => void action.run(async () => { await markBackup('dismiss'); setReminder(false) })}>稍後提醒</Button>
          </div>
          {action.error && <Notice>{action.error}</Notice>}
        </section>}
        {page}
      </main>
    </div>
    <nav className="bottom-nav" aria-label="主選單">
      {navigation.map(({ id: item, icon: Icon, label }) => <a key={item} href={`#/${item}`} aria-current={item === selected.id ? 'page' : undefined}>
        <Icon size={22} strokeWidth={1.85} aria-hidden="true" /><span>{label}</span>
      </a>)}
    </nav>
    {toast && <div className="toast" role="status">
      <Check size={19} aria-hidden="true" /><span>{toast.text}</span><IconButton icon={X} variant="quiet" label="關閉通知" onClick={() => setToast(null)} />
    </div>}
  </div>
}

function Brand() {
  return <a className="brand" href="#/workout" aria-label="Fitness Tracker，返回 Workout">
    <span className="brand-icon"><Activity size={24} strokeWidth={2.2} aria-hidden="true" /></span>
    <span className="brand-title">Fitness<span>Tracker</span></span>
  </a>
}
