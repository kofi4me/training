import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const mailer = fileURLToPath(new URL('./send-learner-code.py', import.meta.url));

function smtpEnvironment(env) {
  if (!env.TRAINING_SMTP_CONFIG) return env;
  try {
    const settings = JSON.parse(Buffer.from(env.TRAINING_SMTP_CONFIG, 'base64').toString('utf8'));
    const fields = ['HOST', 'PORT', 'SECURITY', 'USER', 'PASSWORD', 'FROM'];
    return { ...env, ...Object.fromEntries(fields.map(field => ['TRAINING_SMTP_' + field, settings[field] || ''])) };
  } catch { return {}; }
}

export function learnerMailConfigured(env) {
  env = smtpEnvironment(env);
  const port = Number(env.TRAINING_SMTP_PORT || '587');
  const security = env.TRAINING_SMTP_SECURITY || 'starttls';
  return Boolean(env.TRAINING_SMTP_HOST && env.TRAINING_SMTP_USER && env.TRAINING_SMTP_PASSWORD &&
    Number.isInteger(port) && port > 0 && port <= 65535 && ['starttls', 'ssl'].includes(security));
}

export function sendLearnerCode(env, message) {
  env = smtpEnvironment(env);
  return new Promise((resolve, reject) => {
    const child = spawn(env.NETWORK_LAB_PYTHON || 'python', [mailer], {
      env,
      stdio: ['pipe', 'ignore', 'ignore'],
      timeout: 12000,
      windowsHide: true,
    });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error('Learner email could not be sent.')));
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(message));
  });
}
