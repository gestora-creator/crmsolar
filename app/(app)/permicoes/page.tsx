'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { PageHeader } from '@/components/common/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertCircle, KeyRound, Plus, Trash2, Users, LogIn } from 'lucide-react'
import { toast } from 'sonner'

interface User {
  id: string
  email: string
  role: 'admin' | 'limitada'
  login_count: number
  last_login_at: string | null
  created_at: string
  permissions: Record<string, boolean>
}

const AVAILABLE_PERMISSIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'tecnica', label: 'Dados Técnicos' },
  { id: 'interacoes', label: 'Interações' },
  { id: 'tags', label: 'Tags' },
  { id: 'faturas', label: 'Faturas' },
  { id: 'relatorios', label: 'Relatórios' },
  { id: 'permicoes', label: 'Permissões' },
]

export default function PermissoesPage() {
  const router = useRouter()
  const { user, role } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'limitada' as 'admin' | 'limitada',
    permissions: {} as Record<string, boolean>,
  })

  useEffect(() => {
    if (role !== 'admin') {
      router.push('/faturas')
      return
    }
    fetchUsers()
  }, [role, router])

  const getAuthToken = async () => {
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session?.access_token) {
        console.error('Erro ao obter token:', error)
        return null
      }
      return data.session.access_token
    } catch (error) {
      console.error('Erro ao obter sessão:', error)
      return null
    }
  }

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const token = await getAuthToken()
      if (!token) {
        toast.error('Erro de autenticação')
        return
      }

      const response = await fetch('/api/permicoes/usuarios', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao carregar usuários')
      }
      const data = await response.json()
      setUsers(data)
    } catch (error) {
      console.error('Erro:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar usuários')
    } finally {
      setLoading(false)
    }
  }

  const handleAddUser = async () => {
    if (isCreating) {
      return
    }

    setIsCreating(true)
    try {
      
      if (!formData.email || !formData.password) {
        toast.error('Email e senha são obrigatórios')
        return
      }

      // Validar formato de email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email)) {
        toast.error('Email inválido')
        return
      }

      // Verificar se email já existe na lista
      const emailExists = users.some(u => u.email.toLowerCase() === formData.email.toLowerCase())
      if (emailExists) {
        toast.error('Este email já está cadastrado no sistema')
        return
      }

      // Validar senha mínima
      if (formData.password.length < 6) {
        toast.error('A senha deve ter no mínimo 6 caracteres')
        return
      }

      const token = await getAuthToken()
      if (!token) {
        toast.error('Erro de autenticação')
        return
      }

      const response = await fetch('/api/permicoes/usuarios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        // Mensagens de erro específicas
        if (data.error?.includes('já está cadastrado') || data.error?.includes('already been registered')) {
          toast.error('Este email já está em uso. Tente outro.')
        } else if (data.error?.includes('Execute o SQL')) {
          toast.error('Sistema não configurado. Execute o SQL de migração.')
        } else {
          toast.error(data.error || 'Erro ao criar usuário')
        }
        return
      }

      toast.success('✅ Usuário criado com sucesso!')
      setFormData({ email: '', password: '', role: 'limitada', permissions: {} })
      setIsOpen(false)
      await fetchUsers()
    } catch (error) {
      console.error('❌ Erro capturado:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao criar usuário')
    } finally {
      setIsCreating(false)
    }
  }

  const handleUpdatePermissions = async () => {
    if (!selectedUser) return

    try {
      const token = await getAuthToken()
      if (!token) {
        toast.error('Erro de autenticação')
        return
      }

      const response = await fetch(`/api/permicoes/usuarios/${selectedUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          role: formData.role,
          permissions: formData.permissions,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao atualizar permissões')
      }

      toast.success('Permissões atualizadas!')
      setSelectedUser(null)
      await fetchUsers()
    } catch (error) {
      console.error('Erro:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar permissões')
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Tem certeza que deseja remover este usuário?')) return

    try {
      const token = await getAuthToken()
      if (!token) {
        toast.error('Erro de autenticação')
        return
      }

      const response = await fetch(`/api/permicoes/usuarios/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao remover usuário')
      }

      toast.success('Usuário removido!')
      await fetchUsers()
    } catch (error) {
      console.error('Erro:', error)
      toast.error(error instanceof Error ? error.message : 'Erro ao remover usuário')
    }
  }

  const handlePermissionToggle = (permissionId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [permissionId]: checked,
      },
    }))
  }

  const openEditDialog = (user: User) => {
    setSelectedUser(user)
    setFormData({
      email: user.email,
      password: '',
      role: user.role,
      permissions: user.permissions,
    })
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Nunca'
    return new Date(dateString).toLocaleString('pt-BR')
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">Carregando permissões...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-0"><div className="space-y-6 mt-6">
      <PageHeader
        title={<h1 className="text-lg font-semibold leading-tight">Permissões</h1>}
        subtitle={<p className="text-xs text-muted-foreground">Gerencie usuários e permissões de acesso</p>}
        actions={
          <Button size="sm" className="gap-1.5" onClick={() => {
            setSelectedUser(null)
            setFormData({ email: '', password: '', role: 'limitada', permissions: {} })
            setIsOpen(true)
          }}>
            <Plus className="h-3.5 w-3.5" />
            Novo Usuário
          </Button>
        }
      />

      <Tabs defaultValue="usuarios" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="usuarios" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="acessos" className="flex items-center gap-2">
            <LogIn className="h-4 w-4" />
            Acessos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios" className="space-y-4">
          <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Total de {users.length} usuário{users.length !== 1 ? 's' : ''}
              </p>
          </div>

          <div className="grid gap-4">
            {users.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado</p>
                </CardContent>
              </Card>
            ) : (
              users.map(user => {
                const isGestora = user.email.toLowerCase().includes('gestora')
                return (
                <Card key={user.id} className={`border hover:shadow-md transition-shadow ${
                  isGestora 
                    ? 'border-yellow-500 dark:border-yellow-600 shadow-md shadow-yellow-500/20' 
                    : 'border-blue-200 dark:border-blue-900/50'
                }`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {user.email}
                          <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                            {isGestora ? 'Super Admin' : (user.role === 'admin' ? 'Administrador' : 'Limitada')}
                          </Badge>
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Criado em {formatDate(user.created_at)}
                        </CardDescription>
                        {isGestora && (
                          <div className="mt-1 rounded bg-yellow-50 dark:bg-yellow-950/30 px-2 py-1 text-xs font-semibold text-yellow-700 dark:text-yellow-200">
                            🔒 Super Admin Protegido
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(user)}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteUser(user.id)}
                          disabled={user.email.toLowerCase().includes('gestora')}
                          title={user.email.toLowerCase().includes('gestora') ? 'Usuário principal não pode ser removido' : 'Remover usuário'}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Total Logins</p>
                        <p className="text-lg font-bold">{user.login_count}</p>
                      </div>
                      <div className="col-span-3">
                        <p className="text-xs font-medium text-muted-foreground">Último Login</p>
                        <p className="text-sm">{formatDate(user.last_login_at)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="acessos" className="space-y-4">
          <h2 className="text-lg font-semibold">Histórico de Acessos</h2>
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <LogIn className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Histórico de acessos em breve</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
            <DialogDescription>
              Crie um novo usuário e defina suas permissões de acesso
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <Label htmlFor="email" className="text-sm font-semibold">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@example.com"
                value={formData.email}
                onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                autoComplete="off"
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="password" className="text-sm font-semibold">Senha *</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={formData.password}
                onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
                autoComplete="new-password"
                minLength={6}
                className="mt-2"
              />
            </div>

            <div>
              <Label htmlFor="role" className="text-sm font-semibold">Tipo de Acesso *</Label>
              <Select value={formData.role} onValueChange={value => 
                setFormData(prev => ({ ...prev, role: value as 'admin' | 'limitada' }))
              }>
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador - Acesso Completo</SelectItem>
                  <SelectItem value="limitada">Limitado - Acesso Seletivo</SelectItem>
                </SelectContent>
              </Select>
              
              {formData.role === 'admin' && (
                <div className="mt-3 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-900/50 px-4 py-3">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                    ✓ Acesso total a todas as funcionalidades do sistema
                  </p>
                </div>
              )}
              
              {formData.role === 'limitada' && (
                <div className="mt-3 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border border-amber-200 dark:border-amber-900/50 px-4 py-3">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                    Selecione abaixo as funcionalidades que este usuário pode acessar
                  </p>
                </div>
              )}
            </div>

            {formData.role === 'limitada' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-semibold">Permissões *</Label>
                  <span className="text-xs text-muted-foreground">Selecione pelo menos uma</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {AVAILABLE_PERMISSIONS.map(perm => (
                    <div
                      key={perm.id}
                      onClick={() => handlePermissionToggle(perm.id, !formData.permissions[perm.id])}
                      className={`relative flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                        formData.permissions[perm.id]
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20 hover:border-blue-300'
                      }`}
                    >
                      <Checkbox
                        id={perm.id}
                        checked={formData.permissions[perm.id] || false}
                        onCheckedChange={checked => 
                          handlePermissionToggle(perm.id, checked === true)
                        }
                        className="cursor-pointer"
                      />
                      <label
                        htmlFor={perm.id}
                        className="text-sm font-medium cursor-pointer flex-1"
                      >
                        {perm.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAddUser}
                disabled={isCreating}
                className="flex-1 gap-2"
              >
                <Plus className="h-4 w-4" />
                {isCreating ? 'Criando...' : 'Criar Usuário'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedUser} onOpenChange={open => !open && setSelectedUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Permissões</DialogTitle>
            <DialogDescription>
              Atualize as permissões do usuário {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-4">
              {selectedUser.email.toLowerCase().includes('gestora') && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 px-4 py-3">
                  <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                    ⚠️ Usuário Principal - Administrador do Sistema
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    Este usuário tem acesso completo e não pode ser removido.
                  </p>
                </div>
              )}
              
              <div>
                <Label htmlFor="edit-role">Nível de Acesso</Label>
                <Select 
                  value={formData.role} 
                  onValueChange={value => 
                    setFormData(prev => ({ ...prev, role: value as 'admin' | 'limitada' }))
                  }
                  disabled={selectedUser.email.toLowerCase().includes('gestora')}
                >
                  <SelectTrigger id="edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador (Acesso Total)</SelectItem>
                    <SelectItem value="limitada">Limitada (Somente Selecionadas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-3 block">Permissões</Label>
                <div className="space-y-2">
                  {AVAILABLE_PERMISSIONS.map(perm => (
                    <div key={perm.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`edit-${perm.id}`}
                        checked={formData.permissions[perm.id] || false}
                        onCheckedChange={checked => 
                          handlePermissionToggle(perm.id, checked === true)
                        }
                      />
                      <label
                        htmlFor={`edit-${perm.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {perm.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total Logins</p>
                  <p className="text-lg font-bold">{selectedUser.login_count}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Último Login</p>
                  <p className="text-sm">{formatDate(selectedUser.last_login_at)}</p>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setSelectedUser(null)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleUpdatePermissions}
                  className="flex-1"
                >
                  Salvar Mudanças
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </div>
  )
}
