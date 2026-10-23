import assert from 'node:assert/strict';

const lf = text => text.replace(/\r\n/g, '\n');
function describe(text) {
  const withoutPairs = text.replace(/\r\n/g, '');
  return {
    length: text.length,
    crlfPairs: (text.match(/\r\n/g) || []).length,
    bareLf: (withoutPairs.match(/\n/g) || []).length,
    bareCr: (withoutPairs.match(/\r/g) || []).length,
    prefix: text.slice(0, 160),
    suffix: text.length > 160 ? text.slice(-160) : '',
  };
}

/** Compare all approved content, preserving spaces, paragraphs and bare CRs. */
export function assertApprovedMailText(actual, approved) {
  assert.equal(typeof actual, 'string', 'Mailpit must return a decoded text body');
  assert.equal(typeof approved, 'string', 'The approved snapshot must be text');
  const delivered = lf(actual);
  const expected = lf(approved);
  // Pinned n8n uses Nodemailer 8.0.10. MimeNode pipes LastNewline, whose
  // _flush adds CRLF only when the MIME stream does not already end in LF:
  // https://github.com/nodemailer/nodemailer/blob/v8.0.10/lib/mime-node/last-newline.js
  // Permit exactly that one terminal newline, only if the approved text has none.
  const terminalNewline = !expected.endsWith('\n') && delivered === expected + '\n';
  const comparable = terminalNewline ? delivered.slice(0, -1) : delivered;
  const actualDetails = describe(actual);
  const approvedDetails = describe(approved);
  let difference = 0;
  while (difference < Math.min(comparable.length, expected.length) && comparable[difference] === expected[difference]) difference++;
  assert.ok(comparable === expected, 'Full approved body mismatch after SMTP newline handling: ' + JSON.stringify({
    firstDifference: difference, actual: actualDetails, approved: approvedDetails,
  }));
  return {
    actualLength: actual.length, approvedLength: approved.length,
    actualCrlfPairs: actualDetails.crlfPairs, approvedCrlfPairs: approvedDetails.crlfPairs,
    actualBareLf: actualDetails.bareLf, approvedBareLf: approvedDetails.bareLf,
    terminalNewline,
  };
}
