import { cloneElement, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type FormEvent, type ReactElement, type ReactNode } from 'react'
import { AlertCircle, ArrowLeft, Check, ChevronDown, ChevronUp, Dumbbell, Search, Trash2, X, type LucideIcon } from 'lucide-react'
import { z } from 'zod'
import { type Exercise, muscleLabels, weightLabels } from './model'

export function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    const message = error.issues[0]?.message
    return message && /[\u3400-\u9FFF]/.test(message) ? message : '輸入資料不完整或格式無效，請檢查各欄位。'
  }
  if (error instanceof Error && /[\u3400-\u9FFF]/.test(error.message)) return error.message
  return '操作未能完成。請確認瀏覽器容許本地儲存後再試。'
}

export function useAction() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(false)
  async function run(task: () => Promise<unknown>) {
    if (active.current) return
    active.current = true
    setPending(true)
    setError('')
    try { await task() } catch (problem) { setError(errorMessage(problem)) }
    finally { active.current = false; setPending(false) }
  }
  return { pending, error, run }
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger'
  icon?: LucideIcon
}

export function Button({ variant = 'secondary', icon: Icon, children, className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={`button button-${variant} ${className}`} {...props}>
    {Icon && <Icon size={17} aria-hidden="true" />}{children}
  </button>
}

export function IconButton({ icon: Icon, label, ...props }: ButtonProps & { icon: LucideIcon; label: string }) {
  return <Button icon={Icon} aria-label={label} title={label} {...props} className={`icon-button ${props.className ?? ''}`} />
}

export function Tile({ icon: Icon = Dumbbell, tone = 'blue', className = '' }: { icon?: LucideIcon; tone?: string; className?: string }) {
  return <span className={`tile tile-${tone} ${className}`} aria-hidden="true"><Icon size={21} strokeWidth={1.8} /></span>
}

export function PageHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h1 tabIndex={-1}>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>
}

export function SectionHeading({ title, icon: Icon, action, count, tone }: {
  title: string; icon?: LucideIcon; action?: ReactNode; count?: number; tone?: string
}) {
  return <div className="section-heading">
    <div className="section-label">{Icon && <Tile icon={Icon} tone={tone} />}<h2>{title}</h2>{count !== undefined && <span className="count" aria-label={`${count} 筆`}>{count}</span>}</div>
    {action}
  </div>
}

export function Empty({ icon, title, message, action, large = false }: {
  icon: LucideIcon; title: string; message?: string; action?: ReactNode; large?: boolean
}) {
  return <div className={`empty ${large ? 'empty-large' : ''}`}>
    <div className="empty-art"><Tile icon={icon} /></div><h3>{title}</h3>
    {message && <p>{message}</p>}{action}
  </div>
}

export function Notice({ children, kind = 'error' }: { children: ReactNode; kind?: 'error' | 'success' | 'info' }) {
  const Icon = kind === 'success' ? Check : AlertCircle
  return <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}><Icon size={18} aria-hidden="true" /><div>{children}</div></div>
}

export function Field({ label, hint, children }: {
  label: string; hint?: string; children: ReactElement<{ id?: string; 'aria-describedby'?: string }>
}) {
  const id = useId()
  const hintId = id + '-hint'
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    {cloneElement(children, { id, 'aria-describedby': hint ? hintId : undefined })}
    {hint && <small id={hintId}>{hint}</small>}
  </div>
}

export function BackButton({ onClick, children = '返回' }: { onClick: () => void; children?: ReactNode }) {
  return <Button variant="quiet" className="back-button" icon={ArrowLeft} onClick={onClick}>{children}</Button>
}

export function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const heading = useId()
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])
  return <dialog ref={ref} aria-labelledby={heading} className={`dialog ${wide ? 'dialog-wide' : ''}`} onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="dialog-head"><h2 id={heading}>{title}</h2><IconButton icon={X} label="關閉" variant="quiet" onClick={onClose} /></div>
    <div className="dialog-body">{children}</div>
  </dialog>
}

