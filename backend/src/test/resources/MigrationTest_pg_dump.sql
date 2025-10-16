--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5 (Debian 17.5-1.pgdg120+1)
-- Dumped by pg_dump version 17.5 (Debian 17.5-1.pgdg120+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.user_groups_table DROP CONSTRAINT IF EXISTS user_groups_table_group_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sequence_entries_preprocessed_data DROP CONSTRAINT IF EXISTS sequence_entries_preprocessed_data_accession_version_fkey;
ALTER TABLE IF EXISTS ONLY public.sequence_entries DROP CONSTRAINT IF EXISTS sequence_entries_group_id_fkey;
ALTER TABLE IF EXISTS ONLY public.seqset_to_records DROP CONSTRAINT IF EXISTS foreign_key_seqset_record_id;
ALTER TABLE IF EXISTS ONLY public.seqset_to_records DROP CONSTRAINT IF EXISTS foreign_key_seqset_id;
ALTER TABLE IF EXISTS ONLY public.files DROP CONSTRAINT IF EXISTS files_group_id_fkey;
DROP TRIGGER IF EXISTS update_tracker_trigger ON public.user_groups_table;
DROP TRIGGER IF EXISTS update_tracker_trigger ON public.sequence_upload_aux_table;
DROP TRIGGER IF EXISTS update_tracker_trigger ON public.sequence_entries_preprocessed_data;
DROP TRIGGER IF EXISTS update_tracker_trigger ON public.sequence_entries;
DROP TRIGGER IF EXISTS update_tracker_trigger ON public.metadata_upload_aux_table;
DROP TRIGGER IF EXISTS update_tracker_trigger ON public.groups_table;
DROP TRIGGER IF EXISTS update_tracker_trigger ON public.external_metadata;
DROP TRIGGER IF EXISTS update_tracker_trigger ON public.data_use_terms_table;
DROP TRIGGER IF EXISTS update_tracker_trigger ON public.current_processing_pipeline;
DROP INDEX IF EXISTS public.user_groups_table_user_name_idx;
DROP INDEX IF EXISTS public.sequence_entries_submitter_idx;
DROP INDEX IF EXISTS public.sequence_entries_organism_idx;
DROP INDEX IF EXISTS public.flyway_schema_history_s_idx;
DROP INDEX IF EXISTS public.data_use_terms_table_accession_idx;
ALTER TABLE IF EXISTS ONLY public.user_groups_table DROP CONSTRAINT IF EXISTS user_groups_table_user_name_group_id_key;
ALTER TABLE IF EXISTS ONLY public.user_groups_table DROP CONSTRAINT IF EXISTS user_groups_table_pkey;
ALTER TABLE IF EXISTS ONLY public.table_update_tracker DROP CONSTRAINT IF EXISTS table_update_tracker_pkey;
ALTER TABLE IF EXISTS ONLY public.sequence_upload_aux_table DROP CONSTRAINT IF EXISTS sequence_upload_aux_table_pkey;
ALTER TABLE IF EXISTS ONLY public.sequence_entries_preprocessed_data DROP CONSTRAINT IF EXISTS sequence_entries_preprocessed_data_pkey;
ALTER TABLE IF EXISTS ONLY public.sequence_entries DROP CONSTRAINT IF EXISTS sequence_entries_pkey;
ALTER TABLE IF EXISTS ONLY public.seqsets DROP CONSTRAINT IF EXISTS seqsets_pkey;
ALTER TABLE IF EXISTS ONLY public.seqset_to_records DROP CONSTRAINT IF EXISTS seqset_to_records_pkey;
ALTER TABLE IF EXISTS ONLY public.seqset_records DROP CONSTRAINT IF EXISTS seqset_records_pkey;
ALTER TABLE IF EXISTS ONLY public.metadata_upload_aux_table DROP CONSTRAINT IF EXISTS metadata_upload_aux_table_pkey;
ALTER TABLE IF EXISTS ONLY public.groups_table DROP CONSTRAINT IF EXISTS groups_table_pkey;
ALTER TABLE IF EXISTS ONLY public.flyway_schema_history DROP CONSTRAINT IF EXISTS flyway_schema_history_pk;
ALTER TABLE IF EXISTS ONLY public.files DROP CONSTRAINT IF EXISTS files_pkey;
ALTER TABLE IF EXISTS ONLY public.external_metadata DROP CONSTRAINT IF EXISTS external_metadata_pkey;
ALTER TABLE IF EXISTS ONLY public.current_processing_pipeline DROP CONSTRAINT IF EXISTS current_processing_pipeline_pkey;
ALTER TABLE IF EXISTS ONLY public.audit_log DROP CONSTRAINT IF EXISTS audit_log_pkey;
ALTER TABLE IF EXISTS public.user_groups_table ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.seqset_to_records ALTER COLUMN seqset_record_id DROP DEFAULT;
ALTER TABLE IF EXISTS public.seqset_records ALTER COLUMN seqset_record_id DROP DEFAULT;
ALTER TABLE IF EXISTS public.groups_table ALTER COLUMN group_id DROP DEFAULT;
ALTER TABLE IF EXISTS public.audit_log ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.user_groups_table_id_seq;
DROP TABLE IF EXISTS public.user_groups_table;
DROP TABLE IF EXISTS public.table_update_tracker;
DROP TABLE IF EXISTS public.sequence_upload_aux_table;
DROP VIEW IF EXISTS public.sequence_entries_view;
DROP TABLE IF EXISTS public.seqsets;
DROP SEQUENCE IF EXISTS public.seqset_to_records_seqset_record_id_seq;
DROP TABLE IF EXISTS public.seqset_to_records;
DROP SEQUENCE IF EXISTS public.seqset_records_seqset_record_id_seq;
DROP TABLE IF EXISTS public.seqset_records;
DROP SEQUENCE IF EXISTS public.seqset_id_sequence;
DROP TABLE IF EXISTS public.metadata_upload_aux_table;
DROP SEQUENCE IF EXISTS public.groups_table_group_id_seq;
DROP TABLE IF EXISTS public.groups_table;
DROP TABLE IF EXISTS public.flyway_schema_history;
DROP TABLE IF EXISTS public.files;
DROP VIEW IF EXISTS public.external_metadata_view;
DROP TABLE IF EXISTS public.sequence_entries_preprocessed_data;
DROP TABLE IF EXISTS public.sequence_entries;
DROP TABLE IF EXISTS public.data_use_terms_table;
DROP TABLE IF EXISTS public.current_processing_pipeline;
DROP SEQUENCE IF EXISTS public.audit_log_id_seq;
DROP TABLE IF EXISTS public.audit_log;
DROP VIEW IF EXISTS public.all_external_metadata;
DROP TABLE IF EXISTS public.external_metadata;
DROP SEQUENCE IF EXISTS public.accession_sequence;
DROP AGGREGATE IF EXISTS public.jsonb_merge_agg(jsonb);
DROP FUNCTION IF EXISTS public.update_table_tracker();
DROP FUNCTION IF EXISTS public.jsonb_concat(a jsonb, b jsonb);
DROP FUNCTION IF EXISTS public.create_update_trigger_for_table(table_name text);
--
-- Name: create_update_trigger_for_table(text); Type: FUNCTION; Schema: public; Owner: test
--

CREATE FUNCTION public.create_update_trigger_for_table(table_name text) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF table_name != 'table_update_tracker' THEN
        EXECUTE format('
            CREATE OR REPLACE TRIGGER update_tracker_trigger
            AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON %I
            FOR EACH STATEMENT
            EXECUTE FUNCTION update_table_tracker()', table_name);
END IF;
END;
$$;


ALTER FUNCTION public.create_update_trigger_for_table(table_name text) OWNER TO test;

--
-- Name: jsonb_concat(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: test
--

CREATE FUNCTION public.jsonb_concat(a jsonb, b jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $_$select $1 || $2$_$;


ALTER FUNCTION public.jsonb_concat(a jsonb, b jsonb) OWNER TO test;

--
-- Name: update_table_tracker(); Type: FUNCTION; Schema: public; Owner: test
--

CREATE FUNCTION public.update_table_tracker() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_TABLE_NAME != 'table_update_tracker' THEN
        INSERT INTO table_update_tracker (table_name, last_time_updated)
        VALUES (TG_TABLE_NAME, timezone('UTC', CURRENT_TIMESTAMP))
        ON CONFLICT (table_name)
        DO UPDATE SET last_time_updated = timezone('UTC', CURRENT_TIMESTAMP);
END IF;
RETURN NULL;
END;
$$;


ALTER FUNCTION public.update_table_tracker() OWNER TO test;

--
-- Name: jsonb_merge_agg(jsonb); Type: AGGREGATE; Schema: public; Owner: test
--

CREATE AGGREGATE public.jsonb_merge_agg(jsonb) (
    SFUNC = jsonb_concat,
    STYPE = jsonb,
    INITCOND = '{}'
);


ALTER AGGREGATE public.jsonb_merge_agg(jsonb) OWNER TO test;

--
-- Name: accession_sequence; Type: SEQUENCE; Schema: public; Owner: test
--

CREATE SEQUENCE public.accession_sequence
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.accession_sequence OWNER TO test;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: external_metadata; Type: TABLE; Schema: public; Owner: test
--

CREATE TABLE public.external_metadata (
                                          accession text NOT NULL,
                                          version bigint NOT NULL,
                                          external_metadata_updater text NOT NULL,
                                          external_metadata jsonb,
                                          updated_metadata_at timestamp without time zone NOT NULL
);


ALTER TABLE public.external_metadata OWNER TO test;

--
-- Name: all_external_metadata; Type: VIEW; Schema: public; Owner: test
--

CREATE VIEW public.all_external_metadata AS
SELECT accession,
       version,
       max(updated_metadata_at) AS updated_metadata_at,
       public.jsonb_merge_agg(external_metadata) AS external_metadata
FROM public.external_metadata
GROUP BY accession, version;


ALTER VIEW public.all_external_metadata OWNER TO test;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: test
--

CREATE TABLE public.audit_log (
                                  id bigint NOT NULL,
                                  username text,
                                  "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
                                  description text NOT NULL
);


ALTER TABLE public.audit_log OWNER TO test;

--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: test
--

CREATE SEQUENCE public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_log_id_seq OWNER TO test;

--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: test
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: current_processing_pipeline; Type: TABLE; Schema: public; Owner: test
--

CREATE TABLE public.current_processing_pipeline (
                                                    version bigint NOT NULL,
                                                    started_using_at timestamp without time zone NOT NULL,
                                                    organism text NOT NULL
);


ALTER TABLE public.current_processing_pipeline OWNER TO test;

--
-- Name: data_use_terms_table; Type: TABLE; Schema: public; Owner: test
--

CREATE TABLE public.data_use_terms_table (
                                             accession text NOT NULL,
                                             change_date timestamp without time zone NOT NULL,
                                             data_use_terms_type text NOT NULL,
                                             restricted_until timestamp without time zone,
                                             user_name text NOT NULL
);


ALTER TABLE public.data_use_terms_table OWNER TO test;

--
-- Name: sequence_entries; Type: TABLE; Schema: public; Owner: test
--

CREATE TABLE public.sequence_entries (
                                         accession text NOT NULL,
                                         version bigint NOT NULL,
                                         organism text NOT NULL,
                                         submission_id text NOT NULL,
                                         submitter text NOT NULL,
                                         approver text,
                                         group_id integer NOT NULL,
                                         submitted_at timestamp without time zone NOT NULL,
                                         released_at timestamp without time zone,
                                         is_revocation boolean DEFAULT false NOT NULL,
                                         original_data jsonb,
                                         version_comment text
);


ALTER TABLE public.sequence_entries OWNER TO test;

--
-- Name: sequence_entries_preprocessed_data; Type: TABLE; Schema: public; Owner: test
--

CREATE TABLE public.sequence_entries_preprocessed_data (
                                                           accession text NOT NULL,
                                                           version bigint NOT NULL,
                                                           pipeline_version bigint NOT NULL,
                                                           processed_data jsonb,
                                                           errors jsonb,
                                                           warnings jsonb,
                                                           processing_status text NOT NULL,
                                                           started_processing_at timestamp without time zone NOT NULL,
                                                           finished_processing_at timestamp without time zone
);


ALTER TABLE public.sequence_entries_preprocessed_data OWNER TO test;

--
-- Name: external_metadata_view; Type: VIEW; Schema: public; Owner: test
--

CREATE VIEW public.external_metadata_view AS
SELECT cpd.accession,
       cpd.version,
       all_external_metadata.updated_metadata_at,
       CASE
           WHEN (all_external_metadata.external_metadata IS NULL) THEN jsonb_build_object('metadata', (cpd.processed_data -> 'metadata'::text))
           ELSE jsonb_build_object('metadata', ((cpd.processed_data -> 'metadata'::text) || all_external_metadata.external_metadata))
           END AS joint_metadata
FROM (( SELECT sequence_entries_preprocessed_data.accession,
               sequence_entries_preprocessed_data.version,
               sequence_entries_preprocessed_data.pipeline_version,
               sequence_entries_preprocessed_data.processed_data,
               sequence_entries_preprocessed_data.errors,
               sequence_entries_preprocessed_data.warnings,
               sequence_entries_preprocessed_data.processing_status,
               sequence_entries_preprocessed_data.started_processing_at,
               sequence_entries_preprocessed_data.finished_processing_at
        FROM public.sequence_entries_preprocessed_data
        WHERE (sequence_entries_preprocessed_data.pipeline_version = ( SELECT current_processing_pipeline.version
                                                                       FROM public.current_processing_pipeline
                                                                       WHERE (current_processing_pipeline.organism = ( SELECT se.organism
                                                                                                                       FROM public.sequence_entries se
                                                                                                                       WHERE ((se.accession = sequence_entries_preprocessed_data.accession) AND (se.version = sequence_entries_preprocessed_data.version))))))) cpd
    LEFT JOIN public.all_external_metadata ON (((all_external_metadata.accession = cpd.accession) AND (all_external_metadata.version = cpd.version))));


ALTER VIEW public.external_metadata_view OWNER TO test;

--
-- Name: files; Type: TABLE; Schema: public; Owner: test
--

CREATE TABLE public.files (
                              id uuid NOT NULL,
                              upload_requested_at timestamp without time zone NOT NULL,
                              uploader text NOT NULL,
                              group_id integer NOT NULL,
                              size bigint,
                              multipart_completed boolean DEFAULT false NOT NULL,
                              multipart_upload_id text
);


ALTER TABLE public.files OWNER TO test;

--
-- Name: flyway_schema_history; Type: TABLE; Schema: public; Owner: test
--

CREATE TABLE public.flyway_schema_history (
                                              installed_rank integer NOT NULL,
                                              version character varying(50),
                                              description character varying(200) NOT NULL,
                                              type character varying(20) NOT NULL,
                                              script character varying(1000) NOT NULL,
                                              checksum integer,
                                              installed_by character varying(100) NOT NULL,
                                              installed_on timestamp without time zone DEFAULT now() NOT NULL,
                                              execution_time integer NOT NULL,
                                              success boolean NOT NULL
);


ALTER TABLE public.flyway_schema_history OWNER TO test;

--
-- Name: groups_table; Type: TABLE; Schema: public; Owner: test
--

CREATE TABLE public.groups_table (
                                     group_id integer NOT NULL,
                                     group_name character varying(255),
                                     institution character varying(255) NOT NULL,
                                     address_line_1 character varying(255) NOT NULL,
                                     address_line_2 character varying(255),
                                     address_postal_code character varying(255) NOT NULL,
                                     address_city character varying(255) NOT NULL,
                                     address_state character varying(255),
                                     address_country character varying(255) NOT NULL,
                                     contact_email character varying(255) NOT NULL
);


ALTER TABLE public.groups_table OWNER TO test;

--
-- Name: groups_table_group_id_seq; Type: SEQUENCE; Schema: public; Owner: test
--

CREATE SEQUENCE public.groups_table_group_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.groups_table_group_id_seq OWNER TO test;

--
-- Name: groups_table_group_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: test
--

ALTER SEQUENCE public.groups_table_group_id_seq OWNED BY public.groups_table.group_id;


--
-- Name: metadata_upload_aux_table; Type: TABLE; Schema: public; Owner: test
--

CREATE TABLE public.metadata_upload_aux_table (
                                                  accession text,
                                                  version bigint,
                                                  upload_id text NOT NULL,
                                                  organism text NOT NULL,
                                                  submission_id text NOT NULL,
                                                  submitter text NOT NULL,
                                                  group_id integer,
                                                  uploaded_at timestamp without time zone NOT NULL,
                                                  metadata jsonb NOT NULL,
                                                  files jsonb
);


ALTER TABLE public.metadata_upload_aux_table OWNER TO test;

--
-- Name: seqset_id_sequence; Type: SEQUENCE; Schema: public; Owner: test
--

CREATE SEQUENCE public.seqset_id_sequence
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.seqset_id_sequence OWNER TO test;

--
-- Name: seqset_records; Type: TABLE; Schema: public; Owner: test
--

CREATE TABLE public.seqset_records (
                                       seqset_record_id bigint NOT NULL,
                                       accession text NOT NULL,
                                       type text NOT NULL,
                                       is_focal boolean NOT NULL
);


ALTER TABLE public.seqset_records OWNER TO test;

--
-- Name: seqset_records_seqset_record_id_seq; Type: SEQUENCE; Schema: public; Owner: test
--

CREATE SEQUENCE public.seqset_records_seqset_record_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.seqset_records_seqset_record_id_seq OWNER TO test;

--
-- Name: seqset_records_seqset_record_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: test
--

ALTER SEQUENCE public.seqset_records_seqset_record_id_seq OWNED BY public.seqset_records.seqset_record_id;


--
-- Name: seqset_to_records; Type: TABLE; Schema: public; Owner: test
--

CREATE TABLE public.seqset_to_records (
                                          seqset_record_id bigint NOT NULL,
                                          seqset_id text NOT NULL,
                                          seqset_version bigint NOT NULL
);


ALTER TABLE public.seqset_to_records OWNER TO test;

--
-- Name: seqset_to_records_seqset_record_id_seq; Type: SEQUENCE; Schema: public; Owner: test
--

CREATE SEQUENCE public.seqset_to_records_seqset_record_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.seqset_to_records_seqset_record_id_seq OWNER TO test;

--
-- Name: seqset_to_records_seqset_record_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: test
--

ALTER SEQUENCE public.seqset_to_records_seqset_record_id_seq OWNED BY public.seqset_to_records.seqset_record_id;


--
-- Name: seqsets; Type: TABLE; Schema: public; Owner: test
--

CREATE TABLE public.seqsets (
                                seqset_id text NOT NULL,
                                seqset_version bigint NOT NULL,
                                name text NOT NULL,
                                description text,
                                seqset_doi text,
                                created_at timestamp without time zone NOT NULL,
                                created_by text NOT NULL
);


ALTER TABLE public.seqsets OWNER TO test;

--
-- Name: sequence_entries_view; Type: VIEW; Schema: public; Owner: test
--

CREATE VIEW public.sequence_entries_view AS
SELECT se.accession,
       se.version,
       se.organism,
       se.submission_id,
       se.submitter,
       se.approver,
       se.group_id,
       se.submitted_at,
       se.released_at,
       se.is_revocation,
       se.original_data,
       se.version_comment,
       sepd.started_processing_at,
       sepd.finished_processing_at,
       sepd.processed_data,
       (sepd.processed_data || em.joint_metadata) AS joint_metadata,
       CASE
           WHEN se.is_revocation THEN ( SELECT current_processing_pipeline.version
                                        FROM public.current_processing_pipeline
                                        WHERE (current_processing_pipeline.organism = se.organism))
           ELSE sepd.pipeline_version
           END AS pipeline_version,
       sepd.errors,
       sepd.warnings,
       CASE
           WHEN (se.released_at IS NOT NULL) THEN 'APPROVED_FOR_RELEASE'::text
           WHEN se.is_revocation THEN 'PROCESSED'::text
           WHEN (sepd.processing_status = 'IN_PROCESSING'::text) THEN 'IN_PROCESSING'::text
           WHEN (sepd.processing_status = 'PROCESSED'::text) THEN 'PROCESSED'::text
           ELSE 'RECEIVED'::text
           END AS status,
       CASE
           WHEN (sepd.processing_status = 'IN_PROCESSING'::text) THEN NULL::text
           WHEN ((sepd.errors IS NOT NULL) AND (jsonb_array_length(sepd.errors) > 0)) THEN 'HAS_ERRORS'::text
           WHEN ((sepd.warnings IS NOT NULL) AND (jsonb_array_length(sepd.warnings) > 0)) THEN 'HAS_WARNINGS'::text
           ELSE 'NO_ISSUES'::text
           END AS processing_result
FROM (((public.sequence_entries se
    LEFT JOIN public.sequence_entries_preprocessed_data sepd ON (((se.accession = sepd.accession) AND (se.version = sepd.version) AND (sepd.pipeline_version = ( SELECT current_processing_pipeline.version
                                                                                                                                                                 FROM public.current_processing_pipeline
                                                                                                                                                                 WHERE (current_processing_pipeline.organism = ( SELECT se_1.organism
                                                                                                                                                                                                                 FROM public.sequence_entries se_1
                                                                                                                                                                                                                 WHERE ((se_1.accession = sepd.accession) AND (se_1.version = sepd.version)))))))))
    LEFT JOIN public.current_processing_pipeline ccp ON (((se.organism = ccp.organism) AND (sepd.pipeline_version = ccp.version))))
    LEFT JOIN public.external_metadata_view em ON (((se.accession = em.accession) AND (se.version = em.version))));


ALTER VIEW public.sequence_entries_view OWNER TO test;

--
-- Name: sequence_upload_aux_table; Type: TABLE; Schema: public; Owner: test
--

CREATE TABLE public.sequence_upload_aux_table (
                                                  upload_id text NOT NULL,
                                                  submission_id text NOT NULL,
                                                  segment_name text NOT NULL,
                                                  compressed_sequence_data text NOT NULL
);


ALTER TABLE public.sequence_upload_aux_table OWNER TO test;

--
-- Name: table_update_tracker; Type: TABLE; Schema: public; Owner: test
--

CREATE TABLE public.table_update_tracker (
                                             table_name text NOT NULL,
                                             last_time_updated timestamp without time zone DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP)
);


ALTER TABLE public.table_update_tracker OWNER TO test;

--
-- Name: user_groups_table; Type: TABLE; Schema: public; Owner: test
--

CREATE TABLE public.user_groups_table (
                                          id integer NOT NULL,
                                          user_name text NOT NULL,
                                          group_id integer NOT NULL
);


ALTER TABLE public.user_groups_table OWNER TO test;

--
-- Name: user_groups_table_id_seq; Type: SEQUENCE; Schema: public; Owner: test
--

CREATE SEQUENCE public.user_groups_table_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_groups_table_id_seq OWNER TO test;

--
-- Name: user_groups_table_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: test
--

ALTER SEQUENCE public.user_groups_table_id_seq OWNED BY public.user_groups_table.id;


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: groups_table group_id; Type: DEFAULT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.groups_table ALTER COLUMN group_id SET DEFAULT nextval('public.groups_table_group_id_seq'::regclass);


--
-- Name: seqset_records seqset_record_id; Type: DEFAULT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.seqset_records ALTER COLUMN seqset_record_id SET DEFAULT nextval('public.seqset_records_seqset_record_id_seq'::regclass);


--
-- Name: seqset_to_records seqset_record_id; Type: DEFAULT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.seqset_to_records ALTER COLUMN seqset_record_id SET DEFAULT nextval('public.seqset_to_records_seqset_record_id_seq'::regclass);


--
-- Name: user_groups_table id; Type: DEFAULT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.user_groups_table ALTER COLUMN id SET DEFAULT nextval('public.user_groups_table_id_seq'::regclass);


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: test
--

INSERT INTO public.audit_log VALUES (1, 'testuser', '2025-10-16 10:49:46.23007', 'Created group: testGroup');
INSERT INTO public.audit_log VALUES (2, 'testuser', '2025-10-16 10:49:46.619256', 'Set data use terms to Open for accessions LOC_000001Y, LOC_000002W, LOC_000003U, LOC_000004S, LOC_000005Q, LOC_000006N, LOC_000007L, LOC_000008J, LOC_000009G, LOC_00000AE');
INSERT INTO public.audit_log VALUES (3, 'testuser', '2025-10-16 10:49:46.619256', 'Submitted or revised 10 sequences: LOC_000001Y.1, LOC_000002W.1, LOC_000003U.1, LOC_000004S.1, LOC_000005Q.1, LOC_000006N.1, LOC_000007L.1, LOC_000008J.1, LOC_000009G.1, LOC_00000AE.1');
INSERT INTO public.audit_log VALUES (4, '<pipeline version 1>', '2025-10-16 10:49:46.830345', 'Processed 10 sequences: LOC_000001Y.1, LOC_000002W.1, LOC_000003U.1, LOC_000004S.1, LOC_000005Q.1, LOC_000006N.1, LOC_000007L.1, LOC_000008J.1, LOC_000009G.1, LOC_00000AE.1Processing result counts: NO_ISSUES=10');
INSERT INTO public.audit_log VALUES (5, 'testuser', '2025-10-16 10:49:46.973107', 'Approved 10 sequences: LOC_000001Y.1, LOC_000002W.1, LOC_000003U.1, LOC_000004S.1, LOC_000005Q.1, LOC_000006N.1, LOC_000007L.1, LOC_000008J.1, LOC_000009G.1, LOC_00000AE.1');


--
-- Data for Name: current_processing_pipeline; Type: TABLE DATA; Schema: public; Owner: test
--

INSERT INTO public.current_processing_pipeline VALUES (1, '2025-10-16 08:49:46.092646', 'dummyOrganism');
INSERT INTO public.current_processing_pipeline VALUES (1, '2025-10-16 08:49:46.092646', 'otherOrganism');
INSERT INTO public.current_processing_pipeline VALUES (1, '2025-10-16 08:49:46.092646', 'dummyOrganismWithoutConsensusSequences');


--
-- Data for Name: data_use_terms_table; Type: TABLE DATA; Schema: public; Owner: test
--

INSERT INTO public.data_use_terms_table VALUES ('LOC_000001Y', '2025-10-16 08:49:46.623558', 'OPEN', NULL, 'testuser');
INSERT INTO public.data_use_terms_table VALUES ('LOC_000002W', '2025-10-16 08:49:46.623558', 'OPEN', NULL, 'testuser');
INSERT INTO public.data_use_terms_table VALUES ('LOC_000003U', '2025-10-16 08:49:46.623558', 'OPEN', NULL, 'testuser');
INSERT INTO public.data_use_terms_table VALUES ('LOC_000004S', '2025-10-16 08:49:46.623558', 'OPEN', NULL, 'testuser');
INSERT INTO public.data_use_terms_table VALUES ('LOC_000005Q', '2025-10-16 08:49:46.623558', 'OPEN', NULL, 'testuser');
INSERT INTO public.data_use_terms_table VALUES ('LOC_000006N', '2025-10-16 08:49:46.623558', 'OPEN', NULL, 'testuser');
INSERT INTO public.data_use_terms_table VALUES ('LOC_000007L', '2025-10-16 08:49:46.623558', 'OPEN', NULL, 'testuser');
INSERT INTO public.data_use_terms_table VALUES ('LOC_000008J', '2025-10-16 08:49:46.623558', 'OPEN', NULL, 'testuser');
INSERT INTO public.data_use_terms_table VALUES ('LOC_000009G', '2025-10-16 08:49:46.623558', 'OPEN', NULL, 'testuser');
INSERT INTO public.data_use_terms_table VALUES ('LOC_00000AE', '2025-10-16 08:49:46.623558', 'OPEN', NULL, 'testuser');


--
-- Data for Name: external_metadata; Type: TABLE DATA; Schema: public; Owner: test
--



--
-- Data for Name: files; Type: TABLE DATA; Schema: public; Owner: test
--



--
-- Data for Name: flyway_schema_history; Type: TABLE DATA; Schema: public; Owner: test
--

INSERT INTO public.flyway_schema_history VALUES (1, '1', 'init', 'SQL', 'V1__init.sql', -1933240468, 'test', '2025-10-16 10:49:45.381718', 23, true);
INSERT INTO public.flyway_schema_history VALUES (2, '1.1', 'add field', 'SQL', 'V1.1__add_field.sql', -1842274762, 'test', '2025-10-16 10:49:45.420729', 2, true);
INSERT INTO public.flyway_schema_history VALUES (3, '1.2', 'add table update tracker', 'SQL', 'V1.2__add_table_update_tracker.sql', -432111426, 'test', '2025-10-16 10:49:45.428709', 6, true);
INSERT INTO public.flyway_schema_history VALUES (4, '1.3', 'update view', 'SQL', 'V1.3__update_view.sql', -781436158, 'test', '2025-10-16 10:49:45.439851', 4, true);
INSERT INTO public.flyway_schema_history VALUES (5, '1.4', 'fix external metadata view', 'SQL', 'V1.4__fix_external_metadata_view.sql', 983402763, 'test', '2025-10-16 10:49:45.44817', 5, true);
INSERT INTO public.flyway_schema_history VALUES (6, '1.5', 'update sequence entries view status field', 'SQL', 'V1.5__update_sequence_entries_view_status_field.sql', -2034624596, 'test', '2025-10-16 10:49:45.457312', 3, true);
INSERT INTO public.flyway_schema_history VALUES (7, '1.6', 'add sequence entries preprocessed data foreign key', 'SQL', 'V1.6__add_sequence_entries_preprocessed_data_foreign_key.sql', -2008860443, 'test', '2025-10-16 10:49:45.464946', 2, true);
INSERT INTO public.flyway_schema_history VALUES (8, '1.7', 'add table update trigger for data use terms', 'SQL', 'V1.7__add_table_update_trigger_for_data_use_terms.sql', -1635467655, 'test', '2025-10-16 10:49:45.47015', 1, true);
INSERT INTO public.flyway_schema_history VALUES (9, '1.8', 'update error schema', 'SQL', 'V1.8__update_error_schema.sql', 880750213, 'test', '2025-10-16 10:49:45.474018', 1, true);
INSERT INTO public.flyway_schema_history VALUES (10, '1.9', 'update sequence entries view add pipeline version', 'SQL', 'V1.9__update_sequence_entries_view_add_pipeline_version.sql', 1297216938, 'test', '2025-10-16 10:49:45.479029', 2, true);
INSERT INTO public.flyway_schema_history VALUES (11, '1.10', 'pipeline version per organism', 'SQL', 'V1.10__pipeline_version_per_organism.sql', 2082542246, 'test', '2025-10-16 10:49:45.48543', 6, true);
INSERT INTO public.flyway_schema_history VALUES (12, '1.11', 'file sharing', 'SQL', 'V1.11__file_sharing.sql', 487638247, 'test', '2025-10-16 10:49:45.49617', 1, true);
INSERT INTO public.flyway_schema_history VALUES (13, '1.12', 'organism index', 'SQL', 'V1.12__organism_index.sql', -1872234229, 'test', '2025-10-16 10:49:45.500694', 1, true);
INSERT INTO public.flyway_schema_history VALUES (14, '1.13', 'file sharing add size', 'SQL', 'V1.13__file_sharing_add_size.sql', -1767391865, 'test', '2025-10-16 10:49:45.504837', 1, true);
INSERT INTO public.flyway_schema_history VALUES (15, '1.14', 'file sharing multipart', 'SQL', 'V1.14__file_sharing_multipart.sql', -1568716365, 'test', '2025-10-16 10:49:45.508846', 1, true);
INSERT INTO public.flyway_schema_history VALUES (16, '1.15', 'delete files released at', 'SQL', 'V1.15__delete_files_released_at.sql', -2109572182, 'test', '2025-10-16 10:49:45.512746', 1, true);


--
-- Data for Name: groups_table; Type: TABLE DATA; Schema: public; Owner: test
--

INSERT INTO public.groups_table VALUES (1, 'testGroup', 'testInstitution', 'testAddressLine1', 'testAddressLine2', 'testPostalCode', 'testCity', 'testState', 'testCountry', 'testEmail');


--
-- Data for Name: metadata_upload_aux_table; Type: TABLE DATA; Schema: public; Owner: test
--



--
-- Data for Name: seqset_records; Type: TABLE DATA; Schema: public; Owner: test
--



--
-- Data for Name: seqset_to_records; Type: TABLE DATA; Schema: public; Owner: test
--



--
-- Data for Name: seqsets; Type: TABLE DATA; Schema: public; Owner: test
--



--
-- Data for Name: sequence_entries; Type: TABLE DATA; Schema: public; Owner: test
--

INSERT INTO public.sequence_entries VALUES ('LOC_000001Y', 1, 'dummyOrganism', 'custom0', 'testuser', 'testuser', 1, '2025-10-16 08:49:46.559077', '2025-10-16 08:49:46.991675', false, '{"files": null, "metadata": {"date": "2020-12-26", "host": "Homo sapiens", "region": "Europe", "country": "Switzerland", "division": "Bern"}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAEIQAAQUNURw=="}}}', NULL);
INSERT INTO public.sequence_entries VALUES ('LOC_000002W', 1, 'dummyOrganism', 'custom1', 'testuser', 'testuser', 1, '2025-10-16 08:49:46.559077', '2025-10-16 08:49:46.991675', false, '{"files": null, "metadata": {"date": "2020-12-15", "host": "Homo sapiens", "region": "Europe", "country": "Switzerland", "division": "Schaffhausen"}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAEIQAAQUNURw=="}}}', NULL);
INSERT INTO public.sequence_entries VALUES ('LOC_000003U', 1, 'dummyOrganism', 'custom2', 'testuser', 'testuser', 1, '2025-10-16 08:49:46.559077', '2025-10-16 08:49:46.991675', false, '{"files": null, "metadata": {"date": "2020-12-02", "host": "Homo sapiens", "region": "Europe", "country": "Switzerland", "division": "Bern"}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAEIQAAQUNURw=="}}}', NULL);
INSERT INTO public.sequence_entries VALUES ('LOC_000004S', 1, 'dummyOrganism', 'custom3', 'testuser', 'testuser', 1, '2025-10-16 08:49:46.559077', '2025-10-16 08:49:46.991675', false, '{"files": null, "metadata": {"date": "2020-12-25", "host": "Homo sapiens", "region": "Europe", "country": "Switzerland", "division": "Schaffhausen"}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAEIQAAQUNURw=="}}}', NULL);
INSERT INTO public.sequence_entries VALUES ('LOC_000005Q', 1, 'dummyOrganism', 'custom4', 'testuser', 'testuser', 1, '2025-10-16 08:49:46.559077', '2025-10-16 08:49:46.991675', false, '{"files": null, "metadata": {"date": "2020-12-03", "host": "Homo sapiens", "region": "Europe", "country": "Switzerland", "division": "Zürich"}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAEIQAAQUNURw=="}}}', NULL);
INSERT INTO public.sequence_entries VALUES ('LOC_000006N', 1, 'dummyOrganism', 'custom5', 'testuser', 'testuser', 1, '2025-10-16 08:49:46.559077', '2025-10-16 08:49:46.991675', false, '{"files": null, "metadata": {"date": "2020-12-23", "host": "Homo sapiens", "region": "Europe", "country": "Switzerland", "division": "Basel-Land"}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAEIQAAQUNURw=="}}}', NULL);
INSERT INTO public.sequence_entries VALUES ('LOC_000007L', 1, 'dummyOrganism', 'custom6', 'testuser', 'testuser', 1, '2025-10-16 08:49:46.559077', '2025-10-16 08:49:46.991675', false, '{"files": null, "metadata": {"date": "2020-12-16", "host": "Homo sapiens", "region": "Europe", "country": "Switzerland", "division": "Aargau"}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAEIQAAQUNURw=="}}}', NULL);
INSERT INTO public.sequence_entries VALUES ('LOC_000008J', 1, 'dummyOrganism', 'custom7', 'testuser', 'testuser', 1, '2025-10-16 08:49:46.559077', '2025-10-16 08:49:46.991675', false, '{"files": null, "metadata": {"date": "2020-12-31", "host": "Homo sapiens", "region": "Europe", "country": "Switzerland", "division": "Sankt Gallen"}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAEIQAAQUNURw=="}}}', NULL);
INSERT INTO public.sequence_entries VALUES ('LOC_000009G', 1, 'dummyOrganism', 'custom8', 'testuser', 'testuser', 1, '2025-10-16 08:49:46.559077', '2025-10-16 08:49:46.991675', false, '{"files": null, "metadata": {"date": "2020-12-16", "host": "Homo sapiens", "region": "Europe", "country": "Switzerland", "division": "Aargau"}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAEIQAAQUNURw=="}}}', NULL);
INSERT INTO public.sequence_entries VALUES ('LOC_00000AE', 1, 'dummyOrganism', 'custom9', 'testuser', 'testuser', 1, '2025-10-16 08:49:46.559077', '2025-10-16 08:49:46.991675', false, '{"files": null, "metadata": {"date": "2020-12-01", "host": "Homo sapiens", "region": "Europe", "country": "Switzerland", "division": "Basel-Stadt"}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAEIQAAQUNURw=="}}}', NULL);


--
-- Data for Name: sequence_entries_preprocessed_data; Type: TABLE DATA; Schema: public; Owner: test
--

INSERT INTO public.sequence_entries_preprocessed_data VALUES ('LOC_000001Y', 1, 1, '{"files": null, "metadata": {"qc": 0.987654321, "age": 42, "date": "2002-12-15", "host": "google.com", "region": "Europe", "country": "Spain", "pangoLineage": "XBB.1.5", "booleanColumn": true}, "aminoAcidInsertions": {"someLongGene": ["123:RNRNRN"], "someShortGene": ["123:RN"]}, "nucleotideInsertions": {"main": ["123:ACTG"]}, "alignedAminoAcidSequences": {"someLongGene": {"compressedSequence": "KLUv/SAZyQAAQUNERUZHSElLTE1OUFFSU1RWV1lCWlgtKg=="}, "someShortGene": {"compressedSequence": "KLUv/SAEIQAATUFEUw=="}}, "alignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAxPQAAAAEA0kgBAQ=="}}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAIQQAATk5BQ1RHTk4="}}}', '[]', '[]', 'PROCESSED', '2025-10-16 08:49:46.692434', '2025-10-16 08:49:46.833375');
INSERT INTO public.sequence_entries_preprocessed_data VALUES ('LOC_000002W', 1, 1, '{"files": null, "metadata": {"qc": 0.987654321, "age": 42, "date": "2002-12-15", "host": "google.com", "region": "Europe", "country": "Spain", "pangoLineage": "XBB.1.5", "booleanColumn": true}, "aminoAcidInsertions": {"someLongGene": ["123:RNRNRN"], "someShortGene": ["123:RN"]}, "nucleotideInsertions": {"main": ["123:ACTG"]}, "alignedAminoAcidSequences": {"someLongGene": {"compressedSequence": "KLUv/SAZyQAAQUNERUZHSElLTE1OUFFSU1RWV1lCWlgtKg=="}, "someShortGene": {"compressedSequence": "KLUv/SAEIQAATUFEUw=="}}, "alignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAxPQAAAAEA0kgBAQ=="}}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAIQQAATk5BQ1RHTk4="}}}', '[]', '[]', 'PROCESSED', '2025-10-16 08:49:46.692471', '2025-10-16 08:49:46.932161');
INSERT INTO public.sequence_entries_preprocessed_data VALUES ('LOC_000003U', 1, 1, '{"files": null, "metadata": {"qc": 0.987654321, "age": 42, "date": "2002-12-15", "host": "google.com", "region": "Europe", "country": "Spain", "pangoLineage": "XBB.1.5", "booleanColumn": true}, "aminoAcidInsertions": {"someLongGene": ["123:RNRNRN"], "someShortGene": ["123:RN"]}, "nucleotideInsertions": {"main": ["123:ACTG"]}, "alignedAminoAcidSequences": {"someLongGene": {"compressedSequence": "KLUv/SAZyQAAQUNERUZHSElLTE1OUFFSU1RWV1lCWlgtKg=="}, "someShortGene": {"compressedSequence": "KLUv/SAEIQAATUFEUw=="}}, "alignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAxPQAAAAEA0kgBAQ=="}}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAIQQAATk5BQ1RHTk4="}}}', '[]', '[]', 'PROCESSED', '2025-10-16 08:49:46.692492', '2025-10-16 08:49:46.934938');
INSERT INTO public.sequence_entries_preprocessed_data VALUES ('LOC_000004S', 1, 1, '{"files": null, "metadata": {"qc": 0.987654321, "age": 42, "date": "2002-12-15", "host": "google.com", "region": "Europe", "country": "Spain", "pangoLineage": "XBB.1.5", "booleanColumn": true}, "aminoAcidInsertions": {"someLongGene": ["123:RNRNRN"], "someShortGene": ["123:RN"]}, "nucleotideInsertions": {"main": ["123:ACTG"]}, "alignedAminoAcidSequences": {"someLongGene": {"compressedSequence": "KLUv/SAZyQAAQUNERUZHSElLTE1OUFFSU1RWV1lCWlgtKg=="}, "someShortGene": {"compressedSequence": "KLUv/SAEIQAATUFEUw=="}}, "alignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAxPQAAAAEA0kgBAQ=="}}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAIQQAATk5BQ1RHTk4="}}}', '[]', '[]', 'PROCESSED', '2025-10-16 08:49:46.692509', '2025-10-16 08:49:46.937689');
INSERT INTO public.sequence_entries_preprocessed_data VALUES ('LOC_000005Q', 1, 1, '{"files": null, "metadata": {"qc": 0.987654321, "age": 42, "date": "2002-12-15", "host": "google.com", "region": "Europe", "country": "Spain", "pangoLineage": "XBB.1.5", "booleanColumn": true}, "aminoAcidInsertions": {"someLongGene": ["123:RNRNRN"], "someShortGene": ["123:RN"]}, "nucleotideInsertions": {"main": ["123:ACTG"]}, "alignedAminoAcidSequences": {"someLongGene": {"compressedSequence": "KLUv/SAZyQAAQUNERUZHSElLTE1OUFFSU1RWV1lCWlgtKg=="}, "someShortGene": {"compressedSequence": "KLUv/SAEIQAATUFEUw=="}}, "alignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAxPQAAAAEA0kgBAQ=="}}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAIQQAATk5BQ1RHTk4="}}}', '[]', '[]', 'PROCESSED', '2025-10-16 08:49:46.692523', '2025-10-16 08:49:46.940427');
INSERT INTO public.sequence_entries_preprocessed_data VALUES ('LOC_000006N', 1, 1, '{"files": null, "metadata": {"qc": 0.987654321, "age": 42, "date": "2002-12-15", "host": "google.com", "region": "Europe", "country": "Spain", "pangoLineage": "XBB.1.5", "booleanColumn": true}, "aminoAcidInsertions": {"someLongGene": ["123:RNRNRN"], "someShortGene": ["123:RN"]}, "nucleotideInsertions": {"main": ["123:ACTG"]}, "alignedAminoAcidSequences": {"someLongGene": {"compressedSequence": "KLUv/SAZyQAAQUNERUZHSElLTE1OUFFSU1RWV1lCWlgtKg=="}, "someShortGene": {"compressedSequence": "KLUv/SAEIQAATUFEUw=="}}, "alignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAxPQAAAAEA0kgBAQ=="}}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAIQQAATk5BQ1RHTk4="}}}', '[]', '[]', 'PROCESSED', '2025-10-16 08:49:46.692546', '2025-10-16 08:49:46.942892');
INSERT INTO public.sequence_entries_preprocessed_data VALUES ('LOC_000007L', 1, 1, '{"files": null, "metadata": {"qc": 0.987654321, "age": 42, "date": "2002-12-15", "host": "google.com", "region": "Europe", "country": "Spain", "pangoLineage": "XBB.1.5", "booleanColumn": true}, "aminoAcidInsertions": {"someLongGene": ["123:RNRNRN"], "someShortGene": ["123:RN"]}, "nucleotideInsertions": {"main": ["123:ACTG"]}, "alignedAminoAcidSequences": {"someLongGene": {"compressedSequence": "KLUv/SAZyQAAQUNERUZHSElLTE1OUFFSU1RWV1lCWlgtKg=="}, "someShortGene": {"compressedSequence": "KLUv/SAEIQAATUFEUw=="}}, "alignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAxPQAAAAEA0kgBAQ=="}}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAIQQAATk5BQ1RHTk4="}}}', '[]', '[]', 'PROCESSED', '2025-10-16 08:49:46.692563', '2025-10-16 08:49:46.945413');
INSERT INTO public.sequence_entries_preprocessed_data VALUES ('LOC_000008J', 1, 1, '{"files": null, "metadata": {"qc": 0.987654321, "age": 42, "date": "2002-12-15", "host": "google.com", "region": "Europe", "country": "Spain", "pangoLineage": "XBB.1.5", "booleanColumn": true}, "aminoAcidInsertions": {"someLongGene": ["123:RNRNRN"], "someShortGene": ["123:RN"]}, "nucleotideInsertions": {"main": ["123:ACTG"]}, "alignedAminoAcidSequences": {"someLongGene": {"compressedSequence": "KLUv/SAZyQAAQUNERUZHSElLTE1OUFFSU1RWV1lCWlgtKg=="}, "someShortGene": {"compressedSequence": "KLUv/SAEIQAATUFEUw=="}}, "alignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAxPQAAAAEA0kgBAQ=="}}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAIQQAATk5BQ1RHTk4="}}}', '[]', '[]', 'PROCESSED', '2025-10-16 08:49:46.692579', '2025-10-16 08:49:46.947919');
INSERT INTO public.sequence_entries_preprocessed_data VALUES ('LOC_000009G', 1, 1, '{"files": null, "metadata": {"qc": 0.987654321, "age": 42, "date": "2002-12-15", "host": "google.com", "region": "Europe", "country": "Spain", "pangoLineage": "XBB.1.5", "booleanColumn": true}, "aminoAcidInsertions": {"someLongGene": ["123:RNRNRN"], "someShortGene": ["123:RN"]}, "nucleotideInsertions": {"main": ["123:ACTG"]}, "alignedAminoAcidSequences": {"someLongGene": {"compressedSequence": "KLUv/SAZyQAAQUNERUZHSElLTE1OUFFSU1RWV1lCWlgtKg=="}, "someShortGene": {"compressedSequence": "KLUv/SAEIQAATUFEUw=="}}, "alignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAxPQAAAAEA0kgBAQ=="}}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAIQQAATk5BQ1RHTk4="}}}', '[]', '[]', 'PROCESSED', '2025-10-16 08:49:46.692599', '2025-10-16 08:49:46.950589');
INSERT INTO public.sequence_entries_preprocessed_data VALUES ('LOC_00000AE', 1, 1, '{"files": null, "metadata": {"qc": 0.987654321, "age": 42, "date": "2002-12-15", "host": "google.com", "region": "Europe", "country": "Spain", "pangoLineage": "XBB.1.5", "booleanColumn": true}, "aminoAcidInsertions": {"someLongGene": ["123:RNRNRN"], "someShortGene": ["123:RN"]}, "nucleotideInsertions": {"main": ["123:ACTG"]}, "alignedAminoAcidSequences": {"someLongGene": {"compressedSequence": "KLUv/SAZyQAAQUNERUZHSElLTE1OUFFSU1RWV1lCWlgtKg=="}, "someShortGene": {"compressedSequence": "KLUv/SAEIQAATUFEUw=="}}, "alignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAxPQAAAAEA0kgBAQ=="}}, "unalignedNucleotideSequences": {"main": {"compressedSequence": "KLUv/SAIQQAATk5BQ1RHTk4="}}}', '[]', '[]', 'PROCESSED', '2025-10-16 08:49:46.692614', '2025-10-16 08:49:46.953187');


--
-- Data for Name: sequence_upload_aux_table; Type: TABLE DATA; Schema: public; Owner: test
--



--
-- Data for Name: table_update_tracker; Type: TABLE DATA; Schema: public; Owner: test
--

INSERT INTO public.table_update_tracker VALUES ('external_metadata', '2025-10-16 08:49:46.092646');
INSERT INTO public.table_update_tracker VALUES ('current_processing_pipeline', '2025-10-16 08:49:46.092646');
INSERT INTO public.table_update_tracker VALUES ('groups_table', '2025-10-16 08:49:46.23007');
INSERT INTO public.table_update_tracker VALUES ('user_groups_table', '2025-10-16 08:49:46.23007');
INSERT INTO public.table_update_tracker VALUES ('data_use_terms_table', '2025-10-16 08:49:46.619256');
INSERT INTO public.table_update_tracker VALUES ('metadata_upload_aux_table', '2025-10-16 08:49:46.644988');
INSERT INTO public.table_update_tracker VALUES ('sequence_upload_aux_table', '2025-10-16 08:49:46.644988');
INSERT INTO public.table_update_tracker VALUES ('sequence_entries_preprocessed_data', '2025-10-16 08:49:46.830345');
INSERT INTO public.table_update_tracker VALUES ('sequence_entries', '2025-10-16 08:49:46.973107');


--
-- Data for Name: user_groups_table; Type: TABLE DATA; Schema: public; Owner: test
--

INSERT INTO public.user_groups_table VALUES (1, 'testuser', 1);


--
-- Name: accession_sequence; Type: SEQUENCE SET; Schema: public; Owner: test
--

SELECT pg_catalog.setval('public.accession_sequence', 10, true);


--
-- Name: audit_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: test
--

SELECT pg_catalog.setval('public.audit_log_id_seq', 5, true);


--
-- Name: groups_table_group_id_seq; Type: SEQUENCE SET; Schema: public; Owner: test
--

SELECT pg_catalog.setval('public.groups_table_group_id_seq', 1, true);


--
-- Name: seqset_id_sequence; Type: SEQUENCE SET; Schema: public; Owner: test
--

SELECT pg_catalog.setval('public.seqset_id_sequence', 1, false);


--
-- Name: seqset_records_seqset_record_id_seq; Type: SEQUENCE SET; Schema: public; Owner: test
--

SELECT pg_catalog.setval('public.seqset_records_seqset_record_id_seq', 1, false);


--
-- Name: seqset_to_records_seqset_record_id_seq; Type: SEQUENCE SET; Schema: public; Owner: test
--

SELECT pg_catalog.setval('public.seqset_to_records_seqset_record_id_seq', 1, false);


--
-- Name: user_groups_table_id_seq; Type: SEQUENCE SET; Schema: public; Owner: test
--

SELECT pg_catalog.setval('public.user_groups_table_id_seq', 1, true);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: current_processing_pipeline current_processing_pipeline_pkey; Type: CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.current_processing_pipeline
    ADD CONSTRAINT current_processing_pipeline_pkey PRIMARY KEY (organism);


--
-- Name: external_metadata external_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.external_metadata
    ADD CONSTRAINT external_metadata_pkey PRIMARY KEY (accession, version, external_metadata_updater);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: flyway_schema_history flyway_schema_history_pk; Type: CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.flyway_schema_history
    ADD CONSTRAINT flyway_schema_history_pk PRIMARY KEY (installed_rank);


--
-- Name: groups_table groups_table_pkey; Type: CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.groups_table
    ADD CONSTRAINT groups_table_pkey PRIMARY KEY (group_id);


--
-- Name: metadata_upload_aux_table metadata_upload_aux_table_pkey; Type: CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.metadata_upload_aux_table
    ADD CONSTRAINT metadata_upload_aux_table_pkey PRIMARY KEY (upload_id, submission_id);


--
-- Name: seqset_records seqset_records_pkey; Type: CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.seqset_records
    ADD CONSTRAINT seqset_records_pkey PRIMARY KEY (seqset_record_id);


--
-- Name: seqset_to_records seqset_to_records_pkey; Type: CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.seqset_to_records
    ADD CONSTRAINT seqset_to_records_pkey PRIMARY KEY (seqset_record_id, seqset_id, seqset_version);


--
-- Name: seqsets seqsets_pkey; Type: CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.seqsets
    ADD CONSTRAINT seqsets_pkey PRIMARY KEY (seqset_id, seqset_version);


--
-- Name: sequence_entries sequence_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.sequence_entries
    ADD CONSTRAINT sequence_entries_pkey PRIMARY KEY (accession, version);


--
-- Name: sequence_entries_preprocessed_data sequence_entries_preprocessed_data_pkey; Type: CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.sequence_entries_preprocessed_data
    ADD CONSTRAINT sequence_entries_preprocessed_data_pkey PRIMARY KEY (accession, version, pipeline_version);


--
-- Name: sequence_upload_aux_table sequence_upload_aux_table_pkey; Type: CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.sequence_upload_aux_table
    ADD CONSTRAINT sequence_upload_aux_table_pkey PRIMARY KEY (upload_id, submission_id, segment_name);


--
-- Name: table_update_tracker table_update_tracker_pkey; Type: CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.table_update_tracker
    ADD CONSTRAINT table_update_tracker_pkey PRIMARY KEY (table_name);


--
-- Name: user_groups_table user_groups_table_pkey; Type: CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.user_groups_table
    ADD CONSTRAINT user_groups_table_pkey PRIMARY KEY (id);


--
-- Name: user_groups_table user_groups_table_user_name_group_id_key; Type: CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.user_groups_table
    ADD CONSTRAINT user_groups_table_user_name_group_id_key UNIQUE (user_name, group_id);


--
-- Name: data_use_terms_table_accession_idx; Type: INDEX; Schema: public; Owner: test
--

CREATE INDEX data_use_terms_table_accession_idx ON public.data_use_terms_table USING btree (accession);


--
-- Name: flyway_schema_history_s_idx; Type: INDEX; Schema: public; Owner: test
--

CREATE INDEX flyway_schema_history_s_idx ON public.flyway_schema_history USING btree (success);


--
-- Name: sequence_entries_organism_idx; Type: INDEX; Schema: public; Owner: test
--

CREATE INDEX sequence_entries_organism_idx ON public.sequence_entries USING btree (organism);


--
-- Name: sequence_entries_submitter_idx; Type: INDEX; Schema: public; Owner: test
--

CREATE INDEX sequence_entries_submitter_idx ON public.sequence_entries USING btree (submitter);


--
-- Name: user_groups_table_user_name_idx; Type: INDEX; Schema: public; Owner: test
--

CREATE INDEX user_groups_table_user_name_idx ON public.user_groups_table USING btree (user_name);


--
-- Name: current_processing_pipeline update_tracker_trigger; Type: TRIGGER; Schema: public; Owner: test
--

CREATE TRIGGER update_tracker_trigger AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.current_processing_pipeline FOR EACH STATEMENT EXECUTE FUNCTION public.update_table_tracker();


--
-- Name: data_use_terms_table update_tracker_trigger; Type: TRIGGER; Schema: public; Owner: test
--

CREATE TRIGGER update_tracker_trigger AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.data_use_terms_table FOR EACH STATEMENT EXECUTE FUNCTION public.update_table_tracker();


--
-- Name: external_metadata update_tracker_trigger; Type: TRIGGER; Schema: public; Owner: test
--

CREATE TRIGGER update_tracker_trigger AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.external_metadata FOR EACH STATEMENT EXECUTE FUNCTION public.update_table_tracker();


--
-- Name: groups_table update_tracker_trigger; Type: TRIGGER; Schema: public; Owner: test
--

CREATE TRIGGER update_tracker_trigger AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.groups_table FOR EACH STATEMENT EXECUTE FUNCTION public.update_table_tracker();


--
-- Name: metadata_upload_aux_table update_tracker_trigger; Type: TRIGGER; Schema: public; Owner: test
--

CREATE TRIGGER update_tracker_trigger AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.metadata_upload_aux_table FOR EACH STATEMENT EXECUTE FUNCTION public.update_table_tracker();


--
-- Name: sequence_entries update_tracker_trigger; Type: TRIGGER; Schema: public; Owner: test
--

CREATE TRIGGER update_tracker_trigger AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.sequence_entries FOR EACH STATEMENT EXECUTE FUNCTION public.update_table_tracker();


--
-- Name: sequence_entries_preprocessed_data update_tracker_trigger; Type: TRIGGER; Schema: public; Owner: test
--

CREATE TRIGGER update_tracker_trigger AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.sequence_entries_preprocessed_data FOR EACH STATEMENT EXECUTE FUNCTION public.update_table_tracker();


--
-- Name: sequence_upload_aux_table update_tracker_trigger; Type: TRIGGER; Schema: public; Owner: test
--

CREATE TRIGGER update_tracker_trigger AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.sequence_upload_aux_table FOR EACH STATEMENT EXECUTE FUNCTION public.update_table_tracker();


--
-- Name: user_groups_table update_tracker_trigger; Type: TRIGGER; Schema: public; Owner: test
--

CREATE TRIGGER update_tracker_trigger AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.user_groups_table FOR EACH STATEMENT EXECUTE FUNCTION public.update_table_tracker();


--
-- Name: files files_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups_table(group_id);


--
-- Name: seqset_to_records foreign_key_seqset_id; Type: FK CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.seqset_to_records
    ADD CONSTRAINT foreign_key_seqset_id FOREIGN KEY (seqset_id, seqset_version) REFERENCES public.seqsets(seqset_id, seqset_version) ON DELETE CASCADE;


--
-- Name: seqset_to_records foreign_key_seqset_record_id; Type: FK CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.seqset_to_records
    ADD CONSTRAINT foreign_key_seqset_record_id FOREIGN KEY (seqset_record_id) REFERENCES public.seqset_records(seqset_record_id) ON DELETE CASCADE;


--
-- Name: sequence_entries sequence_entries_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.sequence_entries
    ADD CONSTRAINT sequence_entries_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups_table(group_id);


--
-- Name: sequence_entries_preprocessed_data sequence_entries_preprocessed_data_accession_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.sequence_entries_preprocessed_data
    ADD CONSTRAINT sequence_entries_preprocessed_data_accession_version_fkey FOREIGN KEY (accession, version) REFERENCES public.sequence_entries(accession, version) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_groups_table user_groups_table_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: test
--

ALTER TABLE ONLY public.user_groups_table
    ADD CONSTRAINT user_groups_table_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups_table(group_id);


--
-- PostgreSQL database dump complete
--

