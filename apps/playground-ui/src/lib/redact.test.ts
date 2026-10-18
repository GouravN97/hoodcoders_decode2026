import { describe, expect, it } from 'vitest';
import { mask, redactHeaders, redactText } from './redact';

describe('redact', () => {
  it('keeps the first and last four characters', () => {
    expect(mask('abcdefghijklmnop')).toBe('abcd••••mnop');
    expect(mask('short')).toBe('•••••');
  });

  it('masks secrets in JSON, form and percent-encoded bodies', () => {
    expect(redactText('{"access_token": "eyJhbGciOiJFUzI1NiJ9.payload.sig", "c_nonce": "keep-me"}')).toBe(
      '{"access_token": "eyJh••••.sig", "c_nonce": "keep-me"}',
    );
    expect(redactText('grant_type=x&pre-authorized_code=SECRETCODE1234&tx_code=99')).toBe(
      'grant_type=x&pre-authorized_code=SECR••••1234&tx_code=••••',
    );
    expect(redactText('openid-credential-offer://?credential_offer=%7B%22pre-authorized_code%22%3A%22ABCDEFGHIJKL%22%7D')).toBe(
      'openid-credential-offer://?credential_offer=%7B%22pre-authorized_code%22%3A%22ABCD••••IJKL%22%7D',
    );
  });

  it('leaves bodies without secrets untouched', () => {
    const body = '{"credential_issuer":"https://certify.test","nonce":"abc"}';
    expect(redactText(body)).toBe(body);
    expect(redactText(undefined)).toBeUndefined();
  });

  it('masks authorization and cookie headers but keeps the scheme', () => {
    expect(redactHeaders({ Authorization: 'Bearer eyJhbGciOiJFUzI1NiJ9.x.y', 'content-type': 'application/json', cookie: 'sid=1234567890' })).toEqual({
      Authorization: 'Bearer eyJh••••.x.y',
      'content-type': 'application/json',
      cookie: 'sid=••••7890',
    });
  });
});
