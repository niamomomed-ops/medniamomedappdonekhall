-- À exécuter UNE FOIS dans le SQL Editor Supabase.
-- Installe public.dump_full_schema() utilisé par
-- Paramètres → "Exporter migration complète".
-- Retourne le DDL complet (extensions, types, tables, FKs,
-- index, fonctions, triggers, RLS, policies, buckets Storage)
-- du schéma public, exécutable sur un projet Supabase vierge.

CREATE OR REPLACE FUNCTION public.dump_full_schema()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  out_sql text := '';
  r record;
  col_defs text;
BEGIN
  -- En-tête
  out_sql := out_sql
    || E'-- =====================================================\n'
    || E'-- OptiGestion — Migration + Seed complète\n'
    || E'-- Généré le ' || now()::text || E'\n'
    || E'-- Exécutable sur un projet Supabase vierge.\n'
    || E'-- =====================================================\n\n'
    || E'CREATE EXTENSION IF NOT EXISTS pgcrypto;\n'
    || E'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";\n\n'
    || E'BEGIN;\n\n';

  -- ENUMs
  out_sql := out_sql || E'-- ---------- ENUMs ----------\n';
  FOR r IN
    SELECT n.nspname, t.typname,
      string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder) AS labels
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY n.nspname, t.typname
    ORDER BY t.typname
  LOOP
    out_sql := out_sql || format(
      E'DO $do$ BEGIN CREATE TYPE %I.%I AS ENUM (%s); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;\n',
      r.nspname, r.typname, r.labels
    );
  END LOOP;
  out_sql := out_sql || E'\n';

  -- TABLES (colonnes uniquement)
  out_sql := out_sql || E'-- ---------- TABLES ----------\n';
  FOR r IN
    SELECT c.oid, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  LOOP
    SELECT string_agg(
      '  ' || quote_ident(a.attname) || ' ' ||
      pg_catalog.format_type(a.atttypid, a.atttypmod) ||
      COALESCE(' DEFAULT ' || pg_get_expr(ad.adbin, ad.adrelid), '') ||
      CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
      E',\n' ORDER BY a.attnum
    )
    INTO col_defs
    FROM pg_attribute a
    LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    WHERE a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped;

    out_sql := out_sql || format(E'CREATE TABLE IF NOT EXISTS public.%I (\n%s\n);\n\n', r.relname, col_defs);
  END LOOP;

  -- SÉQUENCES (création + setval)
  out_sql := out_sql || E'-- ---------- SEQUENCES ----------\n';
  FOR r IN
    SELECT c.relname AS seqname,
           pg_catalog.format_type(s.seqtypid, NULL) AS typ,
           s.seqstart, s.seqincrement, s.seqmin, s.seqmax
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_sequence s ON s.seqrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'S'
    ORDER BY c.relname
  LOOP
    out_sql := out_sql || format(
      E'CREATE SEQUENCE IF NOT EXISTS public.%I AS %s START %s INCREMENT %s MINVALUE %s MAXVALUE %s;\n',
      r.seqname, r.typ, r.seqstart, r.seqincrement, r.seqmin, r.seqmax
    );
  END LOOP;
  out_sql := out_sql || E'\n';

  -- CONTRAINTES (PK / UNIQUE / CHECK / FK)
  out_sql := out_sql || E'-- ---------- CONSTRAINTS ----------\n';
  FOR r IN
    SELECT con.conname,
           cl.relname AS tbl,
           pg_get_constraintdef(con.oid) AS def,
           con.contype
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public'
    ORDER BY CASE con.contype WHEN 'p' THEN 1 WHEN 'u' THEN 2 WHEN 'c' THEN 3 WHEN 'f' THEN 4 ELSE 5 END,
             cl.relname, con.conname
  LOOP
    out_sql := out_sql || format(
      E'ALTER TABLE public.%I ADD CONSTRAINT %I %s;\n',
      r.tbl, r.conname, r.def
    );
  END LOOP;
  out_sql := out_sql || E'\n';

  -- INDEX (hors contraintes)
  out_sql := out_sql || E'-- ---------- INDEXES ----------\n';
  FOR r IN
    SELECT indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname NOT IN (
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class cl ON cl.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        WHERE n.nspname = 'public'
      )
    ORDER BY indexname
  LOOP
    out_sql := out_sql || r.indexdef || E';\n';
  END LOOP;
  out_sql := out_sql || E'\n';

  -- FONCTIONS
  out_sql := out_sql || E'-- ---------- FUNCTIONS ----------\n';
  FOR r IN
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f','p')
    ORDER BY p.proname
  LOOP
    out_sql := out_sql || r.def || E';\n\n';
  END LOOP;

  -- TRIGGERS
  out_sql := out_sql || E'-- ---------- TRIGGERS ----------\n';
  FOR r IN
    SELECT pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
    ORDER BY c.relname, t.tgname
  LOOP
    out_sql := out_sql || r.def || E';\n';
  END LOOP;
  out_sql := out_sql || E'\n';

  -- RLS (enable)
  out_sql := out_sql || E'-- ---------- ROW LEVEL SECURITY ----------\n';
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    ORDER BY c.relname
  LOOP
    out_sql := out_sql || format(E'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;\n', r.relname);
  END LOOP;
  out_sql := out_sql || E'\n';

  -- POLICIES
  out_sql := out_sql || E'-- ---------- POLICIES ----------\n';
  FOR r IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  LOOP
    out_sql := out_sql || format(
      E'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;\n',
      r.policyname, r.schemaname, r.tablename,
      r.permissive, r.cmd,
      array_to_string(r.roles, ', '),
      CASE WHEN r.qual IS NOT NULL THEN ' USING (' || r.qual || ')' ELSE '' END,
      CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || r.with_check || ')' ELSE '' END
    );
  END LOOP;
  out_sql := out_sql || E'\n';

  -- GRANTS (table privileges pour anon / authenticated / service_role)
  out_sql := out_sql || E'-- ---------- GRANTS ----------\n';
  FOR r IN
    SELECT grantee, table_name,
           string_agg(DISTINCT privilege_type, ', ') AS privs
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('anon','authenticated','service_role')
    GROUP BY grantee, table_name
    ORDER BY table_name, grantee
  LOOP
    out_sql := out_sql || format(
      E'GRANT %s ON public.%I TO %I;\n',
      r.privs, r.table_name, r.grantee
    );
  END LOOP;
  out_sql := out_sql || E'\n';

  -- STORAGE BUCKETS
  out_sql := out_sql || E'-- ---------- STORAGE BUCKETS ----------\n';
  BEGIN
    FOR r IN
      SELECT id, name, public, file_size_limit, allowed_mime_types
      FROM storage.buckets
      ORDER BY id
    LOOP
      out_sql := out_sql || format(
        E'INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES (%L, %L, %L, %s, %L) ON CONFLICT (id) DO NOTHING;\n',
        r.id, r.name, r.public,
        COALESCE(r.file_size_limit::text, 'NULL'),
        r.allowed_mime_types
      );
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    out_sql := out_sql || E'-- storage.buckets non accessible : ' || SQLERRM || E'\n';
  END;
  out_sql := out_sql || E'\n';

  out_sql := out_sql || E'-- ---------- END SCHEMA ----------\n';
  out_sql := out_sql || E'COMMIT;\n\n';

  RETURN out_sql;
END;
$fn$;

REVOKE ALL ON FUNCTION public.dump_full_schema() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dump_full_schema() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dump_full_schema() TO service_role;