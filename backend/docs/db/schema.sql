--
-- PostgreSQL database dump
--

\restrict dummy

-- Dumped from database version 15.15 (Debian 15.15-1.pgdg13+1)
-- Dumped by pg_dump version 16.11 (Debian 16.11-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: create_update_trigger_for_table(text); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.create_update_trigger_for_table(table_name text) OWNER TO postgres;

--
-- Name: jsonb_concat(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.jsonb_concat(a jsonb, b jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $_$select $1 || $2$_$;


ALTER FUNCTION public.jsonb_concat(a jsonb, b jsonb) OWNER TO postgres;

--
-- Name: update_table_tracker(); Type: FUNCTION; Schema: public; Owner: postgres
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


ALTER FUNCTION public.update_table_tracker() OWNER TO postgres;

--
-- Name: jsonb_merge_agg(jsonb); Type: AGGREGATE; Schema: public; Owner: postgres
--

CREATE AGGREGATE public.jsonb_merge_agg(jsonb) (
    SFUNC = jsonb_concat,
    STYPE = jsonb,
    INITCOND = '{}'
);


ALTER AGGREGATE public.jsonb_merge_agg(jsonb) OWNER TO postgres;

--
-- Name: accession_sequence; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.accession_sequence
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.accession_sequence OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    username text,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    description text NOT NULL
);


ALTER TABLE public.audit_log OWNER TO postgres;

--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audit_log_id_seq OWNER TO postgres;

--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: compression_dictionaries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.compression_dictionaries (
    id integer NOT NULL,
    hash character(64) NOT NULL,
    dict_contents bytea NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    description text
);


ALTER TABLE public.compression_dictionaries OWNER TO postgres;

--
-- Name: compression_dictionaries_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.compression_dictionaries ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.compression_dictionaries_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: current_processing_pipeline; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.current_processing_pipeline (
    version bigint NOT NULL,
    started_using_at timestamp without time zone NOT NULL,
    organism text NOT NULL
);


ALTER TABLE public.current_processing_pipeline OWNER TO postgres;

--
-- Name: data_use_terms_table; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.data_use_terms_table (
    accession text NOT NULL,
    change_date timestamp without time zone NOT NULL,
    data_use_terms_type text NOT NULL,
    restricted_until timestamp without time zone,
    user_name text NOT NULL
);


ALTER TABLE public.data_use_terms_table OWNER TO postgres;

--
-- Name: external_metadata; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.external_metadata (
    accession text NOT NULL,
    version bigint NOT NULL,
    external_metadata_updater text NOT NULL,
    external_metadata jsonb,
    updated_metadata_at timestamp without time zone NOT NULL
);


ALTER TABLE public.external_metadata OWNER TO postgres;

--
-- Name: files; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.files OWNER TO postgres;

--
-- Name: flyway_schema_history; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.flyway_schema_history OWNER TO postgres;

--
-- Name: groups_table; Type: TABLE; Schema: public; Owner: postgres
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
    contact_email character varying(255) NOT NULL,
    created_at timestamp without time zone NOT NULL,
    created_by text
);


ALTER TABLE public.groups_table OWNER TO postgres;

--
-- Name: groups_table_group_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.groups_table_group_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.groups_table_group_id_seq OWNER TO postgres;

--
-- Name: groups_table_group_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.groups_table_group_id_seq OWNED BY public.groups_table.group_id;


--
-- Name: metadata_upload_aux_table; Type: TABLE; Schema: public; Owner: postgres
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
    files jsonb,
    fasta_ids text[]
);


ALTER TABLE public.metadata_upload_aux_table OWNER TO postgres;

--
-- Name: seqset_id_sequence; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.seqset_id_sequence
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.seqset_id_sequence OWNER TO postgres;

--
-- Name: seqset_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.seqset_records (
    seqset_record_id bigint NOT NULL,
    accession text NOT NULL,
    type text NOT NULL,
    is_focal boolean NOT NULL
);


