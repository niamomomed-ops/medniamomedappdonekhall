export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      backup_runs: {
        Row: {
          destinations: string[]
          ended_at: string | null
          error: string | null
          formats: string[]
          id: string
          started_at: string
          status: string
          total_rows: number | null
          trigger: string
        }
        Insert: {
          destinations?: string[]
          ended_at?: string | null
          error?: string | null
          formats?: string[]
          id?: string
          started_at?: string
          status?: string
          total_rows?: number | null
          trigger: string
        }
        Update: {
          destinations?: string[]
          ended_at?: string | null
          error?: string | null
          formats?: string[]
          id?: string
          started_at?: string
          status?: string
          total_rows?: number | null
          trigger?: string
        }
        Relationships: []
      }
      backup_settings: {
        Row: {
          daily_enabled: boolean
          daily_time: string
          drive_enabled: boolean
          drive_folder_id: string | null
          email_enabled: boolean
          email_recipients: string[]
          formats: string[]
          id: string
          monthly_day: number
          monthly_enabled: boolean
          on_caisse_close: boolean
          updated_at: string
          updated_by: string | null
          weekly_dow: number
          weekly_enabled: boolean
        }
        Insert: {
          daily_enabled?: boolean
          daily_time?: string
          drive_enabled?: boolean
          drive_folder_id?: string | null
          email_enabled?: boolean
          email_recipients?: string[]
          formats?: string[]
          id?: string
          monthly_day?: number
          monthly_enabled?: boolean
          on_caisse_close?: boolean
          updated_at?: string
          updated_by?: string | null
          weekly_dow?: number
          weekly_enabled?: boolean
        }
        Update: {
          daily_enabled?: boolean
          daily_time?: string
          drive_enabled?: boolean
          drive_folder_id?: string | null
          email_enabled?: boolean
          email_recipients?: string[]
          formats?: string[]
          id?: string
          monthly_day?: number
          monthly_enabled?: boolean
          on_caisse_close?: boolean
          updated_at?: string
          updated_by?: string | null
          weekly_dow?: number
          weekly_enabled?: boolean
        }
        Relationships: []
      }
      caisses: {
        Row: {
          auto_close_at: string | null
          auto_closed: boolean | null
          closed_at: string | null
          closed_by: string | null
          closing_balance: number | null
          created_at: string
          id: string
          label: string | null
          opened_at: string
          opened_by: string | null
          opening_balance: number | null
          status: string
        }
        Insert: {
          auto_close_at?: string | null
          auto_closed?: boolean | null
          closed_at?: string | null
          closed_by?: string | null
          closing_balance?: number | null
          created_at?: string
          id?: string
          label?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_balance?: number | null
          status?: string
        }
        Update: {
          auto_close_at?: string | null
          auto_closed?: boolean | null
          closed_at?: string | null
          closed_by?: string | null
          closing_balance?: number | null
          created_at?: string
          id?: string
          label?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_balance?: number | null
          status?: string
        }
        Relationships: []
      }
      client_felicitations: {
        Row: {
          client_id: string
          created_at: string | null
          felicite_by: string | null
          felicite_date: string
          id: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          felicite_by?: string | null
          felicite_date: string
          id?: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          felicite_by?: string | null
          felicite_date?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_felicitations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_versements: {
        Row: {
          amount: number
          caisse_id: string | null
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
        }
        Insert: {
          amount: number
          caisse_id?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
        }
        Update: {
          amount?: number
          caisse_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_versements_caisse_id_fkey"
            columns: ["caisse_id"]
            isOneToOne: false
            referencedRelation: "caisses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_versements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          adresse: string
          cin: string | null
          civilite: string | null
          created_at: string
          created_by: string | null
          date_naissance: string
          email: string
          id: string
          mutuelle: string | null
          mutuelle_autre: string | null
          nom: string | null
          nom_complet: string
          prenom: string | null
          telephone: string
          whatsapp: string | null
        }
        Insert: {
          adresse: string
          cin?: string | null
          civilite?: string | null
          created_at?: string
          created_by?: string | null
          date_naissance: string
          email: string
          id?: string
          mutuelle?: string | null
          mutuelle_autre?: string | null
          nom?: string | null
          nom_complet: string
          prenom?: string | null
          telephone: string
          whatsapp?: string | null
        }
        Update: {
          adresse?: string
          cin?: string | null
          civilite?: string | null
          created_at?: string
          created_by?: string | null
          date_naissance?: string
          email?: string
          id?: string
          mutuelle?: string | null
          mutuelle_autre?: string | null
          nom?: string | null
          nom_complet?: string
          prenom?: string | null
          telephone?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      commandes: {
        Row: {
          avance: number
          based_on_id: string | null
          caisse_id: string | null
          casse_at: string | null
          casse_by: string | null
          casse_eye: string | null
          casse_note: string | null
          casse_resolved_at: string | null
          casse_resolved_by: string | null
          casse_sent_at: string | null
          casse_sent_by: string | null
          client_id: string
          created_at: string
          created_by: string | null
          date_livraison: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_caisse_id: string | null
          deletion_reason: string | null
          eyes_ordered: string | null
          fournisseur_id: string | null
          id: string
          lentille_type: string | null
          lentilles: string | null
          montant: number
          monture_client_called_at: string | null
          monture_client_called_by: string | null
          monture_client_provided: boolean | null
          monture_client_received_at: string | null
          monture_client_received_by: string | null
          monture_marque: string | null
          monture_source: string | null
          notes: string | null
          numero_commande: string | null
          od_addition: number | null
          od_axe: number | null
          od_cylinder: number | null
          od_received_at: string | null
          od_sphere: number | null
          og_addition: number | null
          og_axe: number | null
          og_cylinder: number | null
          og_received_at: string | null
          og_sphere: number | null
          ordered_eye: string | null
          prescription_id: string | null
          quantite: number | null
          reception_client_called_at: string | null
          reception_client_called_by: string | null
          reclamation_detail: Json | null
          reclamation_lentille: string | null
          reclamation_resolved_at: string | null
          reclamation_resolved_by: string | null
          reclamation_sent_at: string | null
          reclamation_sent_by: string | null
          resolved_at: string | null
          reste: number | null
          status: string
          status_before_delete: string | null
          type: string
          type_verres: string | null
          urgent: boolean | null
        }
        Insert: {
          avance?: number
          based_on_id?: string | null
          caisse_id?: string | null
          casse_at?: string | null
          casse_by?: string | null
          casse_eye?: string | null
          casse_note?: string | null
          casse_resolved_at?: string | null
          casse_resolved_by?: string | null
          casse_sent_at?: string | null
          casse_sent_by?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          date_livraison?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_caisse_id?: string | null
          deletion_reason?: string | null
          eyes_ordered?: string | null
          fournisseur_id?: string | null
          id?: string
          lentille_type?: string | null
          lentilles?: string | null
          montant?: number
          monture_client_called_at?: string | null
          monture_client_called_by?: string | null
          monture_client_provided?: boolean | null
          monture_client_received_at?: string | null
          monture_client_received_by?: string | null
          monture_marque?: string | null
          monture_source?: string | null
          notes?: string | null
          numero_commande?: string | null
          od_addition?: number | null
          od_axe?: number | null
          od_cylinder?: number | null
          od_received_at?: string | null
          od_sphere?: number | null
          og_addition?: number | null
          og_axe?: number | null
          og_cylinder?: number | null
          og_received_at?: string | null
          og_sphere?: number | null
          ordered_eye?: string | null
          prescription_id?: string | null
          quantite?: number | null
          reception_client_called_at?: string | null
          reception_client_called_by?: string | null
          reclamation_detail?: Json | null
          reclamation_lentille?: string | null
          reclamation_resolved_at?: string | null
          reclamation_resolved_by?: string | null
          reclamation_sent_at?: string | null
          reclamation_sent_by?: string | null
          resolved_at?: string | null
          reste?: number | null
          status?: string
          status_before_delete?: string | null
          type: string
          type_verres?: string | null
          urgent?: boolean | null
        }
        Update: {
          avance?: number
          based_on_id?: string | null
          caisse_id?: string | null
          casse_at?: string | null
          casse_by?: string | null
          casse_eye?: string | null
          casse_note?: string | null
          casse_resolved_at?: string | null
          casse_resolved_by?: string | null
          casse_sent_at?: string | null
          casse_sent_by?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          date_livraison?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_caisse_id?: string | null
          deletion_reason?: string | null
          eyes_ordered?: string | null
          fournisseur_id?: string | null
          id?: string
          lentille_type?: string | null
          lentilles?: string | null
          montant?: number
          monture_client_called_at?: string | null
          monture_client_called_by?: string | null
          monture_client_provided?: boolean | null
          monture_client_received_at?: string | null
          monture_client_received_by?: string | null
          monture_marque?: string | null
          monture_source?: string | null
          notes?: string | null
          numero_commande?: string | null
          od_addition?: number | null
          od_axe?: number | null
          od_cylinder?: number | null
          od_received_at?: string | null
          od_sphere?: number | null
          og_addition?: number | null
          og_axe?: number | null
          og_cylinder?: number | null
          og_received_at?: string | null
          og_sphere?: number | null
          ordered_eye?: string | null
          prescription_id?: string | null
          quantite?: number | null
          reception_client_called_at?: string | null
          reception_client_called_by?: string | null
          reclamation_detail?: Json | null
          reclamation_lentille?: string | null
          reclamation_resolved_at?: string | null
          reclamation_resolved_by?: string | null
          reclamation_sent_at?: string | null
          reclamation_sent_by?: string | null
          resolved_at?: string | null
          reste?: number | null
          status?: string
          status_before_delete?: string | null
          type?: string
          type_verres?: string | null
          urgent?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "commandes_based_on_id_fkey"
            columns: ["based_on_id"]
            isOneToOne: false
            referencedRelation: "commandes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_caisse_id_fkey"
            columns: ["caisse_id"]
            isOneToOne: false
            referencedRelation: "caisses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_deletion_caisse_id_fkey"
            columns: ["deletion_caisse_id"]
            isOneToOne: false
            referencedRelation: "caisses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      correction_annexes: {
        Row: {
          created_at: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          prescription_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          prescription_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          prescription_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "correction_annexes_prescription_id_fkey"
            columns: ["prescription_id"]
            isOneToOne: false
            referencedRelation: "prescriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      demande_mutuelle_commandes: {
        Row: {
          commande_id: string
          demande_id: string
          source_correction: string
        }
        Insert: {
          commande_id: string
          demande_id: string
          source_correction: string
        }
        Update: {
          commande_id?: string
          demande_id?: string
          source_correction?: string
        }
        Relationships: [
          {
            foreignKeyName: "demande_mutuelle_commandes_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: false
            referencedRelation: "commandes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demande_mutuelle_commandes_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: false
            referencedRelation: "demandes_mutuelles"
            referencedColumns: ["id"]
          },
        ]
      }
      demande_mutuelle_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          demande_id: string
          event_type: string
          id: string
          new_statut: string | null
          old_statut: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          demande_id: string
          event_type: string
          id?: string
          new_statut?: string | null
          old_statut?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          demande_id?: string
          event_type?: string
          id?: string
          new_statut?: string | null
          old_statut?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demande_mutuelle_history_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: false
            referencedRelation: "demandes_mutuelles"
            referencedColumns: ["id"]
          },
        ]
      }
      demandes_mutuelles: {
        Row: {
          beneficiaire_date_naissance: string | null
          beneficiaire_nom: string | null
          beneficiaire_organisme: string | null
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          livree: boolean | null
          livree_at: string | null
          numero_demande: string
          organisme: string | null
          prix_monture: number | null
          prix_verre: number | null
          remplie_at: string | null
          remplie_by: string | null
          source_correction: string
          statut: string
          total_remboursement: number | null
        }
        Insert: {
          beneficiaire_date_naissance?: string | null
          beneficiaire_nom?: string | null
          beneficiaire_organisme?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          livree?: boolean | null
          livree_at?: string | null
          numero_demande?: string
          organisme?: string | null
          prix_monture?: number | null
          prix_verre?: number | null
          remplie_at?: string | null
          remplie_by?: string | null
          source_correction: string
          statut?: string
          total_remboursement?: number | null
        }
        Update: {
          beneficiaire_date_naissance?: string | null
          beneficiaire_nom?: string | null
          beneficiaire_organisme?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          livree?: boolean | null
          livree_at?: string | null
          numero_demande?: string
          organisme?: string | null
          prix_monture?: number | null
          prix_verre?: number | null
          remplie_at?: string | null
          remplie_by?: string | null
          source_correction?: string
          statut?: string
          total_remboursement?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "demandes_mutuelles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      demandes_mutuelles_history: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string | null
          demande_id: string
          id: string
          note: string | null
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string | null
          demande_id: string
          id?: string
          note?: string | null
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string | null
          demande_id?: string
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demandes_mutuelles_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "personnel"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demandes_mutuelles_history_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: false
            referencedRelation: "demandes_mutuelles"
            referencedColumns: ["id"]
          },
        ]
      }
      dettes: {
        Row: {
          client_id: string
          commande_id: string | null
          created_at: string
          created_by: string | null
          id: string
          montant: number
        }
        Insert: {
          client_id: string
          commande_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          montant: number
        }
        Update: {
          client_id?: string
          commande_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          montant?: number
        }
        Relationships: [
          {
            foreignKeyName: "dettes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dettes_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: false
            referencedRelation: "commandes"
            referencedColumns: ["id"]
          },
        ]
      }
      entreprise: {
        Row: {
          adresse: string | null
          code_postal: string | null
          couleur_principale: string | null
          email: string | null
          horaires: Json | null
          id: string
          logo_url: string | null
          nom: string | null
          site_web: string | null
          slogan: string | null
          telephone: string | null
          updated_at: string | null
          updated_by: string | null
          ville: string | null
          whatsapp: string | null
        }
        Insert: {
          adresse?: string | null
          code_postal?: string | null
          couleur_principale?: string | null
          email?: string | null
          horaires?: Json | null
          id?: string
          logo_url?: string | null
          nom?: string | null
          site_web?: string | null
          slogan?: string | null
          telephone?: string | null
          updated_at?: string | null
          updated_by?: string | null
          ville?: string | null
          whatsapp?: string | null
        }
        Update: {
          adresse?: string | null
          code_postal?: string | null
          couleur_principale?: string | null
          email?: string | null
          horaires?: Json | null
          id?: string
          logo_url?: string | null
          nom?: string | null
          site_web?: string | null
          slogan?: string | null
          telephone?: string | null
          updated_at?: string | null
          updated_by?: string | null
          ville?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      fournisseurs: {
        Row: {
          adresse: string
          created_at: string
          created_by: string | null
          email: string
          id: string
          nom: string
          telephone: string
          whatsapp: string | null
        }
        Insert: {
          adresse: string
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          nom: string
          telephone: string
          whatsapp?: string | null
        }
        Update: {
          adresse?: string
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          nom?: string
          telephone?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      mutuelle_justificatifs: {
        Row: {
          demande_id: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          demande_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          demande_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mutuelle_justificatifs_demande_id_fkey"
            columns: ["demande_id"]
            isOneToOne: false
            referencedRelation: "demandes_mutuelles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          id: string
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          commande_id: string | null
          created_at: string
          created_by: string | null
          id: string
          message: string
          mutuelle_demande_id: string | null
          target_user_id: string | null
          type: string
        }
        Insert: {
          commande_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          message: string
          mutuelle_demande_id?: string | null
          target_user_id?: string | null
          type: string
        }
        Update: {
          commande_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          mutuelle_demande_id?: string | null
          target_user_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: false
            referencedRelation: "commandes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_mutuelle_demande_id_fkey"
            columns: ["mutuelle_demande_id"]
            isOneToOne: false
            referencedRelation: "demandes_mutuelles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          commande_id: string
          id: string
          new_status: string
          old_status: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          commande_id: string
          id?: string
          new_status: string
          old_status?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          commande_id?: string
          id?: string
          new_status?: string
          old_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_history_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: false
            referencedRelation: "commandes"
            referencedColumns: ["id"]
          },
        ]
      }
      personnel: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name: string
          role: Database["public"]["Enums"]["app_role"]
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
        }
        Relationships: []
      }
      prescriptions: {
        Row: {
          client_id: string
          correction_par: string | null
          created_at: string
          created_by: string | null
          date_prescription: string
          id: string
          note: string | null
          od_addition: number | null
          od_axe: number | null
          od_cylinder: number | null
          od_sphere: number | null
          og_addition: number | null
          og_axe: number | null
          og_cylinder: number | null
          og_sphere: number | null
          type: string
        }
        Insert: {
          client_id: string
          correction_par?: string | null
          created_at?: string
          created_by?: string | null
          date_prescription: string
          id?: string
          note?: string | null
          od_addition?: number | null
          od_axe?: number | null
          od_cylinder?: number | null
          od_sphere?: number | null
          og_addition?: number | null
          og_axe?: number | null
          og_cylinder?: number | null
          og_sphere?: number | null
          type: string
        }
        Update: {
          client_id?: string
          correction_par?: string | null
          created_at?: string
          created_by?: string | null
          date_prescription?: string
          id?: string
          note?: string | null
          od_addition?: number | null
          od_axe?: number | null
          od_cylinder?: number | null
          od_sphere?: number | null
          og_addition?: number | null
          og_axe?: number | null
          og_cylinder?: number | null
          og_sphere?: number | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      progressive_measurements: {
        Row: {
          commande_id: string
          created_at: string
          ecart_pupillaire_od: number | null
          ecart_pupillaire_og: number | null
          grand_diametre: number | null
          hauteur_calibre: number | null
          hauteur_pupillaire_od: number | null
          hauteur_pupillaire_og: number | null
          id: string
          pont: number | null
        }
        Insert: {
          commande_id: string
          created_at?: string
          ecart_pupillaire_od?: number | null
          ecart_pupillaire_og?: number | null
          grand_diametre?: number | null
          hauteur_calibre?: number | null
          hauteur_pupillaire_od?: number | null
          hauteur_pupillaire_og?: number | null
          id?: string
          pont?: number | null
        }
        Update: {
          commande_id?: string
          created_at?: string
          ecart_pupillaire_od?: number | null
          ecart_pupillaire_og?: number | null
          grand_diametre?: number | null
          hauteur_calibre?: number | null
          hauteur_pupillaire_od?: number | null
          hauteur_pupillaire_og?: number | null
          id?: string
          pont?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "progressive_measurements_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: false
            referencedRelation: "commandes"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          caisse_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_manual: boolean | null
          type: string
        }
        Insert: {
          amount: number
          caisse_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_manual?: boolean | null
          type: string
        }
        Update: {
          amount?: number
          caisse_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_manual?: boolean | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_caisse_id_fkey"
            columns: ["caisse_id"]
            isOneToOne: false
            referencedRelation: "caisses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      versements: {
        Row: {
          amount: number
          caisse_id: string | null
          client_id: string | null
          commande_id: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
        }
        Insert: {
          amount: number
          caisse_id?: string | null
          client_id?: string | null
          commande_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
        }
        Update: {
          amount?: number
          caisse_id?: string | null
          client_id?: string | null
          commande_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "versements_caisse_id_fkey"
            columns: ["caisse_id"]
            isOneToOne: false
            referencedRelation: "caisses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "versements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "versements_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: false
            referencedRelation: "commandes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      dump_full_schema: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_public_tables: { Args: never; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "agent_vente" | "agent_montage"
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
  public: {
    Enums: {
      app_role: ["admin", "agent_vente", "agent_montage"],
    },
  },
} as const