export function Confirm({ title, message, label = '刪除', danger = true, onClose, onConfirm }: {
  title: string; message: string; label?: string; danger?: boolean; onClose: () => void; onConfirm: () => void | Promise<unknown>
}) {
  const action = useAction()
  return <Dialog title={title} onClose={() => { if (!action.pending) onClose() }}>
    <p className="muted">{message}</p>
    {action.error && <Notice>{action.error}</Notice>}
    <div className="dialog-actions">
      <Button autoFocus onClick={onClose} disabled={action.pending}>取消</Button>
      <Button variant={danger ? 'danger' : 'primary'} disabled={action.pending} onClick={() => void action.run(async () => { await onConfirm(); onClose() })}>
        {action.pending ? '處理中…' : label}
      </Button>
    </div>
  </Dialog>
}

export function FormActions({ action, onClose, label = '儲存' }: { action: ReturnType<typeof useAction>; onClose: () => void; label?: string }) {
  return <>
    {action.error && <Notice>{action.error}</Notice>}
    <div className="dialog-actions">
      <Button onClick={onClose} disabled={action.pending}>取消</Button>
      <Button type="submit" variant="primary" disabled={action.pending}>{action.pending ? '處理中…' : label}</Button>
    </div>
  </>
}

export function onSubmit(action: ReturnType<typeof useAction>, save: () => Promise<unknown>) {
  return (event: FormEvent) => { event.preventDefault(); void action.run(save) }
}

export function ExercisePicker({ exercises, excluded, onSelect, onClose }: {
  exercises: Exercise[]; excluded: string[]; onSelect: (exercises: Exercise[]) => void; onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const allowed = exercises.filter(exercise => !exercise.archived && !excluded.includes(exercise.id)).sort((a, b) => a.name.localeCompare(b.name))
  const shown = allowed.filter(exercise => exercise.name.toLowerCase().includes(query.trim().toLowerCase()) || muscleLabels[exercise.muscle].includes(query.trim()))
  return <Dialog title="加入動作" onClose={onClose} wide>
    <div className="search-field"><Search size={18} /><input autoFocus type="search" placeholder="搜尋動作或肌群" aria-label="搜尋動作或肌群" value={query} onChange={event => setQuery(event.target.value)} /></div>
    <div className="picker-list">
      {shown.map(exercise => <label key={exercise.id} className="picker-row">
        <input type="checkbox" checked={selected.includes(exercise.id)} onChange={event => {
          setSelected(event.target.checked ? [...selected, exercise.id] : selected.filter(id => id !== exercise.id))
        }} />
        <span><strong>{exercise.name}</strong><small>{muscleLabels[exercise.muscle]} · {weightLabels[exercise.weightType]}</small></span>
      </label>)}
      {!shown.length && <p className="muted">沒有符合的動作。</p>}
    </div>
    <div className="dialog-actions"><Button onClick={onClose}>取消</Button><Button variant="primary" disabled={!selected.length} onClick={() => {
      const byId = new Map(allowed.map(exercise => [exercise.id, exercise]))
      onSelect(selected.flatMap(id => byId.has(id) ? [byId.get(id)!] : []))
    }}>加入動作{selected.length > 0 && ` (${selected.length})`}</Button></div>
  </Dialog>
}

export function moveItem<T>(items: T[], position: number, delta: number) {
  const updated = [...items]
  const target = position + delta
  if (target < 0 || target >= items.length) return items
  updated[position] = items[target]
  updated[target] = items[position]
  return updated
}

export function OrderActions({ index, count, label, onMove, onRemove }: {
  index: number; count: number; label: string; onMove: (delta: number) => void; onRemove: () => void
}) {
  return <div className="order-actions">
    <IconButton icon={ChevronUp} variant="quiet" label={`上移 ${label}`} disabled={index === 0} onClick={() => onMove(-1)} />
    <IconButton icon={ChevronDown} variant="quiet" label={`下移 ${label}`} disabled={index === count - 1} onClick={() => onMove(1)} />
    <IconButton icon={Trash2} variant="quiet" label={`移除 ${label}`} onClick={onRemove} />
  </div>
}
