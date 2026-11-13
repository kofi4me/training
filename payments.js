import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { assessmentPolicy, courseLabels } from './course-catalog.js';
import { assessmentAccountKey, nextAssessment } from './assessment-access.js';

const environments = {
  sandbox: { api: 'https://apitest.authorize.net/xml/v1/request.api', checkout: 'https://test.authorize.net/payment/payment' },
  production: { api: 'https://api.authorize.net/xml/v1/request.api', checkout: 'https://accept.authorize.net/payment/payment' },
};
const captureEvents = new Set([
  'net.authorize.payment.authcapture.created',
  'net.authorize.payment.fraud.approved',
]);
const paidStatuses = new Set(['capturedPendingSettlement', 'settledSuccessfully']);
const validTransactionId = id => typeof id === 'string' && /^[1-9][0-9]{0,19}$/.test(id);
const recordKey = value => createHash('sha256').update(value).digest('hex') + '.json';
const paymentError = (status, message) => Object.assign(new Error(message), { status });

function cents(amount) {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(String(amount));
  if (!match) return 0;
  return Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw paymentError(413, 'Payment request is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function parseJSON(bytes) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw paymentError(400, 'Invalid payment request.'); }
}

export function createPayments(records, config, env = process.env, request = fetch) {
  const mode = env.AUTHORIZE_NET_MODE || '';
  const gateway = Object.hasOwn(environments, mode) ? environments[mode] : null;
  const required = config.production || Boolean(mode);
  const { currency, initialPriceCents, additionalPriceCents } = assessmentPolicy;
  const price = number => number === 1 ? initialPriceCents : additionalPriceCents;
  const login = env.AUTHORIZE_NET_API_LOGIN_ID;
  const transactionKey = env.AUTHORIZE_NET_TRANSACTION_KEY;
  const signatureKey = env.AUTHORIZE_NET_SIGNATURE_KEY || '';
  const enabled = Boolean(gateway && config.origin?.startsWith('https://') &&
    login && transactionKey && /^[a-f0-9]{128}$/i.test(signatureKey));
  const enrollmentKey = (accountId, courseId, number) => {
    const prefix = `authorize-net:${mode}:${courseId}:${accountId}`;
    return recordKey(number === 1 ? prefix : prefix + ':attempt:' + number);
  };
  const invoiceKey = invoice => recordKey(`authorize-net:${mode}:invoice:${invoice}`);

  async function gatewayCall(operation, fields = {}) {
    let result;
    try {
      const response = await request(gateway.api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [operation]: { merchantAuthentication: { name: login, transactionKey }, ...fields } }),
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Gateway HTTP error');
      result = await response.json();
    } catch {
      throw paymentError(502, 'Authorize.Net is temporarily unavailable. Please try again.');
    }
    if (result.messages?.resultCode !== 'Ok') {
      throw paymentError(502, 'Authorize.Net could not process this request. Contact KryptNet if it persists.');
    }
    return result;
  }

  async function status(account, courseId = 'network', number = 1) {
    if (!required) return { required: false, paid: false, enabled: false };
    const record = gateway && account ? await records.read(enrollmentKey(account.id, courseId, number)) : null;
    return {
      required: true,
      enabled,
      paid: Boolean(record?.transactionId),
      amount: ((record?.amount ?? price(number)) / 100).toFixed(2),
      currency: record?.currency ?? currency,
      sandbox: mode === 'sandbox',
    };
  }

  async function start(account, courseId, number) {
    const key = enrollmentKey(account.id, courseId, number);
    const assessmentUrl = new URL((config.basePath || '') + '/assessment.html', config.origin);
    if (courseId !== 'network') assessmentUrl.searchParams.set('course', courseId);
    const returnUrl = new URL(assessmentUrl);
    returnUrl.searchParams.set('payment', 'returned');
    const enrollment = await records.update(key, async current => {
      if (current?.transactionId || current?.expiresAt > Date.now() + 30000) return current;
      const merchant = await gatewayCall('getMerchantDetailsRequest');
      if (merchant.isTestMode !== false || merchant.currencies?.length !== 1 || merchant.currencies[0] !== currency) {
        throw paymentError(503, 'KryptNet must verify the Authorize.Net merchant currency and processing mode.');
      }
      const invoice = current?.invoice || 'KN' + randomBytes(9).toString('hex').toUpperCase();
      const expectedAmount = current?.amount ?? price(number);
      const expectedCurrency = current?.currency ?? currency;
      if (expectedCurrency !== currency) throw paymentError(409, 'Contact KryptNet about your existing payment request.');
      const settings = {
        hostedPaymentReturnOptions: {
          showReceipt: true, url: returnUrl.href,
          urlText: 'Return to assessment', cancelUrl: assessmentUrl.href, cancelUrlText: 'Cancel',
        },
        hostedPaymentPaymentOptions: { showCreditCard: true, showBankAccount: false, cardCodeRequired: true },
      };
      const result = await gatewayCall('getHostedPaymentPageRequest', {
        refId: invoice,
        transactionRequest: {
          transactionType: 'authCaptureTransaction',
          amount: (expectedAmount / 100).toFixed(2),
          order: { invoiceNumber: invoice, description: 'KryptNet ' + courseLabels[courseId] + (number === 1 ? ' Assessment' : ' Assessment Retake ' + (number - 1)) },
          transactionSettings: { setting: [{ settingName: 'duplicateWindow', settingValue: '900' }] },
        },
        hostedPaymentSettings: { setting: Object.entries(settings).map(([settingName, value]) => ({
          settingName, settingValue: JSON.stringify(value),
        })) },
      });
      if (typeof result.token !== 'string' || !result.token || result.token.length > 16384) {
        throw paymentError(502, 'Authorize.Net did not return a usable checkout token.');
      }
      await records.write(invoiceKey(invoice), { enrollment: key });
      return { invoice, amount: expectedAmount, currency: expectedCurrency, token: result.token, expiresAt: Date.now() + 14 * 60000 };
    });
    if (enrollment.transactionId) return { paid: true };
    return { action: gateway.checkout, token: enrollment.token };
  }

  async function confirm(transactionId, expectedInvoice) {
    const { transaction } = await gatewayCall('getTransactionDetailsRequest', { transId: transactionId });
    const invoice = transaction?.order?.invoiceNumber;
    if (String(transaction?.transId) !== transactionId || !/^KN[A-F0-9]{18}$/.test(invoice || '') ||
        (expectedInvoice && invoice !== expectedInvoice)) return false;
    const mapping = await records.read(invoiceKey(invoice));
    if (!mapping) return false;
    const updated = await records.update(mapping.enrollment, enrollment => {
      if (!enrollment || enrollment.invoice !== invoice) return null;
      if (enrollment.transactionId) {
        if (enrollment.transactionId !== transactionId) console.warn(JSON.stringify({ event: 'training_duplicate_capture', invoice, transactionId }));
        return enrollment;
      }
      if (transaction.transactionType !== 'authCaptureTransaction' || String(transaction.responseCode) !== '1' ||
          !paidStatuses.has(transaction.transactionStatus) ||
          cents(transaction.settleAmount) !== enrollment.amount ||
          (transaction.currencyCode && transaction.currencyCode !== enrollment.currency)) return enrollment;
      const { token, expiresAt, ...order } = enrollment;
      return { ...order, transactionId, confirmedAt: new Date().toISOString() };
    });
    return updated?.transactionId === transactionId;
  }

  async function route(req, res, pathname, account) {
    const json = (statusCode, body) => {
      res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    try {
      if (!enabled) throw paymentError(503, 'Assessment payments are not available yet.');
      if (req.method !== 'POST') throw paymentError(405, 'Use POST.');
      if (pathname === '/api/payments/authorize-net/webhook') {
        const raw = await readBody(req, 16000);
        const signature = /^sha512=([a-f0-9]{128})$/i.exec(req.headers['x-anet-signature'] || '');
        const expected = createHmac('sha512', Buffer.from(signatureKey, 'hex')).update(raw).digest();
        if (!signature || !timingSafeEqual(expected, Buffer.from(signature[1], 'hex'))) {
          throw paymentError(403, 'Invalid payment notification signature.');
        }
        const event = parseJSON(raw);
        const transactionId = event?.payload?.id;
        if (captureEvents.has(event?.eventType) && event.payload?.entityName === 'transaction' && validTransactionId(transactionId)) {
          await confirm(transactionId);
        }
        return json(200, { received: true });
      }
      if (!account) throw paymentError(401, 'Sign in before paying for an assessment.');
      if (req.headers.origin !== config.origin) throw paymentError(403, 'A same-origin request is required.');
      const courseId = new URL(req.url, config.origin).searchParams.get('course') ?? 'network';
      if (!Object.hasOwn(courseLabels, courseId)) throw paymentError(404, 'Assessment course not found.');
      if (!['/api/payments/checkout', '/api/payments/confirm'].includes(pathname)) throw paymentError(404, 'Unknown payment endpoint.');
      const state = await records.read(assessmentAccountKey(account.id, courseId) + '.json');
      const stage = nextAssessment(state);
      const initial = stage.kind === 'complete' ? null : await status(account, courseId);
      const next = initial && !initial.paid ? { kind: 'initial', number: 1 } : stage;
      if (next.kind === 'cooldown') throw paymentError(409, 'The four-week waiting period is still active.');
      if (!['initial', 'paid-retake'].includes(next.kind)) throw paymentError(409, 'No assessment payment is due.');
      if (pathname === '/api/payments/checkout') return json(200, await start(account, courseId, next.number));
      if (pathname === '/api/payments/confirm') {
        const body = parseJSON(await readBody(req, 512));
        const enrollment = await records.read(enrollmentKey(account.id, courseId, next.number));
        if (!enrollment?.invoice || !validTransactionId(body?.transactionId)) {
          throw paymentError(400, 'Enter the transaction ID from your Authorize.Net receipt.');
        }
        const paid = await confirm(body.transactionId, enrollment.invoice);
        return json(200, { paid });
      }
    } catch (error) {
      if (!error.status) console.error('{"event":"training_payment_error"}');
      return json(error.status || 503, { error: error.status ? error.message : 'Payment verification is temporarily unavailable.' });
    }
  }

  return { checkoutOrigin: enabled ? new URL(gateway.checkout).origin : '', status, route };
}
