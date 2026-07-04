import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Play, ScrollText } from 'lucide-react'
import SettingsView from './views/SettingsView'
import RunView from './views/RunView'
import LogsView from './views/LogsView'
import type { AppInfo } from '@shared/types'

type Tab = 'run' | 'settings' | 'logs'

export default function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('run')
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    window.amzn.getAppInfo().then(setInfo).catch(() => {})
  }, [])

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
        <div className="version">{info ? `v${info.version}` : ''}</div>
      </aside>

      <main className="content">
        {tab === 'run' && <RunView />}
        {tab === 'settings' && <SettingsView />}
        {tab === 'logs' && <LogsView />}
      </main>
    </div>
  )
}
