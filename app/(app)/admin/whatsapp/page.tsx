'use client'

/**
 * Tela admin do WhatsApp / Evolution.
 *
 * Funcionalidades:
 *   - Status de conexão (live + cached)
 *   - Botão "Reconectar" (mostra QR base64)
 *   - Botão "Reiniciar instância"
 *   - Toggle de settings (rejectCall, msgCall, groupsIgnore, alwaysOnline)
 *   - Métricas 24h (mensagens in/out, sessões ativas, alertas)
 *
 * Dependências:
 *   - shadcn/ui Card, Button, Switch, Input, Badge
 *   - sonner para toast
 *   - lucide-react para ícones
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Smartphone, RefreshCw, QrCode, Settings, AlertTriangle,
  CheckCircle2, XCircle, Loader2, Power,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface StatusResponse {
  instance: string
  live_state: 'open' | 'connecting' | 'close' | null
  live_error: string | null
  saved_state: {
    state: string
    last_connect_at: string | null
    last_disconnect_at: string | null
    qr_base64: string | null
  } | null
  metrics: {
    msg_in_24h: number
    msg_out_24h: number
    sessoes_ativas: number
    alertas_nao_lidos: number
  }
}

interface Settings {
  rejectCall?: boolean
  msgCall?: string
  groupsIgnore?: boolean
  alwaysOnline?: boolean
  readMessages?: boolean
  readStatus?: boolean
  syncFullHistory?: boolean
}

function StateBadge({ state }: { state: string | null }) {
  if (state === 'open') {
    return (
      <Badge className="bg-emerald-500 hover:bg-emerald-600">
        <CheckCircle2 className="w-3 h-3 mr-1" /> Conectada
      </Badge>
    )
  }
  if (state === 'connecting') {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-600">
        <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Conectando
      </Badge>
    )
  }
  if (state === 'close') {
    return (
      <Badge variant="destructive">
        <XCircle className="w-3 h-3 mr-1" /> Desconectada
      </Badge>
    )
  }
  return <Badge variant="outline">Desconhecido</Badge>
}

export default function AdminWhatsAppPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [actionInFlight, setActionInFlight] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true)
    try {
      const r = await fetch('/api/admin/whatsapp/status', { cache: 'no-store' })
      const data = (await r.json()) as StatusResponse
      setStatus(data)
    } catch (err) {
      toast.error('Falha ao buscar status')
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  const fetchSettings = useCallback(async () => {
    setLoadingSettings(true)
    try {
      const r = await fetch('/api/admin/whatsapp/settings', { cache: 'no-store' })
      if (!r.ok) throw new Error('settings_fetch_failed')
      const data = (await r.json()) as Settings
      setSettings(data)
    } catch {
      toast.error('Falha ao buscar settings')
    } finally {
      setLoadingSettings(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    fetchSettings()
    const interval = setInterval(fetchStatus, 15_000)
    return () => clearInterval(interval)
  }, [fetchStatus, fetchSettings])

  async function handleReconnect() {
    setActionInFlight('reconnect')
    try {
      const r = await fetch('/api/admin/whatsapp/qr', { cache: 'no-store' })
      const data = await r.json()
      if (data.base64) {
        setQr(data.base64)
        toast.success('Escaneie o QR code no app WhatsApp')
      } else {
        toast.info(data.code ? `Pareamento: ${data.code}` : 'QR não disponível')
      }
    } catch {
      toast.error('Falha ao solicitar QR')
    } finally {
      setActionInFlight(null)
    }
  }

  async function handleRestart() {
    if (!confirm('Reiniciar a instância? Isso desconecta brevemente.')) return
    setActionInFlight('restart')
    try {
      const r = await fetch('/api/admin/whatsapp/restart', { method: 'POST' })
      if (r.ok) {
        toast.success('Instância reiniciando...')
        setTimeout(fetchStatus, 3_000)
      } else {
        toast.error('Falha ao reiniciar')
      }
    } catch {
      toast.error('Erro de rede')
    } finally {
      setActionInFlight(null)
    }
  }

  async function saveSettings(patch: Partial<Settings>) {
    if (!settings) return
    const next = { ...settings, ...patch }
    setSettings(next)
    setActionInFlight('settings')
    try {
      const r = await fetch('/api/admin/whatsapp/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (r.ok) toast.success('Settings atualizados')
      else {
        toast.error('Falha ao salvar')
        fetchSettings()  // recarrega original
      }
    } catch {
      toast.error('Erro de rede')
      fetchSettings()
    } finally {
      setActionInFlight(null)
    }
  }

  const liveOk = status?.live_state === 'open'

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Smartphone className="w-6 h-6" />
            WhatsApp / Evolution
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Instância: <code>{status?.instance ?? '...'}</code>
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchStatus}
          disabled={loadingStatus}
        >
          <RefreshCw className={cn('w-4 h-4 mr-2', loadingStatus && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {/* Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Conexão</span>
            <StateBadge state={status?.live_state ?? null} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status?.live_error && (
            <div className="p-3 rounded bg-destructive/10 text-destructive text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <strong>Não consegui falar com a Evolution.</strong>
                <div className="font-mono text-xs mt-1">{status.live_error}</div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-muted-foreground">Última conexão</div>
              <div>{status?.saved_state?.last_connect_at?.replace('T', ' ').slice(0, 16) ?? '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Última desconexão</div>
              <div>{status?.saved_state?.last_disconnect_at?.replace('T', ' ').slice(0, 16) ?? '—'}</div>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleReconnect}
              disabled={actionInFlight !== null}
              variant={liveOk ? 'outline' : 'default'}
            >
              <QrCode className="w-4 h-4 mr-2" />
              {liveOk ? 'Gerar novo QR' : 'Reconectar'}
            </Button>
            <Button
              onClick={handleRestart}
              disabled={actionInFlight !== null}
              variant="outline"
            >
              <Power className="w-4 h-4 mr-2" />
              Reiniciar instância
            </Button>
          </div>
          {qr && (
            <div className="pt-4 flex flex-col items-center gap-2 border-t">
              <p className="text-sm font-medium">Escaneie no WhatsApp</p>
              <img
                src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
                alt="QR Code"
                className="w-64 h-64 border rounded"
              />
              <Button size="sm" variant="ghost" onClick={() => setQr(null)}>Fechar</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Métricas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas 24h</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <Metric label="Recebidas" value={status?.metrics.msg_in_24h ?? 0} />
            <Metric label="Enviadas" value={status?.metrics.msg_out_24h ?? 0} />
            <Metric label="Sessões ativas" value={status?.metrics.sessoes_ativas ?? 0} />
            <Metric
              label="Alertas"
              value={status?.metrics.alertas_nao_lidos ?? 0}
              tone={status && status.metrics.alertas_nao_lidos > 0 ? 'alert' : 'normal'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Configurações da instância
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingSettings || !settings ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <>
              <SettingsToggle
                id="rejectCall"
                label="Rejeitar chamadas automaticamente"
                description="Quando alguém liga no WhatsApp, rejeita e envia mensagem padrão."
                checked={settings.rejectCall ?? false}
                onChange={v => saveSettings({ rejectCall: v })}
              />
              {settings.rejectCall && (
                <div className="ml-8 space-y-2">
                  <Label htmlFor="msgCall">Mensagem ao rejeitar</Label>
                  <Input
                    id="msgCall"
                    value={settings.msgCall ?? ''}
                    placeholder="Não atendemos chamadas. Envie mensagem por favor."
                    onChange={e => setSettings({ ...settings, msgCall: e.target.value })}
                    onBlur={() => saveSettings({ msgCall: settings.msgCall })}
                  />
                </div>
              )}
              <SettingsToggle
                id="groupsIgnore"
                label="Ignorar grupos"
                description="Não dispara webhook nem agente para mensagens de grupo."
                checked={settings.groupsIgnore ?? true}
                onChange={v => saveSettings({ groupsIgnore: v })}
              />
              <SettingsToggle
                id="alwaysOnline"
                label="Sempre online"
                description="Mantém presença 'online' o tempo todo (não recomendado)."
                checked={settings.alwaysOnline ?? false}
                onChange={v => saveSettings({ alwaysOnline: v })}
              />
              <SettingsToggle
                id="readMessages"
                label="Marcar como lido automaticamente"
                description="Confirma leitura assim que mensagem chega."
                checked={settings.readMessages ?? false}
                onChange={v => saveSettings({ readMessages: v })}
              />
              <SettingsToggle
                id="syncFullHistory"
                label="Sincronizar histórico completo"
                description="Em reconexões, baixa todo histórico (lento, alto custo)."
                checked={settings.syncFullHistory ?? false}
                onChange={v => saveSettings({ syncFullHistory: v })}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({
  label, value, tone = 'normal',
}: { label: string; value: number; tone?: 'normal' | 'alert' }) {
  return (
    <div>
      <div className={cn('text-3xl font-semibold', tone === 'alert' && 'text-destructive')}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  )
}

function SettingsToggle({
  id, label, description, checked, onChange,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label htmlFor={id} className="cursor-pointer">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
