import { useEffect, useState, lazy, Suspense } from 'react'
import { Toaster } from 'sonner'
import { navDir, useStore, type SectionId } from './store'
import { SECTIONS, orderedSections } from './sections'
import { Dock, TopBar } from './ui/Shell'
import { PhoneShell } from './ui/PhoneShell'
import { SearchDialog } from './ui/Search'
import { ClaudePanel } from './ui/Claude'
import { CaptureDialog } from './ui/CaptureDialog'
import Home from './views/Home'
import Reader from './views/Reader'
import { ConnectScreen } from './ui/Connect'

const Note = lazy(() => import('./views/Note'))
const Film = lazy(() => import('./views/Film'))
const Libri = lazy(() => import('./views/Libri'))
const Ricette = lazy(() => import('./views/Ricette'))
const Miniature = lazy(() => import('./views/Miniature'))
const Giappone = lazy(() => import('./views/Giappone'))
const Settings = lazy(() => import('./views/Settings'))

function useWide() {
  const q = '(min-width: 900px)'
  const [w, setW] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const m = matchMedia(q)
    const f = () => setW(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return w
}

function useTheme() {
  const theme = useStore((s) => s.settings.theme)
  useEffect(() => {
    const m = matchMedia('(prefers-color-scheme: light)')
    const apply = () => {
      const light = theme === 'light' || (theme === 'system' && m.matches)
      document.documentElement.classList.toggle('light', light)
      document.documentElement.classList.toggle('dark', !light)
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', light ? '#FAFAF9' : '#0B0B0C')
    }
    apply()
    m.addEventListener('change', apply)
    return () => m.removeEventListener('change', apply)
  }, [theme])
}

function useShortcuts(wide: boolean) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState()
      const k = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); st.set('searchOpen', !st.searchOpen) }
      else if ((e.ctrlKey || e.metaKey) && k === 'n') { e.preventDefault(); st.set('captureOpen', true) }
      else if ((e.ctrlKey || e.metaKey) && k === 'j' && wide) { e.preventDefault(); st.set('claudeOpen', !st.claudeOpen) }
      else if ((e.ctrlKey || e.metaKey) && k === 'e' && st.reader && !st.reader.editing) { e.preventDefault(); st.setEditing(true) }
      else if (e.altKey && !e.ctrlKey && /^[1-9]$/.test(e.key)) {
        const s = orderedSections(st.settings)[+e.key - 1]
        if (s) { e.preventDefault(); st.go(s.id) }
      } else if (e.key === 'Escape' && st.reader && !st.reader.editing && !st.searchOpen && !st.captureOpen) {
        const t = e.target as HTMLElement
        if (!/INPUT|TEXTAREA/.test(t.tagName)) st.back()
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [wide])
}

export function View({ route, phone }: { route: SectionId; phone?: boolean }) {
  switch (route) {
    case 'home': return <Home phone={phone} />
    case 'note': return <Note phone={phone} />
    case 'film': return <Film phone={phone} />
    case 'libri': return <Libri phone={phone} />
    case 'ricette': return <Ricette phone={phone} />
    case 'miniature': return <Miniature phone={phone} />
    case 'giappone': return <Giappone phone={phone} />
    case 'impostazioni': return <Settings phone={phone} />
  }
}

function Loading() {
  return <div className="text-mu text-[13px] p-6" role="status">Carico il vault…</div>
}

function Problem({ msg }: { msg: string }) {
  return (
    <div className="max-w-[520px] mx-auto mt-16 border border-ln rounded-xl bg-s1 p-5">
      <h1 className="m-0 mb-2 text-[17px] font-semibold">Non riesco a leggere le note</h1>
      <p className="m-0 text-mu">{msg}</p>
    </div>
  )
}

export default function App() {
  const wide = useWide()
  useTheme()
  useShortcuts(wide)
  const route = useStore((s) => s.route)
  const reader = useStore((s) => s.reader)
  const loaded = useStore((s) => s.loaded)
  const error = useStore((s) => s.error)
  const light = useStore((s) => s.settings.theme === 'light')
  const claudeOpen = useStore((s) => s.claudeOpen)
  const dots = useStore((s) => s.settings.sectionColors)
  const compact = useStore((s) => s.settings.density === 'compatta')
  useEffect(() => {
    document.documentElement.classList.toggle('nodots', !dots)
    document.documentElement.classList.toggle('compact', compact)
  }, [dots, compact])
  const needsConnect = useStore((s) => s.needsConnect)

  useEffect(() => {
    const s = SECTIONS.find((x) => x.id === route)
    document.title = (reader ? reader.path.split('/').pop()!.replace(/\.md$/, '') + ' · ' : s && s.id !== 'home' ? s.label + ' · ' : '') + 'The Office'
  }, [route, reader])

  const body = !loaded ? <Loading /> : error && !useStore.getState().notes.length ? <Problem msg={error} /> : (
    <Suspense fallback={<Loading />}>
      <div key={reader ? 'n:' + reader.path : 'r:' + route} className={navDir() === 'pop' ? (wide ? 'fade-in' : 'back-in') : reader && !wide ? 'push-in' : 'page-in'}>
        {reader ? <Reader phone={!wide} /> : <View route={route} phone={!wide} />}
      </div>
    </Suspense>
  )

  if (needsConnect) return (<><ConnectScreen /><Toaster theme={light ? 'light' : 'dark'} /></>)

  return (
    <>
      {wide ? (
        <div className="min-h-dvh">
          <Dock />
          <div className={'pl-[96px] pr-6 transition-[padding] duration-200 ease-out ' + (claudeOpen ? 'xl:pr-[372px]' : '')}>
            <TopBar />
            <main id="main" className="max-w-[1180px] mx-auto pb-16 pt-2">{body}</main>
          </div>
          <ClaudePanel />
        </div>
      ) : (
        <PhoneShell>{body}</PhoneShell>
      )}
      <SearchDialog />
      <CaptureDialog />
      <Toaster position={wide ? 'bottom-center' : 'top-center'} theme={light ? 'light' : 'dark'} duration={5000} offset={wide ? 24 : 12} />
    </>
  )
}
