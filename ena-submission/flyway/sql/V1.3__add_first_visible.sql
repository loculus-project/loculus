ALTER TABLE project_table ADD ena_first_publicly_visible timestamp with time zone;

ALTER TABLE sample_table ADD ena_first_publicly_visible timestamp with time zone;

ALTER TABLE assembly_table ADD ena_nucleotide_first_publicly_visible timestamp with time zone;
ALTER TABLE assembly_table ADD ena_gca_first_publicly_visible timestamp with time zone;