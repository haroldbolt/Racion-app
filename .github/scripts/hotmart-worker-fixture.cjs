const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { Miniflare } = require(process.env.MINIFLARE_PATH || 'miniflare');

const emulator = 'http://127.0.0.1:9099';
const billing = 'http://127.0.0.1:4209';
const key = 'fixture-only';
const project = 'demo-racion';
const checkout = 'https://pay.hotmart.com/M123TEST?off=muse';
const hottok = 'local-hottok-qa';

async function emailAction(email, action) {
  const deadline = Date.now() + 8000;
  do {
    const codes = await fetch(emulator + '/emulator/v1/projects/' + project + '/oobCodes');
    assert.equal(codes.status, 200);
    const code = (await codes.json()).oobCodes.filter(value => value.email === email && value.requestType === action).at(-1);
    if (code?.oobCode) return code.oobCode;
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw new Error('Firebase Auth Emulator did not issue ' + action);
}

// Only this test bundle can ask the loopback Firebase Auth emulator to validate an unsigned emulator token.
// The deployable Worker keeps its normal signed Firebase identity verifier.
async function checkTestIdentity(request) {
  const idToken = await request.text();
  const response = await fetch(emulator + '/identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + key, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({idToken}),
  });
  if (!response.ok) return new Response(null, {status:401});
  const user = (await response.json()).users?.[0];
  if (!user?.localId || !user.email?.endsWith('@example.invalid')) return new Response(null, {status:401});
  const token = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
  return Response.json({uid:user.localId, email:user.email, emailVerified:user.emailVerified === true && token.email_verified === true});
}

async function startBillingFixture(frontend) {
  const bundle = await build({
    stdin:{contents:`
      import { handleBilling } from './workers/billing/http.ts';
      export { BillingAccount } from './workers/billing/account.ts';
      export default { fetch(request, env) {
        return handleBilling(request, env, async token => {
          const response = await env.TEST_IDENTITY.fetch('https://emulator.local/verify', {method:'POST',body:token});
          if (!response.ok) throw new Error('Test session rejected');
          return response.json();
        });
      } };
    `, resolveDir:process.cwd()},
    write:false, bundle:true, platform:'browser', format:'esm', external:['cloudflare:workers'],
  });
  const worker = new Miniflare({
    host:'127.0.0.1', port:4209, modules:true, name:'racion-billing-test', script:bundle.outputFiles[0].text,
    compatibilityDate:'2025-10-01', cf:false,
    bindings:{ALLOWED_ORIGINS:frontend, FIREBASE_PROJECT_ID:project, HOTMART_CHECKOUT_URL:checkout,
      HOTMART_PRODUCT_ID:'1234', HOTMART_OFFER_CODE:'muse', HOTMART_HOTTOK:hottok},
    durableObjects:{BILLING_ACCOUNTS:{className:'BillingAccount', useSQLite:true}},
    serviceBindings:{TEST_IDENTITY:checkTestIdentity},
  });
  await worker.ready;
  return worker;
}

async function notify(email, transaction, event, status) {
  const id = require('node:crypto').randomUUID();
  const body = {id, version:'2.0.0', event, creation_date:Date.now(), data:{
    product:{id:1234}, buyer:{email}, purchase:{transaction, status, offer:{code:'muse'},
      original_offer_price:{value:25,currency_value:'USD'}, price:{value:25,currency_value:'USD'}},
  }};
  const response = await fetch(billing + '/api/billing/webhook', {
    method:'POST', headers:{'Content-Type':'application/json','X-HOTMART-HOTTOK':hottok}, body:JSON.stringify(body),
  });
  assert.ok(response.ok, 'The Worker must accept the authenticated fixture event ' + event + ' (HTTP ' + response.status + ')');
}

async function verifyEmail(email) {
  const oobCode = await emailAction(email, 'VERIFY_EMAIL');
  const response = await fetch(emulator + '/identitytoolkit.googleapis.com/v1/accounts:update?key=' + key, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({oobCode}),
  });
  assert.equal(response.status, 200, 'The Auth emulator must verify the test address');
}

async function resetPassword(email, newPassword) {
  const oobCode = await emailAction(email, 'PASSWORD_RESET');
  const response = await fetch(emulator + '/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=' + key, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({oobCode,newPassword}),
  });
  assert.equal(response.status, 200, 'The Auth emulator must redeem the recovery code for the buyer');
}

module.exports = { billing, checkout, emulator, key, project, startBillingFixture, notify, verifyEmail, resetPassword };