ALTER TABLE public.seqset_records OWNER TO postgres;

--
-- Name: seqset_records_seqset_record_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.seqset_records_seqset_record_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.seqset_records_seqset_record_id_seq OWNER TO postgres;

--
-- Name: seqset_records_seqset_record_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.seqset_records_seqset_record_id_seq OWNED BY public.seqset_records.seqset_record_id;


--
-- Name: seqset_to_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.seqset_to_records (
    seqset_record_id bigint NOT NULL,
    seqset_id text NOT NULL,
    seqset_version bigint NOT NULL
);


ALTER TABLE public.seqset_to_records OWNER TO postgres;

--
-- Name: seqset_to_records_seqset_record_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.seqset_to_records_seqset_record_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.seqset_to_records_seqset_record_id_seq OWNER TO postgres;

--
-- Name: seqset_to_records_seqset_record_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.seqset_to_records_seqset_record_id_seq OWNED BY public.seqset_to_records.seqset_record_id;


--
-- Name: seqsets; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.seqsets OWNER TO postgres;

--
-- Name: sequence_entries; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.sequence_entries OWNER TO postgres;

--
-- Name: sequence_entries_preprocessed_data; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.sequence_entries_preprocessed_data OWNER TO postgres;

--
-- Name: sequence_entries_view; Type: VIEW; Schema: public; Owner: postgres
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
        CASE
            WHEN aem.has_ena_updater THEN 'DEPOSITED'::text
            WHEN (se.group_id = 1) THEN 'INGESTED'::text
            ELSE 'READY'::text
        END AS ena_deposition_status,
    sepd.processed_data,
        CASE
            WHEN (aem.external_metadata IS NULL) THEN sepd.processed_data
            ELSE (sepd.processed_data || jsonb_build_object('metadata', ((sepd.processed_data -> 'metadata'::text) || aem.external_metadata)))
        END AS joint_metadata,
        CASE
            WHEN se.is_revocation THEN cpp.version
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
     LEFT JOIN public.current_processing_pipeline cpp ON ((se.organism = cpp.organism)))
     LEFT JOIN public.sequence_entries_preprocessed_data sepd ON (((se.accession = sepd.accession) AND (se.version = sepd.version) AND (sepd.pipeline_version = cpp.version))))
     LEFT JOIN ( SELECT em.accession,
            em.version,
            public.jsonb_merge_agg(em.external_metadata) AS external_metadata,
            bool_or((em.external_metadata_updater = 'ena'::text)) AS has_ena_updater
           FROM public.external_metadata em
          GROUP BY em.accession, em.version) aem ON (((aem.accession = se.accession) AND (aem.version = se.version))));


ALTER VIEW public.sequence_entries_view OWNER TO postgres;

--
-- Name: sequence_upload_aux_table; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sequence_upload_aux_table (
    upload_id text NOT NULL,
    compressed_sequence_data text NOT NULL,
    fasta_id text NOT NULL
);


ALTER TABLE public.sequence_upload_aux_table OWNER TO postgres;

--
-- Name: table_update_tracker; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.table_update_tracker (
    table_name text NOT NULL,
    last_time_updated timestamp without time zone DEFAULT timezone('UTC'::text, CURRENT_TIMESTAMP)
);


ALTER TABLE public.table_update_tracker OWNER TO postgres;

--
-- Name: user_groups_table; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_groups_table (
    id integer NOT NULL,
    user_name text NOT NULL,
    group_id integer NOT NULL
);


ALTER TABLE public.user_groups_table OWNER TO postgres;

--
-- Name: user_groups_table_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.user_groups_table_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_groups_table_id_seq OWNER TO postgres;

--
-- Name: user_groups_table_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.user_groups_table_id_seq OWNED BY public.user_groups_table.id;


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: groups_table group_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.groups_table ALTER COLUMN group_id SET DEFAULT nextval('public.groups_table_group_id_seq'::regclass);


--
-- Name: seqset_records seqset_record_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seqset_records ALTER COLUMN seqset_record_id SET DEFAULT nextval('public.seqset_records_seqset_record_id_seq'::regclass);


