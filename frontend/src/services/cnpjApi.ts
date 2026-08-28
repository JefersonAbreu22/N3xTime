export type CnpjCompanyData = {
  legalName: string;
  tradeName: string;
  email: string;
  phone: string;
  zipCode: string;
  addressLine: string;
  city: string;
  state: string;
};

export const lookupCnpj = async (cnpj: string): Promise<CnpjCompanyData> => {
  const cleanCnpj = cnpj.replace(/\D/g, '');
  if (cleanCnpj.length !== 14) throw new Error('INVALID_CNPJ');

  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
  if (!response.ok) throw new Error('CNPJ_NOT_FOUND');

  const data = await response.json();
  const addressLine = data.logradouro
    ? `${data.logradouro}${data.numero ? `, ${data.numero}` : ''}${data.complemento ? ` - ${data.complemento}` : ''}`
    : '';

  return {
    legalName: data.razao_social || '',
    tradeName: data.nome_fantasia || '',
    email: data.email || '',
    phone: data.ddd_telefone_1 || '',
    zipCode: data.cep || '',
    addressLine,
    city: data.municipio || '',
    state: data.uf || '',
  };
};
