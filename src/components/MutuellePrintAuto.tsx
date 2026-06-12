import { useAuth } from "@/lib/auth";
import { useEntreprise } from "@/hooks/useEntreprise";
import { MutuellePrintDialog } from "@/components/MutuellePrintDialog";
import { MutuelleAdminPrintDialog } from "@/components/MutuelleAdminPrintDialog";

type Cmd = {
  numero_commande: string | null;
  type: string;
  monture_source?: string | null;
  montant: number;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  numeroDemande: string;
  clientOrigineNom: string | null;
  clientOrigineDateNaissance: string | null;
  beneficiaireNom: string | null;
  beneficiaireDateNaissance: string | null;
  beneficiaireOrganisme: string | null;
  organisme: string | null;
  source: "interne" | "externe" | "mixte";
  statut: "en_attente" | "remplie" | "livree";
  createdAt: string;
  dette: number;
  commandes: Cmd[];
  total: number;
};

function calcAge(d: string | null): number | null {
  if (!d) return null;
  const b = new Date(d);
  const t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
  return a;
}

export function MutuellePrintAuto(props: Props) {
  const { role } = useAuth();
  const { entreprise } = useEntreprise();
  const hasBeneficiaire = !!props.beneficiaireNom;
  const nom = props.beneficiaireNom ?? props.clientOrigineNom;
  const age = calcAge(props.beneficiaireDateNaissance ?? props.clientOrigineDateNaissance);
  const org = props.beneficiaireOrganisme ?? props.organisme;

  if (role === "admin") {
    return (
      <MutuelleAdminPrintDialog
        open={props.open}
        onOpenChange={props.onOpenChange}
        entreprise={entreprise}
        numeroDemande={props.numeroDemande}
        beneficiaireNom={nom}
        beneficiaireAge={age}
        beneficiaireOrganisme={org}
        hasBeneficiaire={hasBeneficiaire}
        clientOrigineNom={props.clientOrigineNom}
        source={props.source}
        statut={props.statut}
        createdAt={props.createdAt}
        commandes={props.commandes}
        total={props.total}
      />
    );
  }

  return (
    <MutuellePrintDialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      magasinNom={entreprise?.nom ?? null}
      numeroDemande={props.numeroDemande}
      clientNom={nom}
      clientAge={age}
      organisme={org}
      source={props.source}
      dette={props.dette}
      commandes={props.commandes}
      total={props.total}
      hasBeneficiaire={hasBeneficiaire}
      clientOrigineNom={props.clientOrigineNom}
    />
  );
}
