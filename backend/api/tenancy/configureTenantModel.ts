import { DataTypes, Model, ModelStatic, Op } from 'sequelize';
import { Company } from '../models/Company.js';
import { getTenantContext } from './tenantContext.js';

type QueryOptions = { where?: any };

const tenantWhere = (where: QueryOptions['where'], companyId: number) => ({
  [Op.and]: [where ?? {}, { company_id: companyId }],
});

const requireTenant = () => {
  const context = getTenantContext();
  if (context?.bypass) return null;
  if (!context?.companyId) {
    throw new Error('Operacao em dados de empresa executada sem contexto multitenant.');
  }
  return context.companyId;
};

export const configureTenantModel = (
  model: ModelStatic<Model>,
  uniqueFields: string[] = [],
  onePerCompany = false
) => {
  model.rawAttributes.company_id = {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: Company.tableName, key: 'id' },
  };

  for (const field of uniqueFields) {
    if (model.rawAttributes[field]) model.rawAttributes[field].unique = false;
  }

  model.options.indexes = [
    ...(model.options.indexes ?? []),
    { name: `${model.tableName}_company_id`, fields: ['company_id'], unique: onePerCompany },
    ...uniqueFields.map((field) => ({
      name: `${model.tableName}_company_id_${field}`,
      unique: true,
      fields: ['company_id', field],
    })),
  ];
  (model as ModelStatic<Model> & { _indexes: typeof model.options.indexes })._indexes = model.options.indexes;
  (model as ModelStatic<Model> & { refreshAttributes: () => void }).refreshAttributes();

  model.addHook('beforeFind', (options: QueryOptions) => {
    const companyId = requireTenant();
    if (companyId) options.where = tenantWhere(options.where, companyId);
  });
  model.addHook('beforeCount', (options: QueryOptions) => {
    const companyId = requireTenant();
    if (companyId) options.where = tenantWhere(options.where, companyId);
  });
  model.addHook('beforeBulkUpdate', (options: QueryOptions) => {
    const companyId = requireTenant();
    if (companyId) {
      options.where = tenantWhere(options.where, companyId);
      const attributes = (options as QueryOptions & { attributes?: Record<string, unknown> }).attributes;
      if (attributes) attributes.company_id = companyId;
    }
  });
  model.addHook('beforeBulkDestroy', (options: QueryOptions) => {
    const companyId = requireTenant();
    if (companyId) options.where = tenantWhere(options.where, companyId);
  });
  model.addHook('beforeValidate', (instance: Model) => {
    const companyId = requireTenant();
    if (!companyId) return;
    const current = instance.getDataValue('company_id');
    if (current && Number(current) !== companyId) {
      throw new Error('Tentativa de gravacao fora da empresa autenticada.');
    }
    instance.setDataValue('company_id', companyId);
  });
  model.addHook('beforeBulkCreate', (instances: Model[]) => {
    const companyId = requireTenant();
    if (!companyId) return;
    for (const instance of instances) {
      const current = instance.getDataValue('company_id');
      if (current && Number(current) !== companyId) {
        throw new Error('Tentativa de gravacao em lote fora da empresa autenticada.');
      }
      instance.setDataValue('company_id', companyId);
    }
  });
  model.addHook('beforeUpsert', (values: any) => {
    const companyId = requireTenant();
    if (!companyId) return;
    if (values.company_id && Number(values.company_id) !== companyId) {
      throw new Error('Tentativa de upsert fora da empresa autenticada.');
    }
    values.company_id = companyId;
  });
};
