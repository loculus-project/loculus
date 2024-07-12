import { Schema } from '../types/config';
import { siloVersionStatuses } from '../types/lapis';
import { VERSION_STATUS_FIELD, IS_REVOCATION_FIELD, pageSize } from '../settings';

export const getDefaultState = (schema: Schema) => ({
  [VERSION_STATUS_FIELD]: siloVersionStatuses.latestVersion,
  [IS_REVOCATION_FIELD]: 'false',
  orderBy: schema.defaultOrderBy || schema.primaryKey,
  order: schema.defaultOrder || 'ascending',
  page: '1',
});

export const mergeWithDefaultState = (state: Record<string, string>, schema: Schema) => {
  const defaultState = getDefaultState(schema);
  return { ...defaultState, ...state };
};

export const prepareLapisSearchParameters = (state: Record<string, string>, schema: Schema) => {
  const mergedState = mergeWithDefaultState(state, schema);
  return {
    ...mergedState,
    limit: pageSize,
    offset: (parseInt(mergedState.page) - 1) * pageSize,
  };
};

