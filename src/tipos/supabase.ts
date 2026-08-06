export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      actividades_tenant: {
        Row: {
          actividad_id: string
          activo: boolean
          created_at: string
          id: string
          tenant_id: string
        }
        Insert: {
          actividad_id: string
          activo?: boolean
          created_at?: string
          id?: string
          tenant_id: string
        }
        Update: {
          actividad_id?: string
          activo?: boolean
          created_at?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "actividades_tenant_actividad_id_fkey"
            columns: ["actividad_id"]
            isOneToOne: false
            referencedRelation: "actividades_vulnerables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actividades_tenant_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      actividades_vulnerables: {
        Row: {
          created_at: string
          descripcion: string | null
          fraccion: string
          id: string
          nombre: string
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          fraccion: string
          id?: string
          nombre: string
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          fraccion?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      alertas: {
        Row: {
          atendida_en: string | null
          atendida_por: string | null
          caso_id: string | null
          consulta_screening_id: string | null
          created_at: string
          detalle: Json
          estado: Database["public"]["Enums"]["estado_alerta"]
          evaluacion_id: string | null
          id: string
          tenant_id: string
          tipo: Database["public"]["Enums"]["tipo_alerta"]
          titulo: string
        }
        Insert: {
          atendida_en?: string | null
          atendida_por?: string | null
          caso_id?: string | null
          consulta_screening_id?: string | null
          created_at?: string
          detalle?: Json
          estado?: Database["public"]["Enums"]["estado_alerta"]
          evaluacion_id?: string | null
          id?: string
          tenant_id: string
          tipo: Database["public"]["Enums"]["tipo_alerta"]
          titulo: string
        }
        Update: {
          atendida_en?: string | null
          atendida_por?: string | null
          caso_id?: string | null
          consulta_screening_id?: string | null
          created_at?: string
          detalle?: Json
          estado?: Database["public"]["Enums"]["estado_alerta"]
          evaluacion_id?: string | null
          id?: string
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["tipo_alerta"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_atendida_por_fk"
            columns: ["tenant_id", "atendida_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "alertas_caso_compuesta_fk"
            columns: ["tenant_id", "caso_id"]
            isOneToOne: false
            referencedRelation: "casos"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "alertas_evaluacion_fk"
            columns: ["tenant_id", "evaluacion_id"]
            isOneToOne: false
            referencedRelation: "evaluaciones_umbral"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "alertas_screening_fk"
            columns: ["tenant_id", "consulta_screening_id"]
            isOneToOne: false
            referencedRelation: "consultas_screening"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "alertas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      aviso_operaciones: {
        Row: {
          aviso_id: string
          created_at: string
          evaluacion_id: string
          id: string
          operacion_id: string
          tenant_id: string
        }
        Insert: {
          aviso_id: string
          created_at?: string
          evaluacion_id: string
          id?: string
          operacion_id: string
          tenant_id: string
        }
        Update: {
          aviso_id?: string
          created_at?: string
          evaluacion_id?: string
          id?: string
          operacion_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aviso_operaciones_aviso_fk"
            columns: ["tenant_id", "aviso_id"]
            isOneToOne: false
            referencedRelation: "avisos"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "aviso_operaciones_evaluacion_fk"
            columns: ["tenant_id", "evaluacion_id"]
            isOneToOne: false
            referencedRelation: "evaluaciones_umbral"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "aviso_operaciones_operacion_fk"
            columns: ["tenant_id", "operacion_id"]
            isOneToOne: false
            referencedRelation: "operaciones"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "aviso_operaciones_operacion_fk"
            columns: ["tenant_id", "operacion_id"]
            isOneToOne: false
            referencedRelation: "operaciones_vigentes"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "aviso_operaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      avisos: {
        Row: {
          actividad_id: string
          acuse_registrado_en: string | null
          acuse_storage_path: string | null
          aprobado_en: string | null
          aprobado_por: string | null
          created_at: string
          estatus: Database["public"]["Enums"]["estatus_aviso"]
          formato_aviso_id: string
          fragmentos: number
          hash_xml: string | null
          id: string
          periodo: string
          tenant_id: string
          tipo: Database["public"]["Enums"]["tipo_aviso"]
          xml_storage_path: string | null
        }
        Insert: {
          actividad_id: string
          acuse_registrado_en?: string | null
          acuse_storage_path?: string | null
          aprobado_en?: string | null
          aprobado_por?: string | null
          created_at?: string
          estatus?: Database["public"]["Enums"]["estatus_aviso"]
          formato_aviso_id: string
          fragmentos?: number
          hash_xml?: string | null
          id?: string
          periodo: string
          tenant_id: string
          tipo: Database["public"]["Enums"]["tipo_aviso"]
          xml_storage_path?: string | null
        }
        Update: {
          actividad_id?: string
          acuse_registrado_en?: string | null
          acuse_storage_path?: string | null
          aprobado_en?: string | null
          aprobado_por?: string | null
          created_at?: string
          estatus?: Database["public"]["Enums"]["estatus_aviso"]
          formato_aviso_id?: string
          fragmentos?: number
          hash_xml?: string | null
          id?: string
          periodo?: string
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["tipo_aviso"]
          xml_storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avisos_actividad_id_fkey"
            columns: ["actividad_id"]
            isOneToOne: false
            referencedRelation: "actividades_vulnerables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_aprobado_por_fk"
            columns: ["tenant_id", "aprobado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "avisos_formato_aviso_id_fkey"
            columns: ["formato_aviso_id"]
            isOneToOne: false
            referencedRelation: "formatos_aviso"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      beneficiarios_controladores: {
        Row: {
          cliente_id: string
          control_por: Database["public"]["Enums"]["control_beneficiario"]
          created_at: string
          curp: string | null
          es_declaracion: boolean
          id: string
          nombre: string
          participacion_pct: number | null
          rfc: string | null
          tenant_id: string
        }
        Insert: {
          cliente_id: string
          control_por?: Database["public"]["Enums"]["control_beneficiario"]
          created_at?: string
          curp?: string | null
          es_declaracion?: boolean
          id?: string
          nombre: string
          participacion_pct?: number | null
          rfc?: string | null
          tenant_id: string
        }
        Update: {
          cliente_id?: string
          control_por?: Database["public"]["Enums"]["control_beneficiario"]
          created_at?: string
          curp?: string | null
          es_declaracion?: boolean
          id?: string
          nombre?: string
          participacion_pct?: number | null
          rfc?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beneficiarios_cliente_fk"
            columns: ["tenant_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_finales"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "beneficiarios_controladores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bitacora: {
        Row: {
          actor_id: string | null
          datos: Json
          evento: string
          hash: string
          hash_previo: string
          id: number
          objeto_id: string | null
          objeto_tipo: string
          ocurrido_en: string
          secuencia: number
          tenant_id: string
        }
        Insert: {
          actor_id?: string | null
          datos?: Json
          evento: string
          hash: string
          hash_previo: string
          id?: never
          objeto_id?: string | null
          objeto_tipo: string
          ocurrido_en?: string
          secuencia: number
          tenant_id: string
        }
        Update: {
          actor_id?: string | null
          datos?: Json
          evento?: string
          hash?: string
          hash_previo?: string
          id?: never
          objeto_id?: string | null
          objeto_tipo?: string
          ocurrido_en?: string
          secuencia?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bitacora_actor_fk"
            columns: ["tenant_id", "actor_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "bitacora_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campos_expediente: {
        Row: {
          actividad_id: string
          aplica_a: Database["public"]["Enums"]["aplica_persona"]
          campo: string
          created_at: string
          etiqueta: string
          id: string
          obligatorio: boolean
          orden: number
          tipo_dato: Database["public"]["Enums"]["tipo_dato_campo"]
          validacion: Json
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          actividad_id: string
          aplica_a?: Database["public"]["Enums"]["aplica_persona"]
          campo: string
          created_at?: string
          etiqueta: string
          id?: string
          obligatorio?: boolean
          orden?: number
          tipo_dato: Database["public"]["Enums"]["tipo_dato_campo"]
          validacion?: Json
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          actividad_id?: string
          aplica_a?: Database["public"]["Enums"]["aplica_persona"]
          campo?: string
          created_at?: string
          etiqueta?: string
          id?: string
          obligatorio?: boolean
          orden?: number
          tipo_dato?: Database["public"]["Enums"]["tipo_dato_campo"]
          validacion?: Json
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campos_expediente_actividad_id_fkey"
            columns: ["actividad_id"]
            isOneToOne: false
            referencedRelation: "actividades_vulnerables"
            referencedColumns: ["id"]
          },
        ]
      }
      casos: {
        Row: {
          abierto_en: string
          abierto_por: string | null
          cerrado_en: string | null
          created_at: string
          estado: Database["public"]["Enums"]["estado_caso"]
          id: string
          resolucion: string | null
          tenant_id: string
          titulo: string
        }
        Insert: {
          abierto_en?: string
          abierto_por?: string | null
          cerrado_en?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_caso"]
          id?: string
          resolucion?: string | null
          tenant_id: string
          titulo: string
        }
        Update: {
          abierto_en?: string
          abierto_por?: string | null
          cerrado_en?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_caso"]
          id?: string
          resolucion?: string | null
          tenant_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "casos_abierto_por_fk"
            columns: ["tenant_id", "abierto_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "casos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogos_sat: {
        Row: {
          actividad_id: string | null
          catalogo: string
          codigo: string
          created_at: string
          descripcion: string
          id: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          actividad_id?: string | null
          catalogo: string
          codigo: string
          created_at?: string
          descripcion: string
          id?: string
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          actividad_id?: string | null
          catalogo?: string
          codigo?: string
          created_at?: string
          descripcion?: string
          id?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogos_sat_actividad_id_fkey"
            columns: ["actividad_id"]
            isOneToOne: false
            referencedRelation: "actividades_vulnerables"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes_finales: {
        Row: {
          actividad_economica: string | null
          apellido_materno: string | null
          apellido_paterno: string | null
          correo_electronico: string | null
          created_at: string
          created_by: string | null
          curp: string | null
          domicilio: Json
          domicilio_ambito:
            | Database["public"]["Enums"]["ambito_domicilio"]
            | null
          fecha_nacimiento_o_constitucion: string | null
          giro_mercantil: string | null
          id: string
          identidad_alterna: Json | null
          identificador_fideicomiso: string | null
          nacionalidad: string | null
          nivel_riesgo: Database["public"]["Enums"]["nivel_riesgo"] | null
          nombre_normalizado: string | null
          nombre_o_razon_social: string
          nombre_pila: string | null
          persona_id: string | null
          requiere_revision_identidad: boolean
          rfc: string | null
          telefono_numero: string | null
          telefono_pais: string | null
          tenant_id: string
          tipo_persona: Database["public"]["Enums"]["tipo_persona"]
        }
        Insert: {
          actividad_economica?: string | null
          apellido_materno?: string | null
          apellido_paterno?: string | null
          correo_electronico?: string | null
          created_at?: string
          created_by?: string | null
          curp?: string | null
          domicilio?: Json
          domicilio_ambito?:
            | Database["public"]["Enums"]["ambito_domicilio"]
            | null
          fecha_nacimiento_o_constitucion?: string | null
          giro_mercantil?: string | null
          id?: string
          identidad_alterna?: Json | null
          identificador_fideicomiso?: string | null
          nacionalidad?: string | null
          nivel_riesgo?: Database["public"]["Enums"]["nivel_riesgo"] | null
          nombre_normalizado?: string | null
          nombre_o_razon_social: string
          nombre_pila?: string | null
          persona_id?: string | null
          requiere_revision_identidad?: boolean
          rfc?: string | null
          telefono_numero?: string | null
          telefono_pais?: string | null
          tenant_id: string
          tipo_persona: Database["public"]["Enums"]["tipo_persona"]
        }
        Update: {
          actividad_economica?: string | null
          apellido_materno?: string | null
          apellido_paterno?: string | null
          correo_electronico?: string | null
          created_at?: string
          created_by?: string | null
          curp?: string | null
          domicilio?: Json
          domicilio_ambito?:
            | Database["public"]["Enums"]["ambito_domicilio"]
            | null
          fecha_nacimiento_o_constitucion?: string | null
          giro_mercantil?: string | null
          id?: string
          identidad_alterna?: Json | null
          identificador_fideicomiso?: string | null
          nacionalidad?: string | null
          nivel_riesgo?: Database["public"]["Enums"]["nivel_riesgo"] | null
          nombre_normalizado?: string | null
          nombre_o_razon_social?: string
          nombre_pila?: string | null
          persona_id?: string | null
          requiere_revision_identidad?: boolean
          rfc?: string | null
          telefono_numero?: string | null
          telefono_pais?: string | null
          tenant_id?: string
          tipo_persona?: Database["public"]["Enums"]["tipo_persona"]
        }
        Relationships: [
          {
            foreignKeyName: "clientes_created_by_fk"
            columns: ["tenant_id", "created_by"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "clientes_finales_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_finales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      consentimientos_comparticion: {
        Row: {
          alcance: Json
          created_at: string
          evidencia: Json
          id: string
          otorgado_en: string
          persona_id: string
          revocado_en: string | null
          tenant_id: string
        }
        Insert: {
          alcance?: Json
          created_at?: string
          evidencia?: Json
          id?: string
          otorgado_en?: string
          persona_id: string
          revocado_en?: string | null
          tenant_id: string
        }
        Update: {
          alcance?: Json
          created_at?: string
          evidencia?: Json
          id?: string
          otorgado_en?: string
          persona_id?: string
          revocado_en?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consentimientos_comparticion_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consentimientos_comparticion_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      consultas_screening: {
        Row: {
          coincidencias: Json
          created_at: string
          id: string
          listas_consultadas: Json
          razonamiento: string | null
          resolucion: Database["public"]["Enums"]["resolucion_screening"]
          resuelto_en: string | null
          resuelto_por: string | null
          resultado: Database["public"]["Enums"]["resultado_screening"]
          sujeto_id: string
          sujeto_tipo: Database["public"]["Enums"]["sujeto_screening"]
          tenant_id: string
        }
        Insert: {
          coincidencias?: Json
          created_at?: string
          id?: string
          listas_consultadas?: Json
          razonamiento?: string | null
          resolucion?: Database["public"]["Enums"]["resolucion_screening"]
          resuelto_en?: string | null
          resuelto_por?: string | null
          resultado: Database["public"]["Enums"]["resultado_screening"]
          sujeto_id: string
          sujeto_tipo: Database["public"]["Enums"]["sujeto_screening"]
          tenant_id: string
        }
        Update: {
          coincidencias?: Json
          created_at?: string
          id?: string
          listas_consultadas?: Json
          razonamiento?: string | null
          resolucion?: Database["public"]["Enums"]["resolucion_screening"]
          resuelto_en?: string | null
          resuelto_por?: string | null
          resultado?: Database["public"]["Enums"]["resultado_screening"]
          sujeto_id?: string
          sujeto_tipo?: Database["public"]["Enums"]["sujeto_screening"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultas_screening_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_resuelto_por_fk"
            columns: ["tenant_id", "resuelto_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      desarrollos_inmobiliarios: {
        Row: {
          activo: boolean
          calle: string
          codigo_postal: string
          colonia: string
          costo_unidad: number
          created_at: string
          descripcion_desarrollo: string | null
          entidad_federativa: string
          id: string
          monto_desarrollo: number
          nombre: string
          objeto_aviso_anterior: boolean
          otras_empresas: boolean
          registro_licencia: string
          tenant_id: string
          tipo_desarrollo: string
          unidades_comercializadas: number
        }
        Insert: {
          activo?: boolean
          calle: string
          codigo_postal: string
          colonia: string
          costo_unidad: number
          created_at?: string
          descripcion_desarrollo?: string | null
          entidad_federativa: string
          id?: string
          monto_desarrollo: number
          nombre: string
          objeto_aviso_anterior?: boolean
          otras_empresas?: boolean
          registro_licencia: string
          tenant_id: string
          tipo_desarrollo: string
          unidades_comercializadas: number
        }
        Update: {
          activo?: boolean
          calle?: string
          codigo_postal?: string
          colonia?: string
          costo_unidad?: number
          created_at?: string
          descripcion_desarrollo?: string | null
          entidad_federativa?: string
          id?: string
          monto_desarrollo?: number
          nombre?: string
          objeto_aviso_anterior?: boolean
          otras_empresas?: boolean
          registro_licencia?: string
          tenant_id?: string
          tipo_desarrollo?: string
          unidades_comercializadas?: number
        }
        Relationships: [
          {
            foreignKeyName: "desarrollos_inmobiliarios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          campo: string
          created_at: string
          expediente_id: string
          hash_sha256: string
          id: string
          mime: string
          persona_id: string | null
          reemplaza_a: string | null
          storage_path: string
          subido_por: string | null
          tamano_bytes: number
          tenant_id: string
        }
        Insert: {
          campo: string
          created_at?: string
          expediente_id: string
          hash_sha256: string
          id?: string
          mime: string
          persona_id?: string | null
          reemplaza_a?: string | null
          storage_path: string
          subido_por?: string | null
          tamano_bytes: number
          tenant_id: string
        }
        Update: {
          campo?: string
          created_at?: string
          expediente_id?: string
          hash_sha256?: string
          id?: string
          mime?: string
          persona_id?: string | null
          reemplaza_a?: string | null
          storage_path?: string
          subido_por?: string | null
          tamano_bytes?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_expediente_fk"
            columns: ["tenant_id", "expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "documentos_persona_fk"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_reemplaza_fk"
            columns: ["tenant_id", "reemplaza_a"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "documentos_subido_por_fk"
            columns: ["tenant_id", "subido_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "documentos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluaciones_umbral: {
        Row: {
          actividad_id: string
          alerta_proximidad: boolean
          catalogo_version: string
          efectivo_restringido: boolean
          evaluado_en: string
          id: string
          monto_base_considerado: number
          monto_total_considerado: number
          motivo: string | null
          operacion_id: string
          operaciones_acumuladas: string[]
          parametros_aplicados: Json
          requiere_identificacion: boolean
          requiere_revision_identidad: boolean
          resultado_aviso: Database["public"]["Enums"]["resultado_aviso"]
          suma_ventana: number | null
          tenant_id: string
          uma_valor: number
          uma_vigencia: unknown
          umbrales_aplicados: Json
        }
        Insert: {
          actividad_id: string
          alerta_proximidad: boolean
          catalogo_version: string
          efectivo_restringido: boolean
          evaluado_en?: string
          id?: string
          monto_base_considerado: number
          monto_total_considerado: number
          motivo?: string | null
          operacion_id: string
          operaciones_acumuladas?: string[]
          parametros_aplicados: Json
          requiere_identificacion: boolean
          requiere_revision_identidad?: boolean
          resultado_aviso: Database["public"]["Enums"]["resultado_aviso"]
          suma_ventana?: number | null
          tenant_id: string
          uma_valor: number
          uma_vigencia: unknown
          umbrales_aplicados: Json
        }
        Update: {
          actividad_id?: string
          alerta_proximidad?: boolean
          catalogo_version?: string
          efectivo_restringido?: boolean
          evaluado_en?: string
          id?: string
          monto_base_considerado?: number
          monto_total_considerado?: number
          motivo?: string | null
          operacion_id?: string
          operaciones_acumuladas?: string[]
          parametros_aplicados?: Json
          requiere_identificacion?: boolean
          requiere_revision_identidad?: boolean
          resultado_aviso?: Database["public"]["Enums"]["resultado_aviso"]
          suma_ventana?: number | null
          tenant_id?: string
          uma_valor?: number
          uma_vigencia?: unknown
          umbrales_aplicados?: Json
        }
        Relationships: [
          {
            foreignKeyName: "evaluaciones_operacion_fk"
            columns: ["tenant_id", "operacion_id"]
            isOneToOne: false
            referencedRelation: "operaciones"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "evaluaciones_operacion_fk"
            columns: ["tenant_id", "operacion_id"]
            isOneToOne: false
            referencedRelation: "operaciones_vigentes"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "evaluaciones_umbral_actividad_id_fkey"
            columns: ["actividad_id"]
            isOneToOne: false
            referencedRelation: "actividades_vulnerables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluaciones_umbral_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expedientes: {
        Row: {
          actividad_id: string
          aprobado_en: string | null
          aprobado_por: string | null
          cliente_id: string
          completitud: Json
          created_at: string
          estatus: Database["public"]["Enums"]["estatus_expediente"]
          id: string
          tenant_id: string
          version: number
        }
        Insert: {
          actividad_id: string
          aprobado_en?: string | null
          aprobado_por?: string | null
          cliente_id: string
          completitud?: Json
          created_at?: string
          estatus?: Database["public"]["Enums"]["estatus_expediente"]
          id?: string
          tenant_id: string
          version?: number
        }
        Update: {
          actividad_id?: string
          aprobado_en?: string | null
          aprobado_por?: string | null
          cliente_id?: string
          completitud?: Json
          created_at?: string
          estatus?: Database["public"]["Enums"]["estatus_expediente"]
          id?: string
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "expedientes_actividad_id_fkey"
            columns: ["actividad_id"]
            isOneToOne: false
            referencedRelation: "actividades_vulnerables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expedientes_aprobado_por_fk"
            columns: ["tenant_id", "aprobado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "expedientes_cliente_fk"
            columns: ["tenant_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_finales"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "expedientes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      factores_riesgo: {
        Row: {
          cliente_id: string
          created_at: string
          evaluado_en: string
          factor: string
          id: string
          peso: number | null
          tenant_id: string
          valor: Json
        }
        Insert: {
          cliente_id: string
          created_at?: string
          evaluado_en?: string
          factor: string
          id?: string
          peso?: number | null
          tenant_id: string
          valor?: Json
        }
        Update: {
          cliente_id?: string
          created_at?: string
          evaluado_en?: string
          factor?: string
          id?: string
          peso?: number | null
          tenant_id?: string
          valor?: Json
        }
        Relationships: [
          {
            foreignKeyName: "factores_riesgo_cliente_fk"
            columns: ["tenant_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_finales"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "factores_riesgo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      formatos_aviso: {
        Row: {
          actividad_id: string
          created_at: string
          id: string
          notas: string | null
          ruta_xsd: string
          version: string
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          actividad_id: string
          created_at?: string
          id?: string
          notas?: string | null
          ruta_xsd: string
          version: string
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          actividad_id?: string
          created_at?: string
          id?: string
          notas?: string | null
          ruta_xsd?: string
          version?: string
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "formatos_aviso_actividad_id_fkey"
            columns: ["actividad_id"]
            isOneToOne: false
            referencedRelation: "actividades_vulnerables"
            referencedColumns: ["id"]
          },
        ]
      }
      manifiestos: {
        Row: {
          catalogo_version: string
          contenido: Json
          expediente_id: string
          generado_en: string
          hash_bitacora_cabeza: string
          hash_sha256: string
          id: string
          tenant_id: string
          version: number
        }
        Insert: {
          catalogo_version: string
          contenido: Json
          expediente_id: string
          generado_en?: string
          hash_bitacora_cabeza: string
          hash_sha256: string
          id?: string
          tenant_id: string
          version: number
        }
        Update: {
          catalogo_version?: string
          contenido?: Json
          expediente_id?: string
          generado_en?: string
          hash_bitacora_cabeza?: string
          hash_sha256?: string
          id?: string
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "manifiestos_expediente_fk"
            columns: ["tenant_id", "expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "manifiestos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      operaciones: {
        Row: {
          actividad_id: string
          aportacion_fideicomiso: boolean
          cfdi_uuid: string | null
          cliente_id: string
          corrige_a: string | null
          desarrollo_id: string | null
          descripcion_bien: string | null
          fecha_operacion: string
          forma: Database["public"]["Enums"]["forma_aportacion"]
          forma_pago: string
          id: string
          instrumento_monetario: string | null
          isai: number
          iva: number
          modalidad: Database["public"]["Enums"]["modalidad_aportacion"] | null
          moneda: string
          moneda_codigo: string | null
          monto_base: number
          monto_estimado_especie: number | null
          monto_total: number
          nombre_institucion: string | null
          otros_accesorios: number
          registrado_en: string
          registrado_por: string | null
          sucursal_id: string
          tenant_id: string
          tipo_tercero: string | null
          valor_inmueble_preventa: number | null
        }
        Insert: {
          actividad_id: string
          aportacion_fideicomiso?: boolean
          cfdi_uuid?: string | null
          cliente_id: string
          corrige_a?: string | null
          desarrollo_id?: string | null
          descripcion_bien?: string | null
          fecha_operacion: string
          forma?: Database["public"]["Enums"]["forma_aportacion"]
          forma_pago: string
          id?: string
          instrumento_monetario?: string | null
          isai?: number
          iva?: number
          modalidad?: Database["public"]["Enums"]["modalidad_aportacion"] | null
          moneda?: string
          moneda_codigo?: string | null
          monto_base: number
          monto_estimado_especie?: number | null
          monto_total: number
          nombre_institucion?: string | null
          otros_accesorios?: number
          registrado_en?: string
          registrado_por?: string | null
          sucursal_id: string
          tenant_id: string
          tipo_tercero?: string | null
          valor_inmueble_preventa?: number | null
        }
        Update: {
          actividad_id?: string
          aportacion_fideicomiso?: boolean
          cfdi_uuid?: string | null
          cliente_id?: string
          corrige_a?: string | null
          desarrollo_id?: string | null
          descripcion_bien?: string | null
          fecha_operacion?: string
          forma?: Database["public"]["Enums"]["forma_aportacion"]
          forma_pago?: string
          id?: string
          instrumento_monetario?: string | null
          isai?: number
          iva?: number
          modalidad?: Database["public"]["Enums"]["modalidad_aportacion"] | null
          moneda?: string
          moneda_codigo?: string | null
          monto_base?: number
          monto_estimado_especie?: number | null
          monto_total?: number
          nombre_institucion?: string | null
          otros_accesorios?: number
          registrado_en?: string
          registrado_por?: string | null
          sucursal_id?: string
          tenant_id?: string
          tipo_tercero?: string | null
          valor_inmueble_preventa?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "operaciones_actividad_id_fkey"
            columns: ["actividad_id"]
            isOneToOne: false
            referencedRelation: "actividades_vulnerables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operaciones_cliente_fk"
            columns: ["tenant_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_finales"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "operaciones_corrige_fk"
            columns: ["tenant_id", "corrige_a"]
            isOneToOne: false
            referencedRelation: "operaciones"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "operaciones_corrige_fk"
            columns: ["tenant_id", "corrige_a"]
            isOneToOne: false
            referencedRelation: "operaciones_vigentes"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "operaciones_desarrollo_fk"
            columns: ["tenant_id", "desarrollo_id"]
            isOneToOne: false
            referencedRelation: "desarrollos_inmobiliarios"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "operaciones_registrado_por_fk"
            columns: ["tenant_id", "registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "operaciones_sucursal_fk"
            columns: ["tenant_id", "sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "operaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros_motor: {
        Row: {
          actividad_id: string | null
          clave: string
          created_at: string
          descripcion: string | null
          fuente: string | null
          id: string
          valor: Json
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          actividad_id?: string | null
          clave: string
          created_at?: string
          descripcion?: string | null
          fuente?: string | null
          id?: string
          valor: Json
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          actividad_id?: string | null
          clave?: string
          created_at?: string
          descripcion?: string | null
          fuente?: string | null
          id?: string
          valor?: Json
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parametros_motor_actividad_id_fkey"
            columns: ["actividad_id"]
            isOneToOne: false
            referencedRelation: "actividades_vulnerables"
            referencedColumns: ["id"]
          },
        ]
      }
      personas: {
        Row: {
          creada_por_tenant_id: string
          created_at: string
          curp: string | null
          id: string
          identidad_alterna: Json | null
          nombre_normalizado: string | null
          nombre_o_razon_social: string
          rfc: string | null
        }
        Insert: {
          creada_por_tenant_id: string
          created_at?: string
          curp?: string | null
          id?: string
          identidad_alterna?: Json | null
          nombre_normalizado?: string | null
          nombre_o_razon_social: string
          rfc?: string | null
        }
        Update: {
          creada_por_tenant_id?: string
          created_at?: string
          curp?: string | null
          id?: string
          identidad_alterna?: Json | null
          nombre_normalizado?: string | null
          nombre_o_razon_social?: string
          rfc?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personas_creada_por_tenant_id_fkey"
            columns: ["creada_por_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      representantes: {
        Row: {
          apellido_materno: string | null
          apellido_paterno: string | null
          cliente_id: string
          created_at: string
          curp: string | null
          fecha_nacimiento: string | null
          id: string
          nombre_pila: string
          rfc: string | null
          tenant_id: string
        }
        Insert: {
          apellido_materno?: string | null
          apellido_paterno?: string | null
          cliente_id: string
          created_at?: string
          curp?: string | null
          fecha_nacimiento?: string | null
          id?: string
          nombre_pila: string
          rfc?: string | null
          tenant_id: string
        }
        Update: {
          apellido_materno?: string | null
          apellido_paterno?: string | null
          cliente_id?: string
          created_at?: string
          curp?: string | null
          fecha_nacimiento?: string | null
          id?: string
          nombre_pila?: string
          rfc?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "representantes_cliente_fk"
            columns: ["tenant_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_finales"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "representantes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sellos_nom151: {
        Row: {
          constancia_storage_path: string | null
          created_at: string
          fecha_cierta: string
          hash_sellado: string
          id: string
          objeto_id: string
          objeto_tipo: Database["public"]["Enums"]["objeto_sellado"]
          psc: string
          tenant_id: string
        }
        Insert: {
          constancia_storage_path?: string | null
          created_at?: string
          fecha_cierta: string
          hash_sellado: string
          id?: string
          objeto_id: string
          objeto_tipo: Database["public"]["Enums"]["objeto_sellado"]
          psc: string
          tenant_id: string
        }
        Update: {
          constancia_storage_path?: string | null
          created_at?: string
          fecha_cierta?: string
          hash_sellado?: string
          id?: string
          objeto_id?: string
          objeto_tipo?: Database["public"]["Enums"]["objeto_sellado"]
          psc?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sellos_nom151_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sucursales: {
        Row: {
          activa: boolean
          clave: string
          created_at: string
          id: string
          nombre: string
          tenant_id: string
        }
        Insert: {
          activa?: boolean
          clave: string
          created_at?: string
          id?: string
          nombre: string
          tenant_id: string
        }
        Update: {
          activa?: boolean
          clave?: string
          created_at?: string
          id?: string
          nombre?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sucursales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          activo: boolean
          created_at: string
          domicilio: Json
          id: string
          razon_social: string
          rfc: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          domicilio?: Json
          id?: string
          razon_social: string
          rfc: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          domicilio?: Json
          id?: string
          razon_social?: string
          rfc?: string
        }
        Relationships: []
      }
      uma_vigencias: {
        Row: {
          created_at: string
          fuente_dof: string
          id: string
          valor_diario: number
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          created_at?: string
          fuente_dof: string
          id?: string
          valor_diario: number
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          created_at?: string
          fuente_dof?: string
          id?: string
          valor_diario?: number
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: []
      }
      umbrales: {
        Row: {
          actividad_id: string
          base: Database["public"]["Enums"]["base_calculo"]
          created_at: string
          fuente: string
          id: string
          siempre: boolean
          tipo: Database["public"]["Enums"]["tipo_umbral"]
          valor_uma: number | null
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          actividad_id: string
          base: Database["public"]["Enums"]["base_calculo"]
          created_at?: string
          fuente: string
          id?: string
          siempre?: boolean
          tipo: Database["public"]["Enums"]["tipo_umbral"]
          valor_uma?: number | null
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          actividad_id?: string
          base?: Database["public"]["Enums"]["base_calculo"]
          created_at?: string
          fuente?: string
          id?: string
          siempre?: boolean
          tipo?: Database["public"]["Enums"]["tipo_umbral"]
          valor_uma?: number | null
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "umbrales_actividad_id_fkey"
            columns: ["actividad_id"]
            isOneToOne: false
            referencedRelation: "actividades_vulnerables"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          activo: boolean
          created_at: string
          email: string
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          tenant_id: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email: string
          id: string
          nombre: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          tenant_id: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string
          id?: string
          nombre?: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      verificaciones_kyc: {
        Row: {
          created_at: string
          expediente_id: string
          id: string
          payload: Json
          proveedor: string
          resultado: string
          tenant_id: string
          verificado_en: string
        }
        Insert: {
          created_at?: string
          expediente_id: string
          id?: string
          payload?: Json
          proveedor: string
          resultado: string
          tenant_id: string
          verificado_en?: string
        }
        Update: {
          created_at?: string
          expediente_id?: string
          id?: string
          payload?: Json
          proveedor?: string
          resultado?: string
          tenant_id?: string
          verificado_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "verificaciones_kyc_expediente_fk"
            columns: ["tenant_id", "expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "verificaciones_kyc_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      operaciones_vigentes: {
        Row: {
          actividad_id: string | null
          cfdi_uuid: string | null
          cliente_id: string | null
          corrige_a: string | null
          descripcion_bien: string | null
          fecha_operacion: string | null
          forma_pago: string | null
          id: string | null
          isai: number | null
          iva: number | null
          moneda: string | null
          monto_base: number | null
          monto_total: number | null
          otros_accesorios: number | null
          registrado_en: string | null
          registrado_por: string | null
          sucursal_id: string | null
          tenant_id: string | null
        }
        Insert: {
          actividad_id?: string | null
          cfdi_uuid?: string | null
          cliente_id?: string | null
          corrige_a?: string | null
          descripcion_bien?: string | null
          fecha_operacion?: string | null
          forma_pago?: string | null
          id?: string | null
          isai?: number | null
          iva?: number | null
          moneda?: string | null
          monto_base?: number | null
          monto_total?: number | null
          otros_accesorios?: number | null
          registrado_en?: string | null
          registrado_por?: string | null
          sucursal_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          actividad_id?: string | null
          cfdi_uuid?: string | null
          cliente_id?: string | null
          corrige_a?: string | null
          descripcion_bien?: string | null
          fecha_operacion?: string | null
          forma_pago?: string | null
          id?: string | null
          isai?: number | null
          iva?: number | null
          moneda?: string | null
          monto_base?: number | null
          monto_total?: number | null
          otros_accesorios?: number | null
          registrado_en?: string | null
          registrado_por?: string | null
          sucursal_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operaciones_actividad_id_fkey"
            columns: ["actividad_id"]
            isOneToOne: false
            referencedRelation: "actividades_vulnerables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operaciones_cliente_fk"
            columns: ["tenant_id", "cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_finales"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "operaciones_corrige_fk"
            columns: ["tenant_id", "corrige_a"]
            isOneToOne: false
            referencedRelation: "operaciones"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "operaciones_corrige_fk"
            columns: ["tenant_id", "corrige_a"]
            isOneToOne: false
            referencedRelation: "operaciones_vigentes"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "operaciones_registrado_por_fk"
            columns: ["tenant_id", "registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "operaciones_sucursal_fk"
            columns: ["tenant_id", "sucursal_id"]
            isOneToOne: false
            referencedRelation: "sucursales"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "operaciones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      ambito_domicilio: "nacional" | "extranjero"
      aplica_persona: "persona_fisica" | "persona_moral" | "ambas"
      base_calculo: "sin_iva" | "con_iva"
      control_beneficiario: "participacion" | "control_efectivo"
      estado_alerta: "abierta" | "atendida"
      estado_caso: "abierto" | "en_revision" | "cerrado"
      estatus_aviso:
        | "borrador"
        | "generado"
        | "validado"
        | "listo_revision"
        | "aprobado"
        | "presentado"
      estatus_expediente: "incompleto" | "completo" | "aprobado"
      forma_aportacion: "numerario" | "especie"
      modalidad_aportacion:
        | "recursos_propios"
        | "socio"
        | "tercero"
        | "prestamo_financiero"
        | "prestamo_no_financiero"
        | "financiamiento_bursatil"
      nivel_riesgo: "bajo" | "medio" | "alto"
      objeto_sellado: "manifiesto" | "aviso"
      resolucion_screening: "pendiente" | "descartada" | "confirmada"
      resultado_aviso: "no" | "individual" | "acumulacion"
      resultado_screening: "sin_coincidencia" | "coincidencia"
      rol_usuario: "admin" | "capturista"
      sujeto_screening: "cliente" | "beneficiario"
      tipo_alerta:
        | "proximidad"
        | "aviso_requerido"
        | "revision_identidad"
        | "screening"
        | "calendario"
      tipo_aviso: "normal" | "acumulacion" | "cero" | "modificatorio" | "24h"
      tipo_dato_campo: "texto" | "fecha" | "monto" | "catalogo" | "documento"
      tipo_persona: "fisica" | "moral" | "fideicomiso"
      tipo_umbral: "identificacion" | "aviso" | "efectivo"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ambito_domicilio: ["nacional", "extranjero"],
      aplica_persona: ["persona_fisica", "persona_moral", "ambas"],
      base_calculo: ["sin_iva", "con_iva"],
      control_beneficiario: ["participacion", "control_efectivo"],
      estado_alerta: ["abierta", "atendida"],
      estado_caso: ["abierto", "en_revision", "cerrado"],
      estatus_aviso: [
        "borrador",
        "generado",
        "validado",
        "listo_revision",
        "aprobado",
        "presentado",
      ],
      estatus_expediente: ["incompleto", "completo", "aprobado"],
      forma_aportacion: ["numerario", "especie"],
      modalidad_aportacion: [
        "recursos_propios",
        "socio",
        "tercero",
        "prestamo_financiero",
        "prestamo_no_financiero",
        "financiamiento_bursatil",
      ],
      nivel_riesgo: ["bajo", "medio", "alto"],
      objeto_sellado: ["manifiesto", "aviso"],
      resolucion_screening: ["pendiente", "descartada", "confirmada"],
      resultado_aviso: ["no", "individual", "acumulacion"],
      resultado_screening: ["sin_coincidencia", "coincidencia"],
      rol_usuario: ["admin", "capturista"],
      sujeto_screening: ["cliente", "beneficiario"],
      tipo_alerta: [
        "proximidad",
        "aviso_requerido",
        "revision_identidad",
        "screening",
        "calendario",
      ],
      tipo_aviso: ["normal", "acumulacion", "cero", "modificatorio", "24h"],
      tipo_dato_campo: ["texto", "fecha", "monto", "catalogo", "documento"],
      tipo_persona: ["fisica", "moral", "fideicomiso"],
      tipo_umbral: ["identificacion", "aviso", "efectivo"],
    },
  },
} as const

