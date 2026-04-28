// ─────────────────────────────────────────────
// TIMELINE — Tipos de domínio (v2.0)
// ─────────────────────────────────────────────
export type TimelineTipoEvento =
  | 'mensagem_whatsapp'
  | 'mensagem_email'
  | 'ligacao_telefone'
  | 'reuniao'
  | 'visita_tecnica'
  | 'chamado_aberto'
  | 'chamado_encerrado'
  | 'relatorio_enviado'
  | 'relatorio_visualizado'
  | 'pesquisa_respondida'
  | 'nota_interna'
  | 'agente_acao'
  | 'agente_resumo'
  | 'followup'
  | 'pos_venda'
  | 'evento_sistema'

export type TimelineOrigem =
  | 'manual'
  | 'automatico'
  | 'integracao'
  | 'n8n_webhook'
  | 'agente_ia'
  | 'sistema'
  | 'importacao'

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      crm_clientes: {
        Row: {
          id: string
          razao_social: string
          tipo_cliente: string | null
          documento: string | null
          nome_fantasia: string | null
          apelido_relacionamento: string | null
          telefone_principal: string | null
          email_principal: string | null
          logradouro: string | null
          numero: string | null
          complemento: string | null
          bairro: string | null
          municipio: string | null
          uf: string | null
          cep: string | null
          observacoes: string | null
          tags: string[] | null
          favorito: boolean | null
          created_at: string
          updated_at: string
          // Novos campos
          status: string | null
          tipo_relacionamento: string | null
          ins_estadual: string | null
          emp_redes: string | null
          data_fundacao: string | null
          emp_site: string | null
          ins_municipal: string | null
          grupo_economico_id: string | null
          estado_de_chamado: string | null
          historico_validacao: Json | null
          tipo_estabelecimento: 'matriz' | 'filial' | 'unico' | null
          cnpj_base: string | null
        }
        Insert: {
          id?: string
          razao_social: string
          tipo_cliente?: string | null
          documento?: string | null
          nome_fantasia?: string | null
          apelido_relacionamento?: string | null
          telefone_principal?: string | null
          email_principal?: string | null
          logradouro?: string | null
          numero?: string | null
          complemento?: string | null
          bairro?: string | null
          municipio?: string | null
          uf?: string | null
          cep?: string | null
          observacoes?: string | null
          tags?: string[] | null
          favorito?: boolean | null
          created_at?: string
          updated_at?: string
          // Novos campos
          status?: string | null
          tipo_relacionamento?: string | null
          ins_estadual?: string | null
          emp_redes?: string | null
          data_fundacao?: string | null
          emp_site?: string | null
          ins_municipal?: string | null
          grupo_economico_id?: string | null
          estado_de_chamado?: string | null
          historico_validacao?: Json | null
          tipo_estabelecimento?: 'matriz' | 'filial' | 'unico' | null
          cnpj_base?: string | null
        }
        Update: {
          id?: string
          razao_social?: string
          tipo_cliente?: string | null
          documento?: string | null
          nome_fantasia?: string | null
          apelido_relacionamento?: string | null
          telefone_principal?: string | null
          email_principal?: string | null
          logradouro?: string | null
          numero?: string | null
          complemento?: string | null
          bairro?: string | null
          municipio?: string | null
          uf?: string | null
          cep?: string | null
          observacoes?: string | null
          tags?: string[] | null
          favorito?: boolean | null
          created_at?: string
          updated_at?: string
          // Novos campos
          status?: string | null
          tipo_relacionamento?: string | null
          ins_estadual?: string | null
          emp_redes?: string | null
          data_fundacao?: string | null
          emp_site?: string | null
          ins_municipal?: string | null
          grupo_economico_id?: string | null
          estado_de_chamado?: string | null
          historico_validacao?: Json | null
        }
        Relationships: []
      }
      crm_contatos: {
        Row: {
          id: string
          nome_completo: string
          apelido_relacionamento: string | null
          cargo: string | null
          celular: string | null
          email: string | null
          data_aniversario: string | null
          pessoa_site: string | null
          pessoa_redes: string | null
          autorizacao_mensagem: boolean | null
          canal_relatorio: string[] | null
          observacoes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nome_completo: string
          apelido_relacionamento?: string | null
          cargo?: string | null
          celular?: string | null
          email?: string | null
          data_aniversario?: string | null
          pessoa_site?: string | null
          pessoa_redes?: string | null
          autorizacao_mensagem?: boolean | null
          canal_relatorio?: string[] | null
          observacoes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome_completo?: string
          apelido_relacionamento?: string | null
          cargo?: string | null
          celular?: string | null
          email?: string | null
          data_aniversario?: string | null
          pessoa_site?: string | null
          pessoa_redes?: string | null
          autorizacao_mensagem?: boolean | null
          canal_relatorio?: string[] | null
          observacoes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_clientes_contatos: {
        Row: {
          id: string
          cliente_id: string
          contato_id: string
          contato_principal: boolean
          cargo_no_cliente: string | null
          observacoes_relacionamento: string | null
          created_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          contato_id: string
          contato_principal?: boolean
          cargo_no_cliente?: string | null
          observacoes_relacionamento?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          contato_id?: string
          contato_principal?: boolean
          cargo_no_cliente?: string | null
          observacoes_relacionamento?: string | null
          created_at?: string
        }
        Relationships: []
      }
      relatorio_envios: {
        Row: {
          id: number
          created_at: string
          cliente_id: string | null
          contato_id: string | null
          status_envio: string | null
          viewed: boolean | null
          tipo_relatorio: string | null
          resultado_envio: Json | null
        }
        Insert: {
          id?: number
          created_at?: string
          cliente_id?: string | null
          contato_id?: string | null
          status_envio?: string | null
          viewed?: boolean | null
          tipo_relatorio?: string | null
          resultado_envio?: Json | null
        }
        Update: {
          id?: number
          created_at?: string
          cliente_id?: string | null
          contato_id?: string | null
          status_envio?: string | null
          viewed?: boolean | null
          tipo_relatorio?: string | null
          resultado_envio?: Json | null
        }
        Relationships: []
      }
      crm_tags: {
        Row: {
          id: string
          nome: string
          created_at: string
        }
        Insert: {
          id?: string
          nome: string
          created_at?: string
        }
        Update: {
          id?: string
          nome?: string
          created_at?: string
        }
        Relationships: []
      }
      crm_clientes_tecnica: {
        Row: {
          id: string
          cliente_id: string | null
          documento: string
          razao_social: string | null
          nome_planta: string | null
          modalidade: string | null
          classificacao: string | null
          tipo_local: string | null
          possui_internet: boolean | null
          data_install: string | null
          venc_garantia: string | null
          potencia_usina_kwp: number | null
          quant_inverter: number | null
          marca_inverter: string | null
          mod_inverter: string | null
          serie_inverter: string | null
          quant_modulos: number | null
          marca_modulos: string | null
          mod_modulos: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cliente_id?: string | null
          documento: string
          razao_social?: string | null
          nome_planta?: string | null
          modalidade?: string | null
          classificacao?: string | null
          tipo_local?: string | null
          possui_internet?: boolean | null
          data_install?: string | null
          venc_garantia?: string | null
          potencia_usina_kwp?: number | null
          quant_inverter?: number | null
          marca_inverter?: string | null
          mod_inverter?: string | null
          serie_inverter?: string | null
          quant_modulos?: number | null
          marca_modulos?: string | null
          mod_modulos?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string | null
          documento?: string
          razao_social?: string | null
          nome_planta?: string | null
          modalidade?: string | null
          classificacao?: string | null
          tipo_local?: string | null
          possui_internet?: boolean | null
          data_install?: string | null
          venc_garantia?: string | null
          potencia_usina_kwp?: number | null
          quant_inverter?: number | null
          marca_inverter?: string | null
          mod_inverter?: string | null
          serie_inverter?: string | null
          quant_modulos?: number | null
          marca_modulos?: string | null
          mod_modulos?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      fila_extracao: {
        Row: {
          id: string
          UC: string | null
          cliente: string | null
          mes_referente: string | null
          injetado: string | number | null
          dados_inversor: Json | null
          caminho_arquivo: string | null
          status: string | null
          dados_extraidos: Json | null
          cnpj: string | null
          created_at: string
        }
        Insert: {
          id?: string
          UC?: string | null
          cliente?: string | null
          mes_referente?: string | null
          injetado?: string | number | null
          dados_inversor?: Json | null
          caminho_arquivo?: string | null
          status?: string | null
          dados_extraidos?: Json | null
          cnpj?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          UC?: string | null
          cliente?: string | null
          mes_referente?: string | null
          injetado?: string | number | null
          dados_inversor?: Json | null
          caminho_arquivo?: string | null
          status?: string | null
          dados_extraidos?: Json | null
          cnpj?: string | null
          created_at?: string
        }
        Relationships: []
      }
      growatt: {
        Row: {
          id?: string
          CLIENTE: string | null
          "CPF/CNPJ": string | null
          UNIDADES_CONSUMIDORAS: string | null
          Plant_ID: string | null
          INVERSOR: string | null
          saldo_credito: number | null
          porcentagem: number | null
          "histórico_gerado": Json | null
          "data_ativação": string | null
          Geracao_Ac_Mensal: number | null
          Geracao_Ac_Anual: number | null
          Retorno_Financeiro: number | null
        }
        Insert: {
          id?: string
          CLIENTE?: string | null
          "CPF/CNPJ"?: string | null
          UNIDADES_CONSUMIDORAS?: string | null
          Plant_ID?: string | null
          INVERSOR?: string | null
          saldo_credito?: number | null
          porcentagem?: number | null
          "histórico_gerado"?: Json | null
          "data_ativação"?: string | null
          Geracao_Ac_Mensal?: number | null
          Geracao_Ac_Anual?: number | null
          Retorno_Financeiro?: number | null
        }
        Update: {
          id?: string
          CLIENTE?: string | null
          "CPF/CNPJ"?: string | null
          UNIDADES_CONSUMIDORAS?: string | null
          Plant_ID?: string | null
          INVERSOR?: string | null
          saldo_credito?: number | null
          porcentagem?: number | null
          "histórico_gerado"?: Json | null
          "data_ativação"?: string | null
          Geracao_Ac_Mensal?: number | null
          Geracao_Ac_Anual?: number | null
          Retorno_Financeiro?: number | null
        }
        Relationships: []
      }
      grupos_economicos: {
        Row: {
          id: string
          nome: string
          descricao: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          nome: string
          descricao?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          nome?: string
          descricao?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_ucs_validacao: {
        Row: {
          id: string
          documento: string
          uc: string
          estado_de_chamado: string | null
          historico_validacao: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          documento: string
          uc: string
          estado_de_chamado?: string | null
          historico_validacao?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          documento?: string
          uc?: string
          estado_de_chamado?: string | null
          historico_validacao?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      // ===== TABELA: base (faturamento UCs — sem migration, criada direto no Supabase) =====
      base: {
        Row: {
          unidade: string
          nome_cliente: string
          documento: string | null
          tipo: string | null
          rateio: string | null
          data_ativacao: string | null
          historico_gerado: string | null
          saldo_credito: string | null
          roi: number | null
          projetada: number | null
          dados_extraidos: Json | null
          observacoes: string | null
          autoconsumo: boolean | null
          feito: string | null
          caminho_fatura: string | null
          cliente_id: string | null
        }
        Insert: {
          unidade: string
          nome_cliente: string
          documento?: string | null
          tipo?: string | null
          rateio?: string | null
          data_ativacao?: string | null
          historico_gerado?: string | null
          saldo_credito?: string | null
          roi?: number | null
          projetada?: number | null
          dados_extraidos?: Json | null
          observacoes?: string | null
          autoconsumo?: boolean | null
          feito?: string | null
          caminho_fatura?: string | null
          cliente_id?: string | null
        }
        Update: {
          unidade?: string
          nome_cliente?: string
          documento?: string | null
          tipo?: string | null
          rateio?: string | null
          data_ativacao?: string | null
          historico_gerado?: string | null
          saldo_credito?: string | null
          roi?: number | null
          projetada?: number | null
          dados_extraidos?: Json | null
          observacoes?: string | null
          autoconsumo?: boolean | null
          feito?: string | null
          caminho_fatura?: string | null
          cliente_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "base_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "crm_clientes"
            referencedColumns: ["id"]
          }
        ]
      }
      user_roles: {
        Row: {
          user_id: string
          role: Database['public']['Enums']['app_role']
          created_at: string
          updated_at: string
          login_count: number | null
          last_login_at: string | null
          permissions: Json | null
        }
        Insert: {
          user_id: string
          role?: Database['public']['Enums']['app_role']
          created_at?: string
          updated_at?: string
          login_count?: number | null
          last_login_at?: string | null
          permissions?: Json | null
        }
        Update: {
          user_id?: string
          role?: Database['public']['Enums']['app_role']
          created_at?: string
          updated_at?: string
          login_count?: number | null
          last_login_at?: string | null
          permissions?: Json | null
        }
        Relationships: []
      }

      // ===== TABELA: user_login_history (histórico de logins) =====
      user_login_history: {
        Row: {
          id: string
          user_id: string
          user_email: string
          login_at: string
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          user_email: string
          login_at?: string
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          user_email?: string
          login_at?: string
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Relationships: []
      }

      // ===== TABELA: timeline_relacional =====
      timeline_relacional: {
        Row: {
          id: string
          cliente_id: string
          contato_id: string | null
          tipo_evento: TimelineTipoEvento
          canal: string | null
          direcao: string | null
          resumo_chave: string
          tom_conversa: string | null
          conteudo_longo: string | null
          metadata: Json | null
          origem: TimelineOrigem | null
          autor: string | null
          // v2.0 — snapshots para histórico imutável
          agente_id: string | null
          agente_nome: string | null
          agente_avatar_url: string | null
          relacionamento_nome: string | null
          ocorrido_em: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cliente_id: string
          contato_id?: string | null
          tipo_evento: TimelineTipoEvento
          canal?: string | null
          direcao?: string | null
          resumo_chave: string
          tom_conversa?: string | null
          conteudo_longo?: string | null
          metadata?: Json | null
          origem?: TimelineOrigem | null
          autor?: string | null
          agente_id?: string | null
          agente_nome?: string | null
          agente_avatar_url?: string | null
          relacionamento_nome?: string | null
          ocorrido_em?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          cliente_id?: string
          contato_id?: string | null
          tipo_evento?: TimelineTipoEvento
          canal?: string | null
          direcao?: string | null
          resumo_chave?: string
          tom_conversa?: string | null
          conteudo_longo?: string | null
          metadata?: Json | null
          origem?: TimelineOrigem | null
          autor?: string | null
          agente_id?: string | null
          agente_nome?: string | null
          agente_avatar_url?: string | null
          relacionamento_nome?: string | null
          ocorrido_em?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      // ===== TABELA: chamados_atendimento =====
      chamados_atendimento: {
        Row: {
          id: string
          cliente_id: string
          contato_id: string | null
          timeline_evento_id: string | null
          tipo: string
          status: string
          descricao: string
          resolucao: string | null
          atribuido_a: string | null
          link_agendamento: string | null
          prioridade: string | null
          created_at: string
          updated_at: string
          resolvido_em: string | null
        }
        Insert: {
          id?: string
          cliente_id: string
          contato_id?: string | null
          timeline_evento_id?: string | null
          tipo: string
          status?: string
          descricao: string
          resolucao?: string | null
          atribuido_a?: string | null
          link_agendamento?: string | null
          prioridade?: string | null
          created_at?: string
          updated_at?: string
          resolvido_em?: string | null
        }
        Update: {
          id?: string
          cliente_id?: string
          contato_id?: string | null
          timeline_evento_id?: string | null
          tipo?: string
          status?: string
          descricao?: string
          resolucao?: string | null
          atribuido_a?: string | null
          link_agendamento?: string | null
          prioridade?: string | null
          created_at?: string
          updated_at?: string
          resolvido_em?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      view_faturas_completa: {
        Row: {
          UC_Final: string | null
          id_fatura: number | null
          cliente_fatura: string | null
          uc_fatura: string | null
          mes_referente: string | null
          injetado: number | null
          dados_inversor: Json | null
          caminho_arquivo: string | null
          status: string | null
          dados_extraidos: Json | null
          cliente_cadastro: string | null
          cpf_cnpj: string | null
          uc_cadastro: string | null
          Plant_ID: string | null
          INVERSOR: string | null
          saldo_credito: number | null
          porcentagem: number | null
          historico_gerado: Json | null
          data_ativacao: string | null
          meta_mensal: number | null
          Geracao_Ac_Anual: number | null
          Retorno_Financeiro: number | null
        }
        Insert: {
          [_ in never]: never
        }
        Update: {
          [_ in never]: never
        }
        Relationships: []
      }
    }
    Functions: {
      find_or_create_grupo_economico: {
        Args: { p_nome: string }
        Returns: {
          id: string
          nome: string
          descricao: string | null
          created_at: string
          updated_at: string
        }[]
      }
      get_tag_counts: {
        Args: Record<string, never>
        Returns: {
          nome: string
          count: number
        }[]
      }
    }
    Enums: {
      app_role: 'admin' | 'limitada'
    }
  }
}
