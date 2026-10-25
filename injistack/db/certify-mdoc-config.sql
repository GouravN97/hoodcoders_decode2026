-- certify-mdoc (Certify's mock mDoc issuance): one mso_mdoc configuration, the ISO mDL that
-- MDocMockVCIssuancePlugin issues. Replaces the Farmer configurations copied from certify_init.sql.
-- did_url, key_manager_* and signature_* are required columns; the mock plugin signs with its own
-- issuer key (mosip.certify.mock.mdoc.issuer-key-cert) and ignores them.
DELETE FROM certify.credential_config;
INSERT INTO certify.credential_config (credential_config_key_id, config_id, status, vc_template, doctype, sd_jwt_vct, context, credential_type, credential_format, did_url, key_manager_app_id, key_manager_ref_id, signature_algo, signature_crypto_suite, sd_claim, display, display_order, scope, cryptographic_binding_methods_supported, credential_signing_alg_values_supported, proof_types_supported, credential_subject, sd_jwt_claims, mso_mdoc_claims, plugin_configurations, credential_status_purpose, qr_settings, qr_signature_algo, cr_dtimes, upd_dtimes)
VALUES ('MockMDL', gen_random_uuid()::text, 'active', NULL, 'org.iso.18013.5.1.mDL', NULL, NULL, NULL, 'mso_mdoc', 'did:web:certify-mdoc.invalid', 'CERTIFY_VC_SIGN_EC_R1', 'EC_SECP256R1_SIGN', 'ES256', 'EcdsaSecp256r1Signature2019', NULL,
  '[{"logo": null, "name": "Mobile driving licence (Certify mock mDoc)", "locale": "en", "text_color": "#FFFFFF", "background_color": "#12107c", "background_image": null}]',
  '{family_name,given_name,birth_date,issuing_country,document_number,driving_privileges}',
  'mock_mdl', '{cose_key}', '{ES256}',
  '{"jwt": {"proof_signing_alg_values_supported": ["ES256"]}}',
  NULL, NULL,
  '{"org.iso.18013.5.1": {"family_name": {"display": [{"name": "Family name", "locale": "en"}]}, "given_name": {"display": [{"name": "Given name", "locale": "en"}]}, "birth_date": {"display": [{"name": "Birth date", "locale": "en"}]}, "issuing_country": {"display": [{"name": "Issuing country", "locale": "en"}]}, "document_number": {"display": [{"name": "Document number", "locale": "en"}]}, "driving_privileges": {"display": [{"name": "Driving privileges", "locale": "en"}]}}}',
  NULL, NULL, NULL, NULL, NOW(), NULL);
