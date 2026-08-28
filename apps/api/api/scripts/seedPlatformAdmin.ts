import readline from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import bcrypt from 'bcrypt';
import { sequelize } from '../config/database.js';
import { connectDatabase } from '../models/index.js';
import { PlatformUser } from '../models/PlatformUser.js';

const PASSWORD_POLICY_MESSAGE = 'Use de 8 a 72 caracteres, incluindo letra maiúscula, minúscula e número.';

const validatePassword = (password: string) => {
  if (
    password.length < 8 ||
    password.length > 72 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    throw new Error(PASSWORD_POLICY_MESSAGE);
  }
};

const readHidden = (label: string): Promise<string> => {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('Este comando precisa ser executado em um terminal interativo.');
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const previousRawMode = input.isRaw;

    const cleanup = () => {
      input.off('keypress', onKeypress);
      input.setRawMode(previousRawMode ?? false);
      input.pause();
    };

    const onKeypress = (text: string, key: readline.Key) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        output.write('\n');
        reject(new Error('Operação cancelada.'));
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        output.write('\n');
        resolve(value);
        return;
      }

      if (key.name === 'backspace') {
        if (value.length > 0) {
          value = value.slice(0, -1);
          output.write('\b \b');
        }
        return;
      }

      if (!key.ctrl && !key.meta && text) {
        value += text;
        output.write('*');
      }
    };

    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    input.on('keypress', onKeypress);
    output.write(label);
  });
};

const readIdentity = async () => {
  const terminal = createInterface({ input, output });

  try {
    const name = (await terminal.question('Nome do administrador: ')).trim();
    const email = (await terminal.question('E-mail: ')).trim().toLowerCase();

    if (name.length < 2) {
      throw new Error('Informe um nome válido para o administrador.');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Informe um e-mail válido.');
    }

    return { name, email };
  } finally {
    terminal.close();
  }
};

const run = async () => {
  console.log('\nN3xTime — criação do administrador da plataforma\n');

  const { name, email } = await readIdentity();
  const password = await readHidden('Senha: ');
  const passwordConfirmation = await readHidden('Confirme a senha: ');

  if (password !== passwordConfirmation) {
    throw new Error('As senhas não coincidem.');
  }

  validatePassword(password);
  await connectDatabase();

  const existingUser = await PlatformUser.findOne({ where: { email } });
  if (existingUser) {
    throw new Error(`Já existe um administrador da plataforma com o e-mail ${email}.`);
  }

  const user = await PlatformUser.create({
    name,
    email,
    password_hash: await bcrypt.hash(password, 12),
    status: 'active',
  });

  console.log(`\nAdministrador da plataforma ${user.email} criado com sucesso.`);
};

run()
  .catch((error) => {
    console.error(`\nErro: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await sequelize.close();
    } catch {
      // A conexão pode não ter sido aberta quando a validação falhar antes do acesso ao banco.
    }
  });
