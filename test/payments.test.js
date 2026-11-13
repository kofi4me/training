import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createLabServer } from '../server.js';
import { createFileRecordStore } from '../record-store.js';
import { bank } from '../assessment-core.js';
import { assessmentAccountKey } from '../assessment-access.js';

test('the hosted payment belongs to one learner and unlocks a server-graded certificate', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'kn-payment-'));
  const origin = 'https://www.example.test';
  const basePath = '/training';
  const key = 'ab'.repeat(64);
  const settings = {
    NETWORK_LAB_DATA_DIR: directory, NETWORK_LAB_PUBLIC_ORIGIN: origin,
    AUTHORIZE_NET_MODE: 'sandbox', AUTHORIZE_NET_API_LOGIN_ID: 'sandbox-test-id',
    AUTHORIZE_NET_TRANSACTION_KEY: 'sandbox-test-key', AUTHORIZE_NET_SIGNATURE_KEY: key,
  };
  const previous = Object.fromEntries(Object.keys(settings).map(name => [name, process.env[name]]));
  Object.assign(process.env, settings);
  const originalFetch = globalThis.fetch;
  let invoice, transaction, checkouts = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://apitest.authorize.net/xml/v1/request.api');
    const request = JSON.parse(options.body);
    let reply;
    if (request.getMerchantDetailsRequest) reply = { isTestMode: false, currencies: ['USD'] };
    else if (request.getHostedPaymentPageRequest) {
      const hosted = request.getHostedPaymentPageRequest;
      const input = hosted.transactionRequest;
      assert.equal(input.amount, input.order.description.includes('Retake') ? '20.00' : '25.00');
      assert.equal(input.transactionType, 'authCaptureTransaction');
      invoice = input.order.invoiceNumber;
      checkouts++;
      if (input.order.description.includes('DNS Operations')) {
        const options = JSON.parse(hosted.hostedPaymentSettings.setting.find(item => item.settingName === 'hostedPaymentReturnOptions').settingValue);
        assert.equal(options.url, origin + basePath + '/assessment.html?course=dns&payment=returned');
        assert.equal(options.cancelUrl, origin + basePath + '/assessment.html?course=dns');
      }
      reply = { token: 'sandbox-hosted-checkout-token' };
    } else {
      const transId = request.getTransactionDetailsRequest.transId;
      assert.ok(['123456', '234567', '345678'].includes(transId));
      reply = { transaction: transId === transaction?.transId ? transaction : null };
    }
    return Response.json({ messages: { resultCode: 'Ok' }, ...reply });
  };
  const server = createLabServer({ production: true, origin, basePath, proxy: '127.0.0.1' });
  try {
    const records = createFileRecordStore(directory);
    const addLearner = async (letter, email) => {
      const id = letter.repeat(64), cookie = (letter === 'a' ? '1' : '2').repeat(64);
      const session = createHash('sha256').update(cookie).digest('hex');
      await records.write('account-' + id + '.json', { id, email, name: 'Test Learner', courses: {}, activity: [] });
      await records.write('login-' + session + '.json', { accountId: id, expires: Date.now() + 600000 });
      return 'kn_login=' + cookie;
    };
    const alice = await addLearner('a', 'alice@example.test');
    const bob = await addLearner('b', 'bob@example.test');
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const requestPath = (route, { cookie = alice, body, headers = {} } = {}) => new Promise((resolve, reject) => {
      const outgoing = request({
        hostname: '127.0.0.1', port: server.address().port, path: route,
        method: body === undefined ? 'GET' : 'POST',
        headers: { Host: new URL(origin).host, Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', ...headers },
      }, incoming => {
        const chunks = [];
        incoming.on('data', chunk => chunks.push(chunk));
        incoming.on('end', () => resolve(new Response(Buffer.concat(chunks), {
          status: incoming.statusCode, headers: incoming.headers,
        })));
        incoming.on('error', reject);
      });
      outgoing.on('error', reject);
      outgoing.end(body);
    });
    const call = (route, options) => requestPath(basePath + route, options);
    const landing = await call('/');
    assert.match(await landing.text(), /KryptNet Training Labs/);
    const systems = await call('/systems.html?course=linux');
    assert.match(await systems.text(), /src="systems.js"/);
    for (const file of ['systems.js', 'systems-labs.js', 'systems-models.js']) {
      assert.equal((await call('/' + file)).status, 200);
    }
    const linuxAssessment = await call('/api/assessment?course=linux');
    assert.equal(linuxAssessment.status, 200);
    const linux = await linuxAssessment.json();
    assert.equal(linux.course.title, 'Linux Server Administration');
    assert.equal(linux.payment.amount, '25.00');
    assert.equal(linux.attempt, null);
    assert.equal((await call('/health/ready')).status, 200);
    assert.equal((await requestPath('/api/account')).status, 404);
    assert.equal((await requestPath('/training?open=1')).headers.get('location'), '/training/?open=1');
    const register = JSON.stringify({ name: 'Test Learner', email: 'alice@example.test', confirmed: true });
    assert.equal((await call('/api/register', { body: register })).status, 402);
    assert.equal((await call('/api/payments/checkout', { cookie: '', body: '{}' })).status, 401);
    const checkout = await call('/api/payments/checkout', { body: '{}' });
    assert.match(checkout.headers.get('content-security-policy'), /form-action 'self' https:\/\/test\.authorize\.net/);
    assert.deepEqual(await checkout.json(), {
      action: 'https://test.authorize.net/payment/payment', token: 'sandbox-hosted-checkout-token',
    });
    const aliceInvoice = invoice;
    await call('/api/payments/checkout', { body: '{}' });
    assert.equal(checkouts, 1);
    await call('/api/payments/checkout', { body: '{}', cookie: bob });
    transaction = {
      transId: '123456', order: { invoiceNumber: aliceInvoice }, transactionType: 'authCaptureTransaction',
      transactionStatus: 'capturedPendingSettlement', responseCode: 1, settleAmount: 24.99,
    };
    const body = JSON.stringify({ eventType: 'net.authorize.payment.authcapture.created', payload: { entityName: 'transaction', id: '123456' } });
    const notify = signature => call('/api/payments/authorize-net/webhook', { cookie: '', body, headers: { 'X-ANET-Signature': signature } });
    assert.equal((await notify('sha512=' + '0'.repeat(128))).status, 403);
    const signature = 'sha512=' + createHmac('sha512', Buffer.from(key, 'hex')).update(body).digest('hex');
    assert.equal((await notify(signature)).status, 200);
    assert.equal((await (await call('/api/assessment')).json()).payment.paid, false);
    transaction.settleAmount = 25;
    transaction.transactionStatus = 'underReview';
    assert.equal((await notify(signature)).status, 200);
    assert.equal((await call('/api/register', { body: register })).status, 402);
    transaction.transactionStatus = 'capturedPendingSettlement';
    const stolen = await call('/api/payments/confirm', { cookie: bob, body: '{"transactionId":"123456"}' });
    assert.deepEqual(await stolen.json(), { paid: false });
    assert.equal((await notify(signature)).status, 200);
    assert.equal((await notify(signature)).status, 200);
    assert.equal((await (await call('/api/assessment', { cookie: bob })).json()).payment.paid, false);
    assert.equal((await (await call('/api/assessment')).json()).payment.paid, true);
    const registered = await call('/api/register', { body: register });
    assert.equal(registered.status, 201);
    const { attempt } = await registered.json();
    const correct = Object.fromEntries(attempt.questions.map(({id}) => [id, bank.find(question => question.id === id).answer]));
    const wrong = Object.fromEntries(attempt.questions.map(({ id, type, options }) => {
      const answer = correct[id];
      return [id, type === 'number' ? String(Number(answer) + 1) : (answer + 1) % options.length];
    }));
    const failure = await call('/api/submit', { body: JSON.stringify({ attemptId: attempt.id, answers: wrong }) });
    assert.equal(failure.status, 200);
    assert.equal((await failure.json()).credential, null);
    const retake = (await (await call('/api/retake', { body: '{}' })).json()).attempt;
    const answers = Object.fromEntries(retake.questions.map(({ id, type }) => {
      const answer = bank.find(question => question.id === id).answer;
      return [id, type === 'number' ? String(answer) : answer];
    }));
    const result = await call('/api/submit', { body: JSON.stringify({ attemptId: retake.id, answers }) });
    const passed = await result.json();
    assert.equal(result.status, 200, JSON.stringify(passed));
    assert.equal(passed.credential.score, 100);
    assert.match(passed.credential.id, /^KN-/);

    assert.equal((await call('/course-assessments.js')).status, 404);
    const dnsCall = (route, data) => call(route + '?course=dns', {
      body: data === undefined ? undefined : JSON.stringify(data),
      headers: { 'X-Real-IP': '192.0.2.20' },
    });
    const unpaid = await (await dnsCall('/api/assessment')).json();
    assert.equal(unpaid.payment.paid, false);
    assert.equal(unpaid.payment.amount, '25.00');
    assert.equal(unpaid.course.passMark, 75);
    assert.equal(unpaid.attempt, null);
    assert.equal((await dnsCall('/api/register', JSON.parse(register))).status, 402);
    assert.equal((await dnsCall('/api/payments/checkout', {})).status, 200);
    assert.notEqual(invoice, aliceInvoice);
    const wrongCourse = await dnsCall('/api/payments/confirm', { transactionId: '123456' });
    assert.deepEqual(await wrongCourse.json(), { paid: false });
    transaction = { ...transaction, transId: '234567', order: { invoiceNumber: invoice } };
    assert.deepEqual(await (await dnsCall('/api/payments/confirm', { transactionId: '234567' })).json(), { paid: true });
    const dnsRegistration = await dnsCall('/api/register', JSON.parse(register));
    assert.equal(dnsRegistration.status, 201);
    const guided = (await dnsRegistration.json()).attempt;
    const configuration = { wait: '1', authority: true };
    assert.equal(guided.questions, undefined);
    assert.equal((await dnsCall('/api/submit', { attemptId: guided.id, configuration })).status, 400);
    const submitDNS = async (attempt, pass) => {
      const guidedResponse = await dnsCall('/api/guided', { attemptId: attempt.id, configuration });
      assert.equal(guidedResponse.status, 200);
      const exam = (await guidedResponse.json()).attempt;
      const causesByFault = exam.scenario.fields.some(field => field.key === 'wait' && field.value === '0')
        ? 'The resolver still' : 'The authoritative server cannot';
      return dnsCall('/api/submit', {
        attemptId: exam.id, configuration: pass ? configuration : { ...configuration, wait: '0' },
        answers: ['TTL', 'AAAA', 'The queried name does not exist'],
        cause: exam.causes.find(option => option.startsWith(causesByFault)),
        evidence: exam.evidence.find(option => option.startsWith('The A query')),
      });
    };
    const firstDNS = await (await submitDNS(guided, false)).json();
    assert.equal(firstDNS.credential, null);
    assert.deepEqual(firstDNS.retry, { kind: 'included', number: 2 });
    assert.equal((await dnsCall('/api/payments/checkout', {})).status, 409);
    const includedDNS = (await (await dnsCall('/api/retake', {})).json()).attempt;
    const failedDNS = await (await submitDNS(includedDNS, false)).json();
    assert.equal(failedDNS.retry.kind, 'cooldown');
    assert.equal(failedDNS.retry.number, 3);
    assert.ok(Date.parse(failedDNS.retry.availableAt) > Date.now());
    assert.equal((await dnsCall('/api/retake', {})).status, 409);
    assert.equal((await dnsCall('/api/payments/checkout', {})).status, 409);
    await records.update(assessmentAccountKey('a'.repeat(64), 'dns') + '.json', state => {
      state.attempt.submittedAt = new Date(Date.now() - 28 * 86400000).toISOString();
      return state;
    });
    const eligibleDNS = await (await dnsCall('/api/assessment')).json();
    assert.equal(eligibleDNS.retry.kind, 'paid-retake');
    assert.equal(eligibleDNS.retry.payment.amount, '20.00');
    assert.equal(eligibleDNS.retry.payment.paid, false);
    assert.equal((await dnsCall('/api/retake', {})).status, 402);
    const previousInvoice = invoice;
    assert.equal((await dnsCall('/api/payments/checkout', {})).status, 200);
    assert.notEqual(invoice, previousInvoice);
    assert.deepEqual(await (await dnsCall('/api/payments/confirm', { transactionId: '234567' })).json(), { paid: false });
    transaction = { ...transaction, transId: '345678', order: { invoiceNumber: invoice }, settleAmount: 19.99 };
    assert.deepEqual(await (await dnsCall('/api/payments/confirm', { transactionId: '345678' })).json(), { paid: false });
    transaction.settleAmount = 20;
    assert.deepEqual(await (await dnsCall('/api/payments/confirm', { transactionId: '345678' })).json(), { paid: true });
    const competingStarts = await Promise.all([dnsCall('/api/retake', {}), dnsCall('/api/retake', {})]);
    assert.deepEqual(competingStarts.map(response => response.status).sort(), [200, 409]);
    const paidAttempt = (await competingStarts.find(response => response.ok).json()).attempt;
    const examResponse = await submitDNS(paidAttempt, true);
    const resultDNS = await examResponse.json();
    assert.equal(examResponse.status, 200, JSON.stringify(resultDNS));
    assert.equal(resultDNS.credential.score, 100);
    assert.equal(resultDNS.credential.courseTitle, 'DNS Operations');
    assert.notEqual(resultDNS.credential.id, passed.credential.id);
    assert.equal((await dnsCall('/api/retake', {})).status, 409);
    assert.equal((await call('/api/certificate?course=dhcp')).status, 401);
    const pdf = await dnsCall('/api/certificate');
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    const bytes = Buffer.from(await pdf.arrayBuffer());
    assert.match(bytes.toString('latin1'), /KryptNet Professional Certificate - DNS Operations/);
    const verified = await (await call('/api/verify/' + resultDNS.credential.id, { cookie: '' })).json();
    assert.equal(verified.course, 'DNS Operations');
    assert.equal(verified.sha256, createHash('sha256').update(bytes).digest('hex'));
    const learner = (await (await call('/api/account')).json()).account;
    assert.equal(learner.courses.dns.certificateId, resultDNS.credential.id);
    assert.equal(learner.courses.network.certificateId, passed.credential.id);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (server.listening) await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});
