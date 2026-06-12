
DO $$ BEGIN
  ALTER TABLE public.commandes ADD CONSTRAINT commandes_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES public.prescriptions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.commandes ADD CONSTRAINT commandes_fournisseur_id_fkey FOREIGN KEY (fournisseur_id) REFERENCES public.fournisseurs(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.commandes ADD CONSTRAINT commandes_caisse_id_fkey FOREIGN KEY (caisse_id) REFERENCES public.caisses(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.commandes ADD CONSTRAINT commandes_based_on_id_fkey FOREIGN KEY (based_on_id) REFERENCES public.commandes(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.progressive_measurements ADD CONSTRAINT progressive_measurements_commande_id_fkey FOREIGN KEY (commande_id) REFERENCES public.commandes(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.order_history ADD CONSTRAINT order_history_commande_id_fkey FOREIGN KEY (commande_id) REFERENCES public.commandes(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.transactions ADD CONSTRAINT transactions_caisse_id_fkey FOREIGN KEY (caisse_id) REFERENCES public.caisses(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.versements ADD CONSTRAINT versements_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.versements ADD CONSTRAINT versements_commande_id_fkey FOREIGN KEY (commande_id) REFERENCES public.commandes(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.versements ADD CONSTRAINT versements_caisse_id_fkey FOREIGN KEY (caisse_id) REFERENCES public.caisses(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
