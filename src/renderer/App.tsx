import { useEffect, useState, useCallback } from 'react'
import {
  Settings as SettingsIcon,
  Play,
  ScrollText,
  RefreshCw,
  Download,
  Sun,
  Moon,
  Monitor
} from 'lucide-react'
import SettingsView from './views/SettingsView'
import RunView from './views/RunView'
import LogsView from './views/LogsView'
import type { AppInfo, UpdateStatusPayload } from '@shared/types'

type Tab = 'run' | 'settings' | 'logs'
type Theme = 'system' | 'light' | 'dark'

const THEME_ICON: Record<Theme, typeof Sun> = {
  system: Monitor,
  light: Sun,
  dark: Moon
}
const THEME_LABEL: Record<Theme, string> = {
  system: 'Theo hệ thống',
  light: 'Sáng',
  dark: 'Tối'
}

export default function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('run')
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusPayload | null>(null)
  const [checking, setChecking] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('amzn-theme') as Theme) || 'system'
    } catch {
      return 'system'
    }
  })

  useEffect(() => {
    window.amzn.getAppInfo().then(setInfo).catch(() => {})
    const off = window.amzn.update.onStatus((updateSt) => {
      setUpdateStatus(updateSt)
      if (updateSt.status !== 'checking' && updateSt.status !== 'downloading') setChecking(false)
    })
    return off
  }, [])

  // Áp theme: system -> theo prefers-color-scheme; light/dark -> ép cứng.
  useEffect(() => {
    const apply = (): void => {
      const dark =
        theme === 'dark' ||
        (theme === 'system' &&
          window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    try {
      localStorage.setItem('amzn-theme', theme)
    } catch {
      /* ignore */
    }
    if (theme === 'system' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
    return undefined
  }, [theme])

  const cycleTheme = useCallback(() => {
    setTheme((t) => (t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system'))
  }, [])

  const checkUpdate = useCallback(async () => {
    setChecking(true)
    setUpdateStatus({ status: 'checking' })
    try {
      await window.amzn.update.check()
    } catch (e) {
      setUpdateStatus({ status: 'error', message: (e as Error).message })
      setChecking(false)
    }
  }, [])

  const installUpdate = useCallback(() => {
    window.amzn.update.install().catch(() => {})
  }, [])

  const st = updateStatus?.status
  const canInstall = st === 'downloaded'
  const updateText = ((): string => {
    switch (st) {
      case 'checking':
        return 'Đang kiểm tra…'
      case 'available':
        return `Có bản mới ${updateStatus?.version ?? ''} — đang tải…`
      case 'not-available':
        return 'Đã mới nhất'
      case 'downloading':
        return `Đang tải… ${updateStatus?.percent ?? 0}%`
      case 'downloaded':
        return `Sẵn sàng cài ${updateStatus?.version ?? ''}`
      case 'error':
        return `Lỗi: ${updateStatus?.message ?? ''}`
      default:
        return ''
    }
  })()

  const ThemeIcon = THEME_ICON[theme]

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-title">AMZN LINK</div>
          <div className="brand-sub">CREATOR</div>
        </div>
        <nav className="nav">
          <button className={tab === 'run' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('run')}>
            <Play size={18} /> Chạy
          </button>
          <button
            className={tab === 'settings' ? 'nav-item active' : 'nav-item'}
            onClick={() => setTab('settings')}
          >
            <SettingsIcon size={18} /> Cài đặt
          </button>
          <button className={tab === 'logs' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('logs')}>
            <ScrollText size={18} /> Nhật ký
          </button>
        </nav>

        <div className="sidebar-footer">
          <button className="theme-toggle" onClick={cycleTheme} title={`Giao diện: ${THEME_LABEL[theme]}`}>
            <ThemeIcon size={16} /> {THEME_LABEL[theme]}
          </button>

          <div className="update-box">
            {canInstall ? (
              <button className="update-btn primary" onClick={installUpdate}>
                <Download size={15} /> Cài bản mới
              </button>
            ) : (
              <button className="update-btn" onClick={checkUpdate} disabled={checking}>
                <RefreshCw size={15} className={checking ? 'spin' : ''} />{' '}
                {checking ? 'Đang kiểm tra…' : 'Kiểm tra cập nhật'}
              </button>
            )}
            <div className="version-row">
              <span>{info ? `v${info.version}` : ''}</span>
              {updateText && <span className={st === 'error' ? 'up-err' : 'up-info'}>{updateText}</span>}
            </div>
          </div>
        </div>
      </aside>

      <main className="content">
        {tab === 'run' && <RunView />}
        {tab === 'settings' && <SettingsView />}
        {tab === 'logs' && <LogsView />}
      </main>
    </div>
  )
}
