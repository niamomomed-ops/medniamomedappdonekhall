import type { CommandeStatus } from "@/lib/commandes.functions";

export const STATUS_LABELS: Record<CommandeStatus, string> = {
  commande_creee: "Commande créée",
  verre_commande: "Verre commandé",
  reception_partielle: "Réception partielle",
  verre_recu: "Verre reçu",
  en_montage: "En montage",
  casse_montage: "Cassé au montage",
  finalise: "Finalisé",
  en_reception: "En réception",
  reclamation: "Réclamation",
  livree: "Livrée",
};

export const STATUS_COLORS: Record<CommandeStatus, string> = {
  commande_creee: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  verre_commande: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  reception_partielle: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  verre_recu: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30",
  en_montage: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  casse_montage: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  reclamation: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  finalise: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  en_reception: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
  livree: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
};

export const TYPE_LABELS: Record<string, string> = {
  vision_loin: "Vision de loin",
  vision_pres: "Vision de près",
  double_foyer: "Double foyer",
  progressif: "Progressif",
  lentilles: "Lentilles",
};

export const MONTURE_EVENT_LABELS: Record<string, string> = {
  monture_client_attendue: "📞 Monture client attendue — appel requis",
  monture_client_appel: "Client appelé pour apporter sa monture",
  monture_client_appel_app: "Appel lancé depuis l'application (monture client)",
  monture_client_recue: "Statut monture mis à jour : Non fournie → Fournie",
  monture_casse_od: "Casse déclarée sur OD",
  monture_casse_og: "Casse déclarée sur OG",
  monture_casse_both: "Casse déclarée sur OD + OG",
  reception_partielle_od: "Réception partielle — OD reçu, OG en attente",
  reception_partielle_og: "Réception partielle — OG reçu, OD en attente",
  reception_complete_od: "OD reçu — réception complète",
  reception_complete_og: "OG reçu — réception complète",
  reception_client_attendu: "📞 Commande prête — appel client requis pour récupération",
  reception_client_appel: "Client appelé pour récupération de la commande",
  reception_client_appel_app: "Appel lancé depuis l'application (récupération)",
  dette_recuperation: "Dette créée à la récupération (reste impayé)",
  controle_qualite_ok: "✅ Contrôle qualité OK — verres conformes",
  reclamation_declaree: "⚠️ Réclamation déclarée au contrôle qualité",
  reclamation_envoyee: "📨 Réclamation envoyée au fournisseur (WhatsApp)",
  reclamation_resolue: "✅ Réclamation résolue — Verre totalement reçu",
  casse_envoyee: "📨 Casse envoyée au fournisseur (WhatsApp)",
  casse_resolue: "✅ Casse résolue — Verre de remplacement reçu",
  paiement_montant_modifie: "💶 Montant total modifié",
  paiement_avance_modifie: "💶 Avance modifiée",
  infos_modifiees: "✏️ Infos commande modifiées",
};




export const CASSE_EYE_LABELS: Record<string, string> = {
  od: "OD",
  og: "OG",
  both: "OD + OG",
};

export const EYES_ORDERED_LABELS: Record<string, string> = {
  both: "OD + OG",
  od: "OD uniquement",
  og: "OG uniquement",
};

export const EYES_ORDERED_SHORT: Record<string, string> = {
  both: "OD+OG",
  od: "OD",
  og: "OG",
};



