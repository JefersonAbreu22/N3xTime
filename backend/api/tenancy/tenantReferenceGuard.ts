import { Model, ModelStatic } from 'sequelize';

export class TenantReferenceError extends Error {
  readonly statusCode = 400;

  constructor(field: string) {
    super(`A referência ${field} não pertence à empresa autenticada.`);
    this.name = 'TenantReferenceError';
  }
}

export const guardTenantReference = (
  source: ModelStatic<Model>,
  field: string,
  target: ModelStatic<Model>
) => {
  source.addHook('beforeValidate', async (instance: Model) => {
    const referenceId = instance.getDataValue(field);
    if (referenceId === null || referenceId === undefined) return;

    const existsInTenant = await target.count({ where: { id: referenceId } });
    if (!existsInTenant) {
      throw new TenantReferenceError(field);
    }
  });
};