--
-- Name: seqset_to_records seqset_record_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seqset_to_records ALTER COLUMN seqset_record_id SET DEFAULT nextval('public.seqset_to_records_seqset_record_id_seq'::regclass);


--
-- Name: user_groups_table id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_groups_table ALTER COLUMN id SET DEFAULT nextval('public.user_groups_table_id_seq'::regclass);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: compression_dictionaries compression_dictionaries_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compression_dictionaries
    ADD CONSTRAINT compression_dictionaries_hash_key UNIQUE (hash);


--
-- Name: compression_dictionaries compression_dictionaries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.compression_dictionaries
    ADD CONSTRAINT compression_dictionaries_pkey PRIMARY KEY (id);


--
-- Name: current_processing_pipeline current_processing_pipeline_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.current_processing_pipeline
    ADD CONSTRAINT current_processing_pipeline_pkey PRIMARY KEY (organism);


--
-- Name: external_metadata external_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.external_metadata
    ADD CONSTRAINT external_metadata_pkey PRIMARY KEY (accession, version, external_metadata_updater);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: flyway_schema_history flyway_schema_history_pk; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flyway_schema_history
    ADD CONSTRAINT flyway_schema_history_pk PRIMARY KEY (installed_rank);


--
-- Name: groups_table groups_table_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.groups_table
    ADD CONSTRAINT groups_table_pkey PRIMARY KEY (group_id);


--
-- Name: metadata_upload_aux_table metadata_upload_aux_table_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.metadata_upload_aux_table
    ADD CONSTRAINT metadata_upload_aux_table_pkey PRIMARY KEY (upload_id, submission_id);


--
-- Name: metadata_upload_aux_table metadata_upload_aux_table_upload_id_accession_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.metadata_upload_aux_table
    ADD CONSTRAINT metadata_upload_aux_table_upload_id_accession_key UNIQUE (upload_id, accession);


--
-- Name: seqset_records seqset_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seqset_records
    ADD CONSTRAINT seqset_records_pkey PRIMARY KEY (seqset_record_id);


--
-- Name: seqset_to_records seqset_to_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seqset_to_records
    ADD CONSTRAINT seqset_to_records_pkey PRIMARY KEY (seqset_record_id, seqset_id, seqset_version);


--
-- Name: seqsets seqsets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seqsets
    ADD CONSTRAINT seqsets_pkey PRIMARY KEY (seqset_id, seqset_version);


--
-- Name: sequence_entries sequence_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sequence_entries
    ADD CONSTRAINT sequence_entries_pkey PRIMARY KEY (accession, version);


--
-- Name: sequence_entries_preprocessed_data sequence_entries_preprocessed_data_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sequence_entries_preprocessed_data
    ADD CONSTRAINT sequence_entries_preprocessed_data_pkey PRIMARY KEY (accession, version, pipeline_version);


--
-- Name: sequence_upload_aux_table sequence_upload_aux_table_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sequence_upload_aux_table
    ADD CONSTRAINT sequence_upload_aux_table_pkey PRIMARY KEY (upload_id, fasta_id);


--
-- Name: table_update_tracker table_update_tracker_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.table_update_tracker
    ADD CONSTRAINT table_update_tracker_pkey PRIMARY KEY (table_name);


--
-- Name: user_groups_table user_groups_table_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_groups_table
    ADD CONSTRAINT user_groups_table_pkey PRIMARY KEY (id);


--
-- Name: user_groups_table user_groups_table_user_name_group_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_groups_table
    ADD CONSTRAINT user_groups_table_user_name_group_id_key UNIQUE (user_name, group_id);


--
-- Name: data_use_terms_table_accession_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX data_use_terms_table_accession_idx ON public.data_use_terms_table USING btree (accession);


--
-- Name: flyway_schema_history_s_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX flyway_schema_history_s_idx ON public.flyway_schema_history USING btree (success);


