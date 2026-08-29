import mysql, { type Connection, type ExecuteValues, type RowDataPacket } from 'mysql2/promise';
import { escape as mysqlEscape } from 'mysql2';
import crypto from 'node:crypto';

const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const EXCLUDED_TENANT_TABLES = new Set(['company_memberships', 'platform_audit_logs', 'tenant_transfer_logs']);
const ident = (value: string) => {
  if (!/^[A-Za-z0-9_]+$/.test(value)) throw new Error(`Identificador SQL inválido: ${value}`);
  return `\`${value}\``;
};

const connectionOptions = (database?: string) => ({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  ...(database ? { database } : {}),
  charset: 'utf8mb4',
  multipleStatements: false,
});

const splitSqlStatements = (sql: string) => {
  const clean = sql.replace(/\/\*!\d*[\s\S]*?\*\//g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const statements: string[] = []; let current = ''; let quote = ''; let escaped = false;
  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (!quote && char === '-' && clean[i + 1] === '-' && /\s/.test(clean[i + 2] || '')) { while (i < clean.length && clean[i] !== '\n') i += 1; current += '\n'; continue; }
    if (!quote && char === '#') { while (i < clean.length && clean[i] !== '\n') i += 1; current += '\n'; continue; }
    if (escaped) { current += char; escaped = false; continue; }
    if (quote && char === '\\') { current += char; escaped = true; continue; }
    if (quote) { current += char; if (char === quote) quote = ''; continue; }
    if (char === "'" || char === '"' || char === '`') { quote = char; current += char; continue; }
    if (char === ';') { if (current.trim()) statements.push(current.trim()); current = ''; continue; }
    current += char;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
};

const loadDumpIntoTemporaryDatabase = async (connection: Connection, sql: string) => {
  await connection.query('SET FOREIGN_KEY_CHECKS=0');
  let executed = 0;
  for (const statement of splitSqlStatements(sql)) {
    const normalized = statement.replace(/^\s+/, '');
    if (/^(CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?[A-Za-z0-9_]+`?\s*\()/i.test(normalized)
      || /^(INSERT|REPLACE)\s+INTO\s+`?[A-Za-z0-9_]+`?/i.test(normalized)) {
      await connection.query(statement); executed += 1;
    }
  }
  await connection.query('SET FOREIGN_KEY_CHECKS=1');
  if (!executed) throw new Error('O arquivo não contém CREATE TABLE/INSERT compatíveis com um dump MySQL.');
};

type ColumnMeta = RowDataPacket & { TABLE_NAME: string; COLUMN_NAME: string; COLUMN_TYPE: string; IS_NULLABLE: 'YES' | 'NO'; EXTRA: string };
type ForeignKeyMeta = RowDataPacket & { TABLE_NAME: string; COLUMN_NAME: string; REFERENCED_TABLE_NAME: string; REFERENCED_COLUMN_NAME: string };

const tenantMetadata = async (connection: Connection, database: string) => {
  const [columns] = await connection.query<ColumnMeta[]>(`SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME,ORDINAL_POSITION`, [database]);
  const [fks] = await connection.query<ForeignKeyMeta[]>(`SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL`, [database]);
  const byTable = new Map<string, ColumnMeta[]>();
  for (const column of columns) { const list = byTable.get(column.TABLE_NAME) || []; list.push(column); byTable.set(column.TABLE_NAME, list); }
  const tenantTables = [...byTable.entries()].filter(([table, cols]) => cols.some(c => c.COLUMN_NAME === 'company_id') && !EXCLUDED_TENANT_TABLES.has(table)).map(([table]) => table);
  return { byTable, tenantTables, fks };
};

const sortTables = (tables: string[], fks: ForeignKeyMeta[]) => {
  const set = new Set(tables); const deps = new Map(tables.map(t => [t, new Set<string>()]));
  for (const fk of fks) if (set.has(fk.TABLE_NAME) && set.has(fk.REFERENCED_TABLE_NAME) && fk.TABLE_NAME !== fk.REFERENCED_TABLE_NAME) deps.get(fk.TABLE_NAME)!.add(fk.REFERENCED_TABLE_NAME);
  const result: string[] = []; const remaining = new Set(tables);
  while (remaining.size) {
    const ready = [...remaining].filter(t => [...deps.get(t)!].every(d => result.includes(d)));
    if (!ready.length) { result.push(...remaining); break; }
    for (const table of ready) { result.push(table); remaining.delete(table); }
  }
  return result;
};

export const createTenantBackup = async (companyId: number) => {
  const database = String(process.env.DB_NAME || '').trim(); if (!database) throw new Error('DB_NAME não configurado.');
  const connection = await mysql.createConnection(connectionOptions(database));
  try {
    const [companyRows] = await connection.query<RowDataPacket[]>('SELECT id,legal_name,trade_name,slug,cnpj FROM companies WHERE id=? LIMIT 1', [companyId]);
    const company = companyRows[0]; if (!company) throw new Error('Empresa não encontrada.');
    const { byTable, tenantTables, fks } = await tenantMetadata(connection, database);
    const ordered = sortTables(tenantTables, fks);
    const chunks = [`-- N3xTime tenant backup\n-- N3XTIME_META ${JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), company: { legal_name: company.legal_name, trade_name: company.trade_name, slug: company.slug, cnpj: company.cnpj } })}\nSET NAMES utf8mb4;\n`];
    let rowsProcessed = 0;
    for (const table of ordered) {
      const columns = (byTable.get(table) || []).filter(c => c.COLUMN_NAME !== 'company_id');
      chunks.push(`\nCREATE TABLE ${ident(table)} (\n${columns.map(c => `  ${ident(c.COLUMN_NAME)} ${c.COLUMN_TYPE} ${c.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`).join(',\n')}\n);\n`);
      const [rows] = await connection.query<RowDataPacket[]>(`SELECT * FROM ${ident(table)} WHERE company_id=?`, [companyId]);
      for (let offset = 0; offset < rows.length; offset += 200) {
        const batch = rows.slice(offset, offset + 200); if (!batch.length) continue;
        const names = columns.map(c => c.COLUMN_NAME);
        const values = batch.map(row => `(${names.map(name => mysqlEscape(row[name])).join(',')})`).join(',\n');
        chunks.push(`INSERT INTO ${ident(table)} (${names.map(ident).join(',')}) VALUES\n${values};\n`);
        rowsProcessed += batch.length;
      }
    }
    const safeSlug = String(company.slug || `company-${companyId}`).replace(/[^a-z0-9-]/gi, '-');
    return { filename: `n3xtime-${safeSlug}-${new Date().toISOString().slice(0,10)}.sql`, buffer: Buffer.from(chunks.join(''), 'utf8'), rowsProcessed, tables: ordered.length };
  } finally { await connection.end(); }
};

export const importTenantDump = async (companyId: number, buffer: Buffer, replaceExisting = true) => {
  if (!buffer.length || buffer.length > MAX_IMPORT_BYTES) throw new Error('Dump vazio ou acima do limite de 50 MB.');
  const database = String(process.env.DB_NAME || '').trim(); if (!database) throw new Error('DB_NAME não configurado.');
  const tempDb = `n3xtime_import_${crypto.randomUUID().replace(/-/g, '').slice(0, 18)}`;
  const admin = await mysql.createConnection(connectionOptions());
  await admin.query(`CREATE DATABASE ${ident(tempDb)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  const source = await mysql.createConnection(connectionOptions(tempDb));
  const target = await mysql.createConnection(connectionOptions(database));
  try {
    await loadDumpIntoTemporaryDatabase(source, buffer.toString('utf8'));
    const { byTable, tenantTables, fks } = await tenantMetadata(target, database);
    const [sourceTablesRows] = await source.query<RowDataPacket[]>('SHOW TABLES');
    const sourceTables = new Set(sourceTablesRows.map(row => String(Object.values(row)[0])));
    const importTables = tenantTables.filter(t => sourceTables.has(t));
    if (!importTables.includes('users')) throw new Error('Dump incompatível: tabela users não encontrada.');
    const ordered = sortTables(importTables, fks);
    const idMaps = new Map<string, Map<number, number>>(); const deferred: Array<{table:string; id:number; column:string; oldRef:number; refTable:string}> = [];
    let rowsProcessed = 0;
    await target.beginTransaction();
    try {
      if (replaceExisting) {
        await target.query('DELETE FROM company_memberships WHERE company_id=?', [companyId]);
        await target.query('SET FOREIGN_KEY_CHECKS=0');
        for (const table of [...ordered].reverse()) await target.query(`DELETE FROM ${ident(table)} WHERE company_id=?`, [companyId]);
        await target.query('SET FOREIGN_KEY_CHECKS=1');
      }
      for (const table of ordered) {
        const targetCols = byTable.get(table) || []; const allowed = new Set(targetCols.map(c => c.COLUMN_NAME));
        const tableFks = fks.filter(f => f.TABLE_NAME === table); const [rows] = await source.query<RowDataPacket[]>(`SELECT * FROM ${ident(table)}`);
        const map = new Map<number, number>(); idMaps.set(table, map);
        for (const row of rows) {
          const oldId = Number(row.id); const payload: Record<string, ExecuteValues> = {};
          for (const [key, value] of Object.entries(row)) if (allowed.has(key) && key !== 'id' && key !== 'company_id') payload[key] = value;
          payload.company_id = companyId;
          for (const fk of tableFks) {
            if (fk.COLUMN_NAME === 'company_id') continue;
            const raw = payload[fk.COLUMN_NAME]; if (raw === null || raw === undefined) continue;
            if (fk.REFERENCED_TABLE_NAME === table) { deferred.push({ table, id: oldId, column: fk.COLUMN_NAME, oldRef: Number(raw), refTable: table }); payload[fk.COLUMN_NAME] = null; continue; }
            if (importTables.includes(fk.REFERENCED_TABLE_NAME)) {
              const mapped = idMaps.get(fk.REFERENCED_TABLE_NAME)?.get(Number(raw));
              if (!mapped) throw new Error(`Referência não mapeada: ${table}.${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}#${raw}`);
              payload[fk.COLUMN_NAME] = mapped;
            }
          }
          if (table === 'users') {
            const email = String(payload.email || '').trim().toLowerCase();
            const [accRows] = await target.query<RowDataPacket[]>('SELECT id,password_hash FROM accounts WHERE email=? LIMIT 1', [email]);
            if (accRows[0]) payload.password_hash = accRows[0].password_hash;
          }
          const keys = Object.keys(payload); const [insertResult] = await target.execute<any>(`INSERT INTO ${ident(table)} (${keys.map(ident).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map(k => payload[k]));
          const newId = Number(insertResult.insertId); if (Number.isFinite(oldId) && newId) map.set(oldId, newId); rowsProcessed += 1;
          if (table === 'users') {
            const email = String(payload.email || '').trim().toLowerCase();
            let [accRows] = await target.query<RowDataPacket[]>('SELECT id,password_hash FROM accounts WHERE email=? LIMIT 1', [email]);
            let accountId = Number(accRows[0]?.id || 0);
            if (!accountId) {
              const [accountInsert] = await target.execute<any>('INSERT INTO accounts (name,email,password_hash,status,created_at,updated_at) VALUES (?,?,?,\'active\',NOW(),NOW())', [payload.name, email, payload.password_hash]);
              accountId = Number(accountInsert.insertId);
            }
            await target.execute('INSERT INTO company_memberships (account_id,company_id,user_id,status,created_at,updated_at) VALUES (?,?,?,\'active\',NOW(),NOW()) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),status=\'active\',updated_at=NOW()', [accountId, companyId, newId]);
          }
        }
      }
      for (const item of deferred) {
        const newId = idMaps.get(item.table)?.get(item.id); const newRef = idMaps.get(item.refTable)?.get(item.oldRef);
        if (newId && newRef) await target.execute(`UPDATE ${ident(item.table)} SET ${ident(item.column)}=? WHERE id=? AND company_id=?`, [newRef, newId, companyId]);
      }
      await target.commit();
    } catch (error) { await target.rollback(); throw error; }
    return { rowsProcessed, tables: ordered.length };
  } finally {
    await source.end().catch(() => undefined); await target.end().catch(() => undefined);
    await admin.query(`DROP DATABASE IF EXISTS ${ident(tempDb)}`).catch(() => undefined); await admin.end().catch(() => undefined);
  }
};
