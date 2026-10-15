update sequence_entries_preprocessed_data
set warnings = (
  select jsonb_agg(
    jsonb_build_object(
      'unprocessedFields', (
        select jsonb_agg(
          jsonb_build_object(
            'name', source->>'name',
            'type', source->>'type'
          )
        )
        from jsonb_array_elements(warning->'source') as source
      ),
      'processedFields', (
        select jsonb_agg(
          jsonb_build_object(
            'name', source->>'name',
            'type', source->>'type'
          )
        )
        from jsonb_array_elements(warning->'source') as source
      ),
      'message', warning->>'message'
    )
  )
  from jsonb_array_elements(warnings) as warning
)
where warnings is not null
  and exists (
    select 1
    from jsonb_array_elements(warnings) as warning
    where warning->'source' is not null
  );

update sequence_entries_preprocessed_data
set errors = (
  select jsonb_agg(
    jsonb_build_object(
      'unprocessedFields', (
        select jsonb_agg(
          jsonb_build_object(
            'name', source->>'name',
            'type', source->>'type'
          )
        )
        from jsonb_array_elements(error->'source') as source
      ),
      'processedFields', (
        select jsonb_agg(
          jsonb_build_object(
            'name', source->>'name',
            'type', source->>'type'
          )
        )
        from jsonb_array_elements(error->'source') as source
      ),
      'message', error->>'message'
    )
  )
  from jsonb_array_elements(errors) as error
)
where errors is not null
and exists (
    select 1
    from jsonb_array_elements(errors) as error
    where error->'source' is not null
  );