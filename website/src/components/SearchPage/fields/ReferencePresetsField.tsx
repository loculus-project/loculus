import { forwardRef, type FocusEventHandler } from 'react';

import { TextField } from './TextField.tsx';
import type { FieldValueUpdate, MetadataFilter, SetSomeFieldValues } from '../../../types/config.ts';
import DisabledUntilHydrated from '../../DisabledUntilHydrated.tsx';

export type FieldPresetMap = Record<string, Record<string, string>>;

export type ReferencePresetsFieldProps = {
  field: MetadataFilter;
  setSomeFieldValues: SetSomeFieldValues;
  multiline?: boolean;
  onFocus?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  onBlur?: FocusEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  fieldValue: string | number;
  type?: 'string' | 'boolean' | 'float' | 'int' | 'authors';
  fieldPresets?: FieldPresetMap;
};

export const ReferencePresetsField = forwardRef<HTMLInputElement, ReferencePresetsFieldProps>(
  (props, ref) => {
    const { field, setSomeFieldValues, multiline, onFocus, onBlur, fieldValue, fieldPresets } = props;

    return (
      <DisabledUntilHydrated>
        <TextField
          label={field.displayName ?? field.name}
          type={field.type}
          fieldValue={fieldValue}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={(e) => {
            const nextValue = e.target.value;
            const updates: FieldValueUpdate[] = [[field.name, nextValue]];

            const preset = fieldPresets?.[nextValue];
            if (preset) {
              updates.push(
                ...Object.entries(preset).map(([k, v]) => [k, v] as FieldValueUpdate)
              );
            }

            setSomeFieldValues(...updates);
          }}
          autoComplete="off"
          multiline={multiline}
          ref={ref}
        />
      </DisabledUntilHydrated>
    );
  }
);