--
-- Name: sequence_entries_organism_covering_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sequence_entries_organism_covering_idx ON public.sequence_entries USING btree (organism) INCLUDE (accession);


--
-- Name: sequence_entries_organism_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sequence_entries_organism_idx ON public.sequence_entries USING btree (organism);


--
-- Name: sequence_entries_organism_not_revocation_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sequence_entries_organism_not_revocation_idx ON public.sequence_entries USING btree (organism) WHERE (NOT is_revocation);


--
-- Name: sequence_entries_preprocessed_data_accession_version_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sequence_entries_preprocessed_data_accession_version_idx ON public.sequence_entries_preprocessed_data USING btree (accession, version);


--
-- Name: sequence_entries_submitter_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX sequence_entries_submitter_idx ON public.sequence_entries USING btree (submitter);


--
-- Name: user_groups_table_user_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX user_groups_table_user_name_idx ON public.user_groups_table USING btree (user_name);


--
-- Name: current_processing_pipeline update_tracker_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_tracker_trigger AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.current_processing_pipeline FOR EACH STATEMENT EXECUTE FUNCTION public.update_table_tracker();


--
-- Name: data_use_terms_table update_tracker_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_tracker_trigger AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.data_use_terms_table FOR EACH STATEMENT EXECUTE FUNCTION public.update_table_tracker();


--
-- Name: external_metadata update_tracker_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_tracker_trigger AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.external_metadata FOR EACH STATEMENT EXECUTE FUNCTION public.update_table_tracker();


--
-- Name: groups_table update_tracker_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_tracker_trigger AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.groups_table FOR EACH STATEMENT EXECUTE FUNCTION public.update_table_tracker();


--
-- Name: metadata_upload_aux_table update_tracker_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_tracker_trigger AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.metadata_upload_aux_table FOR EACH STATEMENT EXECUTE FUNCTION public.update_table_tracker();


--
-- Name: sequence_entries update_tracker_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_tracker_trigger AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.sequence_entries FOR EACH STATEMENT EXECUTE FUNCTION public.update_table_tracker();


--
-- Name: sequence_entries_preprocessed_data update_tracker_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_tracker_trigger AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.sequence_entries_preprocessed_data FOR EACH STATEMENT EXECUTE FUNCTION public.update_table_tracker();


--
-- Name: sequence_upload_aux_table update_tracker_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_tracker_trigger AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.sequence_upload_aux_table FOR EACH STATEMENT EXECUTE FUNCTION public.update_table_tracker();


--
-- Name: user_groups_table update_tracker_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_tracker_trigger AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.user_groups_table FOR EACH STATEMENT EXECUTE FUNCTION public.update_table_tracker();


--
-- Name: files files_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups_table(group_id);


--
-- Name: seqset_to_records foreign_key_seqset_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seqset_to_records
    ADD CONSTRAINT foreign_key_seqset_id FOREIGN KEY (seqset_id, seqset_version) REFERENCES public.seqsets(seqset_id, seqset_version) ON DELETE CASCADE;


--
-- Name: seqset_to_records foreign_key_seqset_record_id; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.seqset_to_records
    ADD CONSTRAINT foreign_key_seqset_record_id FOREIGN KEY (seqset_record_id) REFERENCES public.seqset_records(seqset_record_id) ON DELETE CASCADE;


--
-- Name: sequence_entries sequence_entries_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sequence_entries
    ADD CONSTRAINT sequence_entries_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups_table(group_id);


--
-- Name: sequence_entries_preprocessed_data sequence_entries_preprocessed_data_accession_version_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sequence_entries_preprocessed_data
    ADD CONSTRAINT sequence_entries_preprocessed_data_accession_version_fkey FOREIGN KEY (accession, version) REFERENCES public.sequence_entries(accession, version) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: user_groups_table user_groups_table_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_groups_table
    ADD CONSTRAINT user_groups_table_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups_table(group_id);


--
-- PostgreSQL database dump complete
--

\unrestrict dummy

