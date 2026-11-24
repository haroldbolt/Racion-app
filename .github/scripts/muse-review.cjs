const assert = require('node:assert/strict');

const museReviewOrigin = 'https://muse.racion-app.pages.dev';

function museBrowserOptions(url) {
  if (url.origin !== museReviewOrigin) return {};
  const username = process.env.MUSE_REVIEW_USERNAME;
  const password = process.env.MUSE_REVIEW_PASSWORD;
  assert.ok(username && password, 'Set MUSE_REVIEW_USERNAME and MUSE_REVIEW_PASSWORD for the protected Muse review');
  return { httpCredentials: { origin: museReviewOrigin, username, password } };
}

async function verifyReviewPage(page, url) {
  if (new URL(url).origin !== museReviewOrigin) return;
  assert.equal(new URL(page.url()).origin, museReviewOrigin);
  const expectedSha = process.env.MUSE_REVIEW_SHA;
  assert.match(expectedSha || '', /^[a-f0-9]{40}$/i, 'Provide the full deployed review SHA in MUSE_REVIEW_SHA');
  assert.equal(await page.locator('meta[name="racion-release"]').getAttribute('content'), expectedSha);
  await page.locator('header').getByText('Revisión Muse · Sin cobros', { exact: true }).waitFor();
}

module.exports = { museReviewOrigin, museBrowserOptions, verifyReviewPage };
